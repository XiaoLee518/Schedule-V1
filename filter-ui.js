// Filter settings UI & toggle
// Source: biomonitor_v26.html lines 4514-4693

// ============================================================
// SETTINGS
// ============================================================
document.getElementById('btnSave').addEventListener('click', () => {
  let raw_hr   = parseFloat(document.getElementById('cfg_w_hr').value)   || 0.45;
  let raw_gsr  = parseFloat(document.getElementById('cfg_w_gsr').value)  || 0.30;
  let raw_resp = parseFloat(document.getElementById('cfg_w_resp').value) || 0.25;

  // Auto-normalize weights to sum = 1
  const wSum = raw_hr + raw_gsr + raw_resp;
  if (wSum > 0) {
    raw_hr   = raw_hr   / wSum;
    raw_gsr  = raw_gsr  / wSum;
    raw_resp = raw_resp / wSum;
  }
  // Update inputs to show normalized values
  document.getElementById('cfg_w_hr').value   = raw_hr.toFixed(3);
  document.getElementById('cfg_w_gsr').value  = raw_gsr.toFixed(3);
  document.getElementById('cfg_w_resp').value = raw_resp.toFixed(3);

  CFG.w_hr         = raw_hr;
  CFG.w_gsr        = raw_gsr;
  CFG.w_resp       = raw_resp;
  CFG.gsr_dir      = document.querySelector('input[name="gsr_dir"]:checked')?.value || 'up';
  CFG.hr_sens           = parseFloat(document.getElementById('cfg_hr_sens').value)           || 40;
  CFG.resp_stress_mult  = parseFloat(document.getElementById('cfg_resp_stress_mult').value)  || 1.20;
  CFG.calib        = parseInt(document.getElementById('cfg_calib').value)          || 10;
  CFG.gsr_thresh   = parseFloat(document.getElementById('cfg_gsr_thresh').value)   || 20;
  CFG.data_rate    = parseInt(document.getElementById("cfg_data_rate").value) || 25;
  
  // v26: 進階濾波開關
  const advFilterEnabled = document.getElementById('chk_advanced_filter')?.checked || false;
  FILTER_STATE.enabled = advFilterEnabled;
  document.getElementById('filter_status').textContent = advFilterEnabled ? '✓ 已啟用' : '關閉';
  document.getElementById('filter_status').style.color = advFilterEnabled ? 'var(--green)' : 'var(--text3)';
  console.log(`[進階濾波] ${advFilterEnabled ? '已啟用' : '已關閉'}`);

  // 更新公式顯示
  document.getElementById('fw_hr').textContent   = CFG.w_hr.toFixed(2);
  document.getElementById('fw_gsr').textContent  = CFG.w_gsr.toFixed(2);
  document.getElementById('fw_resp').textContent = CFG.w_resp.toFixed(2);

  // 權重總和 — 標示正常（已自動正規化）
  const wtEl = document.getElementById('weightTotal');
  wtEl.textContent = `總和：1.00（已自動正規化）`;
  wtEl.className = 'weight-total wt-ok';

  // 若已連線，同步至 ESP32（BLE 或 USB 皆可）
  if (S.connMode) {
    deviceWrite(`SET_W_HR=${CFG.w_hr.toFixed(3)}`);
    deviceWrite(`SET_W_GSR=${CFG.w_gsr.toFixed(3)}`);
    deviceWrite(`SET_W_RESP=${CFG.w_resp.toFixed(3)}`);
    deviceWrite(`SET_CALIB=${CFG.calib}`);
    deviceWrite(`SET_RESP_STRESS_MULT=${CFG.resp_stress_mult}`);
    deviceWrite(`SET_RATE=${CFG.data_rate}`);
  }

  const btn = document.getElementById('btnSave');
  btn.textContent = S.connMode ? '已儲存並同步' : '已儲存（未連線）';
  setTimeout(() => btn.textContent = '儲存並同步 ESP32', 1800);
});

// ============================================================
// SETTINGS SLIDER SYNC
// ============================================================
const sliderPairs = [
  ['sl_w_hr',      'cfg_w_hr'],
  ['sl_w_gsr',     'cfg_w_gsr'],
  ['sl_w_resp',    'cfg_w_resp'],
  ['sl_hr_sens',          'cfg_hr_sens'],
  ['sl_resp_stress_mult', 'cfg_resp_stress_mult'],
  ['sl_calib',     'cfg_calib'],
  ['sl_gsr_thresh','cfg_gsr_thresh'],
  ['sl_data_rate', 'cfg_data_rate'],
];
sliderPairs.forEach(([slId, inId]) => {
  const sl = document.getElementById(slId);
  const inp = document.getElementById(inId);
  if (!sl || !inp) return;
  sl.addEventListener('input', () => { inp.value = sl.value; updateSettingsPreview(); });
  inp.addEventListener('input', () => { sl.value = inp.value; updateSettingsPreview(); });
});

