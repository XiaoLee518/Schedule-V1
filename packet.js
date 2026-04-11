// Packet ingestion, baseline UI
// Source: biomonitor_v26.html lines 2639-2925

// ============================================================
// DATA INGESTION — parse BLE packet
// ============================================================
function ingestPacket(raw) {
  const line = raw.trim();
  if(line.startsWith('CALIB_PROG,')){
    const p=line.split(','),pct=parseInt(p[2])>0?Math.min(100,parseInt(p[1])/parseInt(p[2])*100):0;
    const f=document.getElementById('mpCalibFill');if(f)f.style.width=pct+'%';
    if(typeof _mp!=='undefined'){_mp.calibSec=parseInt(p[1]);mpUpdate();}
    return;
  }
  // BASELINE packet — calibration done, show waiting_for_start on main UI
  if (line.startsWith('BASELINE,')) {
    const p = line.split(',');
    S.base.gsr  = parseFloat(p[1]);
    S.base.hr   = parseFloat(p[2]);
    S.base.resp = parseFloat(p[3]);

    // ★ 從前端累積的 calibBuf 帶入 BPM / RPM 基準值
    if (S.calibBuf) {
      const avg = arr => (Array.isArray(arr) && arr.length) ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
      const bpm = avg(S.calibBuf.bpm);
      const rpm = avg(S.calibBuf.rpm);
      if (bpm != null) S.base.bpm  = bpm;
      if (rpm != null) S.base.rpm  = rpm;
    }

    updateBaselineUI();

    // ★ 校正完成後在主控面板顯示完整基準值結果
    _mpShowBaselineResult();

    setPhaseUI('waiting_for_start');
    return;
  }

  // STATUS packet — ESP32 drives all state changes
  if (line.startsWith('STATUS,')) {
    const status = line.split(',')[1];
    if (status === 'WAITING') {
      cancelAnimationFrame(S.timerRaf);
      document.getElementById('mainTimer').textContent = '00:00';
      setPhaseUI('idle');
    } else if (status === 'CALIBRATING') {
      // Clear previous session data
      S.hr = []; S.gsr = []; S.resp = []; S.score = []; _frPeakReset(); _fhPeakReset();
      S.gsrTriggers = 0; S.gsrConsec = 0;
      S.base = { hr: null, gsr: null, resp: null };
      S.startMs = Date.now();
      startTimer();
      setPhaseUI('calibrating');
    } else if (status === 'RUNNING') {
      enterRunning();
    } else if (status === 'WAITING_FOR_START') {
      // ESP32 校正完成，等待前端 BLE START 指令
      setPhaseUI('waiting_for_start');
    } else if (status === 'PAUSED') {
      setPhaseUI('paused');
    } else if (status === 'STOPPED') {
      handleEnd();
    }
    return;
  }

  // END packet
  if (line === 'END') {
    handleEnd();
    return;
  }

  // DATA packet: DATA,sec,gsrRaw,hrRaw,respRaw,BPM,RPM,Score
  if (line.startsWith('DATA,')) {
    const p = line.split(',');
    if (p.length < 8) return;
    const t      = parseFloat(p[1]);
    const gsrRaw = parseInt(p[2]);
    const hrRaw  = parseInt(p[3]);
    const respRaw= parseInt(p[4]);
    let   bpm    = parseFloat(p[5]);
    let   rpm    = parseFloat(p[6]);
    const score  = parseFloat(p[7]);
    if (isNaN(t)) return;

    // ── 前端 RPM fallback（ESP32 送 0 時自動啟用）──────────────
    const feRPM = _frPeakPush(t, respRaw);
    if (!(rpm > 0) && feRPM > 0) rpm = feRPM;

    // ── 前端 BPM fallback（ESP32 送 0 時自動啟用）──────────────
    const feBPM = _fhPeakPush(t, hrRaw);
    if (!(bpm > 0) && feBPM > 0) bpm = feBPM;
    
    // ── v26: Butterworth 濾波 + FFT 驗證 ────────────────────────
    if (FILTER_STATE.enabled && bpm > 0 && S.hr && S.hr.length >= 20) {
      try {
        // 取最近的心率原始數據（至少20個點用於濾波）
        const recentHR = S.hr.slice(-Math.min(256, S.hr.length));
        bpm = applyAdvancedFiltering(recentHR, bpm);
      } catch (e) {
        console.warn('[濾波器錯誤]', e);
      }
    }
    
    // ── v26: Apple Watch 校正係數 ──────────────────────────────
    const bpmRaw = bpm;  // 保留校正前的值
    if (typeof appleWatchCalibCoeff !== 'undefined' && appleWatchCalibCoeff !== 1.0 && bpm > 0) {
      bpm = bpm * appleWatchCalibCoeff;
    }

    // ★ 校正期間：畫到圖表（dataset[2] 半透明），並累積 + 即時顯示基準值
    if (S.phase === 'calibrating') {
      const elapsed = (Date.now() - S.startMs) / 1000;
      if (elapsed <= CFG.calib + 1) {
        if (!S.calibBuf) S.calibBuf = { hr: [], gsr: [], resp: [], bpm: [], rpm: [] };
        S.calibBuf.hr.push(hrRaw);
        S.calibBuf.gsr.push(gsrRaw);
        S.calibBuf.resp.push(respRaw);
        if (bpm > 0) S.calibBuf.bpm.push(bpm);
        if (rpm > 0) S.calibBuf.rpm.push(rpm);

        // ── 即時繪圖到 calib dataset（x = elapsed，正值，和正式量測同軸）
        const ci = 1 / (CFG.chart_rate || 10);
        if (elapsed - (S._lastCalibChartT || -999) >= ci) {
          S._lastCalibChartT = elapsed;
          const pushCalib = (chart, val) => {
            if (!chart) return;
            pushPt(chart.data.datasets[2].data, { x: elapsed, y: val });
            // 動態更新 x 軸範圍讓校正資料可見
            chart.options.scales.x.min = 0;
            chart.options.scales.x.max = Math.max(CFG.calib, elapsed + 2);
            chart.update('none');
          };
          pushCalib(liveCharts.hr,   hrRaw);
          pushCalib(liveCharts.gsr,  gsrRaw);
          pushCalib(liveCharts.resp, respRaw);
        }

        // ── 即時計算並顯示累積基準值（每筆都算一次滾動平均）
        const avg = arr => (Array.isArray(arr) && arr.length) ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
        const liveHR   = avg(S.calibBuf.hr);
        const liveGSR  = avg(S.calibBuf.gsr);
        const liveResp = avg(S.calibBuf.resp);
        const liveBPM  = avg(S.calibBuf.bpm);
        const liveRPM  = avg(S.calibBuf.rpm);
        const n        = S.calibBuf.hr.length;

        // 更新 baseline 顯示欄位（即時累積值）
        const safeSet = (id, val, dec=0) => {
          const el = document.getElementById(id);
          if (el && val != null) el.textContent = val.toFixed(dec);
        };
        safeSet('baseHR',     liveHR,   0);
        safeSet('baseGSR',    liveGSR,  0);
        safeSet('baseRR',     liveResp, 0);
        safeSet('baseRawHR',  liveHR,   0);
        safeSet('baseRawRR',  liveResp, 0);
        safeSet('s_hr_base',  liveHR,   1);
        safeSet('s_gsr_base', liveGSR,  1);
        safeSet('s_rr_base',  liveResp, 1);

        // 更新 masterPanel 校正基準值區塊
        const safeSet2 = (id, val, dec=0) => {
          const el = document.getElementById(id);
          if (el && val != null) el.textContent = val.toFixed(dec);
          else if (el) el.textContent = '--';
        };
        safeSet2('mpCalibHR',   liveHR,  0);
        safeSet2('mpCalibGSR',  liveGSR, 0);
        safeSet2('mpCalibResp', liveResp,0);
        safeSet2('mpCalibBPM',  liveBPM, 1);
        safeSet2('mpCalibRPM',  liveRPM, 1);
        const nEl = document.getElementById('mpCalibN');
        if (nEl) nEl.textContent = n + ' pts';

        // 更新 masterPanel 的即時數值（顯示校正中的 BPM / RPM）
        const mpBPM = document.getElementById('mpBPM');
        const mpRPM = document.getElementById('mpRPM');
        const mpSc  = document.getElementById('mpScore');
        if (mpBPM) mpBPM.textContent = bpm > 0 ? bpm.toFixed(1) : '--';
        if (mpRPM) mpRPM.textContent = rpm > 0 ? rpm.toFixed(1) : '--';
        if (mpSc)  mpSc.textContent  = '校正中';

        // 更新 overview 圖
        updateOverview(elapsed, hrRaw, gsrRaw, respRaw);
      }
      return; // 不進入正式數據
    }

    S.hr.push({ t, raw: hrRaw, bpm, bpmRaw, filtered: !!FILTER_STATE.enabled });
    S.gsr.push({ t, raw: gsrRaw, pct: (S.base.gsr && S.base.gsr > 0) ? ((gsrRaw - S.base.gsr) / S.base.gsr * 100) : null });
    S.resp.push({ t, raw: respRaw, rpm });
    S.score.push({ t, val: score });

    updateOverview(t, hrRaw, gsrRaw, respRaw);
    const _ci=1/(CFG.chart_rate||10);
    if(t-(S._lastChartT||-999)>=_ci){S._lastChartT=t;
      updateLiveChart(liveCharts.hr,   t, hrRaw,   hrRaw);
      updateLiveChart(liveCharts.gsr,  t, gsrRaw,  gsrRaw);
      updateLiveChart(liveCharts.resp, t, respRaw, respRaw);
    }
    updateStressGauge(score);
    updateStatsUI(t, hrRaw, gsrRaw, respRaw, bpm, rpm);
    updateQualityPanel();  // v26: 更新品質監控面板
    updateLogTable(t, gsrRaw, hrRaw, respRaw, bpm, rpm, score);
    return;
  }
}

function updateBaselineUI() {
  const b = S.base;
  document.getElementById('baseHR').textContent    = b.hr   != null ? b.hr.toFixed(0)   : '--';
  document.getElementById('baseGSR').textContent   = b.gsr  != null ? b.gsr.toFixed(0)  : '--';
  document.getElementById('baseRR').textContent    = b.resp != null ? b.resp.toFixed(0)  : '--';
  document.getElementById('baseRawHR').textContent  = b.hr   != null ? b.hr.toFixed(0)   : '--';
  document.getElementById('baseGSR').textContent    = b.gsr  != null ? b.gsr.toFixed(0)  : '--';
  document.getElementById('baseRawRR').textContent  = b.resp != null ? b.resp.toFixed(0)  : '--';
  document.getElementById('s_hr_base').textContent  = b.hr   != null ? b.hr.toFixed(1)   : '--';
  document.getElementById('s_gsr_base').textContent = b.gsr  != null ? b.gsr.toFixed(1)  : '--';
  document.getElementById('s_rr_base').textContent  = b.resp != null ? b.resp.toFixed(1)  : '--';
  S.calibEndSec = CFG.calib;
}

// ★ 校正完成後在主控面板顯示最終基準值
function _mpShowBaselineResult() {
  const b   = S.base;
  const buf = S.calibBuf || {};
  const n   = (buf.hr || []).length;

  const ss = (id, val, dec) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (val != null && !isNaN(val)) ? Number(val).toFixed(dec) : '--';
  };

  // 最終基準值格子
  ss('mpBaseBPM',  b.bpm,  1);
  ss('mpBaseRPM',  b.rpm,  1);
  ss('mpBaseGSR',  b.gsr,  0);
  ss('mpBaseN',    n,      0);

  // ── 靜息正常範圍標註 ──────────────────────────────────
  // 在每個格子下方顯示是否在健康範圍，及壓力滿分閾值
  function _rangeNote(elId, val, lo, hi, unit, stressVal, stressLabel) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (val == null || isNaN(val)) { el.innerHTML = ''; return; }
    const inRange = val >= lo && val <= hi;
    const color   = inRange ? 'var(--green)' : 'var(--yellow)';
    const badge   = inRange ? '✓ 正常範圍' : '⚠ 超出正常';
    const stressStr = stressVal != null ? `<br>壓力滿分閾值：<b>${stressVal} ${unit}</b>${stressLabel ? ' ' + stressLabel : ''}` : '';
    el.innerHTML = `<span style="color:${color};font-size:.5rem">${badge} (${lo}–${hi} ${unit})</span>${stressStr ? `<span style="color:var(--text3);font-size:.48rem;display:block">${stressVal} ${unit}${stressLabel ? ' ' + stressLabel : ''} → S=100</span>` : ''}`;
  }

  const restBPM_v  = b.bpm  != null ? b.bpm  : CFG.rest_hr;
  const restRPM_v  = b.rpm  != null ? b.rpm  : CFG.calm_resp;
  const hrStress   = Math.round(restBPM_v * (1 + CFG.hr_sens / 100));
  const rpmStress  = +(restRPM_v * CFG.resp_stress_mult).toFixed(1);
  const gsrDirNote = CFG.gsr_dir === 'up' ? '(ADC↑)' : '(ADC↓)';
  const gsrStress  = b.gsr != null ? Math.round(b.gsr * (1 + (CFG.gsr_dir === 'up' ? 1 : -1) * CFG.gsr_thresh / 100)) : null;

  // BPM：靜息正常 50–100 BPM
  _rangeNote('mpBaseBPMNote', b.bpm, 50, 100, 'BPM', hrStress, `(+${CFG.hr_sens}%)`);
  // RPM：靜息正常 12–20 次/分
  _rangeNote('mpBaseRPMNote', b.rpm, 12, 20, '/min', rpmStress, `(×${CFG.resp_stress_mult})`);
  // GSR：顯示方向設定與觸發閾值
  const gsrEl = document.getElementById('mpBaseGSRNote');
  if (gsrEl && b.gsr != null) {
    const dirLabel = CFG.gsr_dir === 'up' ? 'ADC↑ = 壓力↑' : 'ADC↓ = 壓力↑';
    gsrEl.innerHTML = `<span style="color:var(--accent);font-size:.48rem">${dirLabel}</span>`
      + (gsrStress != null ? `<span style="color:var(--text3);font-size:.48rem;display:block">閾值：${gsrStress} → S=100 ${gsrDirNote}</span>` : '');
  }

  // 同步更新主統計格（BPM/RPM）
  const mpBPM = document.getElementById('mpBPM');
  const mpRPM = document.getElementById('mpRPM');
  const mpSc  = document.getElementById('mpScore');
  if (mpBPM) mpBPM.textContent = b.bpm != null ? b.bpm.toFixed(1) : '--';
  if (mpRPM) mpRPM.textContent = b.rpm != null ? b.rpm.toFixed(1) : '--';
  if (mpSc)  mpSc.textContent  = '--';

  // 備註：告知算法使用此基準值
  const noteEl = document.getElementById('mpBaseNote');
  if (noteEl) {
    const bpmNote = b.bpm  != null ? `靜息 BPM ${b.bpm.toFixed(1)}` : '未偵測到 BPM（請確認心率感測器）';
    const rpmNote = b.rpm  != null ? `靜息 RPM ${b.rpm.toFixed(1)}` : '未偵測到 RPM（請確認呼吸感測器）';
    noteEl.innerHTML = `壓力演算法將以此為基準：<br>${bpmNote} · ${rpmNote} · GSR ${b.gsr != null ? b.gsr.toFixed(0) : '--'}`;
  }
}