function updateSettingsPreview() {
  const g = id => parseFloat(document.getElementById(id).value) || 0;
  const wSum = g('cfg_w_hr') + g('cfg_w_gsr') + g('cfg_w_resp');
  const whr  = wSum > 0 ? g('cfg_w_hr')   / wSum : 0.45;
  const wgsr = wSum > 0 ? g('cfg_w_gsr')  / wSum : 0.30;
  const wrr  = wSum > 0 ? g('cfg_w_resp') / wSum : 0.25;
  const safe = el => { const e = document.getElementById(el); return e ? e : { textContent: '' }; };
  safe('prev_whr').textContent      = whr.toFixed(2);
  safe('prev_wgsr').textContent     = wgsr.toFixed(2);
  safe('prev_wrr').textContent      = wrr.toFixed(2);
  // gsr_thresh
  const gsrTh = parseFloat(document.getElementById('cfg_gsr_thresh')?.value) || 20;
  safe('prev_gsr_thresh').textContent     = (gsrTh / 100).toFixed(2);
  safe('prev_gsr_thresh_pct').textContent = gsrTh;
  safe('prev_resp_stress_mult').textContent = document.getElementById('cfg_resp_stress_mult')?.value || '1.20';
  // hr_sens preview：顯示靈敏度%與對應滿分 BPM
  const hrSens   = parseFloat(document.getElementById('cfg_hr_sens')?.value) || 40;
  const restHRpv = (S.base.bpm && S.base.bpm > 0) ? S.base.bpm : CFG.rest_hr;
  const maxHRpv  = Math.round(restHRpv * (1 + hrSens / 100));
  safe('prev_hr_sens').textContent     = hrSens;
  safe('prev_hr_sens_pct').textContent = hrSens;
  safe('prev_rest_hr').textContent     = Math.round(restHRpv);
  safe('prev_max_hr').textContent      = maxHRpv;
}
updateSettingsPreview();

// GSR direction radios → live update CFG + formula note
function _updateGsrDirNote() {
  const noteEl = document.getElementById('gsr_dir_formula_note');
  if (!noteEl) return;
  const thresh = document.getElementById('cfg_gsr_thresh')?.value || 20;
  noteEl.textContent = CFG.gsr_dir === 'up'
    ? `目前公式：S_GSR = (gsrRaw − baseGSR) / (baseGSR × ${thresh}%) × 100（ADC 上升 = 壓力上升）`
    : `目前公式：S_GSR = (baseGSR − gsrRaw) / (baseGSR × ${thresh}%) × 100（ADC 下降 = 壓力上升）`;
}
document.querySelectorAll('input[name="gsr_dir"]').forEach(r => {
  r.addEventListener('change', () => { CFG.gsr_dir = r.value; _updateGsrDirNote(); updateSettingsPreview(); });
});
document.getElementById('cfg_gsr_thresh')?.addEventListener('input', _updateGsrDirNote);
document.getElementById('sl_gsr_thresh')?.addEventListener('input',  _updateGsrDirNote);
_updateGsrDirNote();

// v26: 進階濾波checkbox監聽器
document.getElementById('chk_advanced_filter')?.addEventListener('change', function() {
  FILTER_STATE.enabled = this.checked;
  const statusEl = document.getElementById('filter_status');
  if (statusEl) {
    statusEl.textContent = this.checked ? '✓ 已啟用' : '關閉';
    statusEl.style.color = this.checked ? 'var(--green)' : 'var(--text3)';
  }
  console.log(`[進階濾波] ${this.checked ? '已啟用 (Butterworth + FFT)' : '已關閉'}`);
  if (this.checked && S.hr && S.hr.length > 0) {
    FILTER_STATE.hrFilter.reset();  // 重置濾波器狀態
  }
});

// Weight live preview
['cfg_w_hr','cfg_w_gsr','cfg_w_resp'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    const t = (parseFloat(document.getElementById('cfg_w_hr').value)   || 0)
            + (parseFloat(document.getElementById('cfg_w_gsr').value)  || 0)
            + (parseFloat(document.getElementById('cfg_w_resp').value) || 0);
    const el = document.getElementById('weightTotal');
    if (Math.abs(t - 1) < 0.01) {
      el.textContent = `總和：${t.toFixed(2)} ✓`;
      el.className = 'weight-total wt-ok';
    } else {
      el.textContent = `總和：${t.toFixed(2)}（儲存時將自動正規化為 1.00）`;
      el.className = 'weight-total wt-bad';
    }
  });
});

// ============================================================
// COPY TEMPLATE
// ============================================================
function doCopy(id, btn) {
  navigator.clipboard.writeText(document.getElementById(id).textContent)
    .then(() => { btn.textContent = '已複製'; setTimeout(() => btn.textContent = '複製', 1500); });
}

// ============================================================
// INIT
// ============================================================
initLiveCharts();

// ── 品質監控面板（v26）────────────────────────────────────
let qualityPanelExpanded = false;
document.getElementById('mpQualityHeader')?.addEventListener('click', () => {
  qualityPanelExpanded = !qualityPanelExpanded;
  const body = document.getElementById('mpQualityBody');
  const toggle = document.getElementById('mpQualityToggle');
  if (body) body.style.display = qualityPanelExpanded ? 'block' : 'none';
  if (toggle) toggle.textContent = qualityPanelExpanded ? '▲' : '▼';
});

// 更新品質監控數值
