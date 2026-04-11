// Heart rate peak detection
// Source: biomonitor_v26.html lines 2514-2638

// ============================================================
// FRONTEND HR PEAK DETECTOR
// 當 ESP32 無法計算 BPM（送出 0）時，前端從 hrRaw 自行估算
// 策略：動態去除 DC offset → 滑動平均去高頻噪聲 → 局部峰值偵測 → BPM 換算
// ============================================================
const _fhPeak = {
  buf:        [],   // { t, v }  — 去 DC 後平滑訊號，保留最近 10 s
  peaks:      [],   // 已確認峰值的時間戳，最多保留 8 個
  smBuf:      [],   // 滑動平均緩衝
  dc:         null, // EMA 動態基準線
  typicalAmp: null, // EMA 追蹤正常心跳振幅（用於動作偵測）
  lastBPM:    0,
};

function _fhPeakPush(t, rawHR) {
  const hz = CFG.data_rate || 25;

  const SM_SEC      = 0.18;  // 平滑視窗
  const BUF_WIN_SEC = 10;    // 緩衝保留
  const WARMUP_SEC  = 4;     // 暖機
  const REFRACTORY  = 0.33;  // 不應期（上限 ≈ 182 BPM）
  const DC_ALPHA    = 0.002; // EMA DC 追蹤
  const AMP_ALPHA   = 0.05;  // EMA 正常振幅追蹤
  const MOTION_MULT = 3.0;   // 振幅超過正常的幾倍算動作干擾
  const IVDEV_MAX   = 0.50;  // 峰間距偏差容忍度（50%）
  const BPM_JUMP    = 20;    // 每次 BPM 最大跳動量

  const smMax      = Math.max(2, Math.round(hz * SM_SEC));
  const warmup     = Math.max(8, Math.round(hz * WARMUP_SEC));
  const shortWinN  = Math.max(3, Math.round(hz * 0.5)); // 0.5s 短視窗

  // 1. EMA 動態基準線
  if (_fhPeak.dc == null) _fhPeak.dc = rawHR;
  _fhPeak.dc += DC_ALPHA * (rawHR - _fhPeak.dc);
  const centered = rawHR - _fhPeak.dc;

  // 2. 滑動平均平滑
  _fhPeak.smBuf.push(centered);
  if (_fhPeak.smBuf.length > smMax) _fhPeak.smBuf.shift();
  const sm = _fhPeak.smBuf.reduce((a, b) => a + b, 0) / _fhPeak.smBuf.length;

  // 3. 維護滾動緩衝區
  _fhPeak.buf.push({ t, v: sm });
  while (_fhPeak.buf.length && _fhPeak.buf[0].t < t - BUF_WIN_SEC) _fhPeak.buf.shift();

  const buf = _fhPeak.buf;
  if (buf.length < warmup) return 0;

  // ── 防護層 1：動作干擾偵測（短視窗振幅 vs 正常振幅 EMA）──────
  const shortWin = buf.slice(-shortWinN);
  const shortAmp = Math.max(...shortWin.map(p => p.v)) - Math.min(...shortWin.map(p => p.v));
  if (_fhPeak.typicalAmp == null) _fhPeak.typicalAmp = shortAmp;
  else _fhPeak.typicalAmp += AMP_ALPHA * (shortAmp - _fhPeak.typicalAmp);
  // 振幅超過正常 MOTION_MULT 倍 → 手部移動，直接跳過本點
  if (_fhPeak.typicalAmp > 5 && shortAmp > _fhPeak.typicalAmp * MOTION_MULT) {
    return _fhPeak.lastBPM;
  }

  // 4. 坡度過零點偵測
  const n = buf.length;
  if (n < 3) return _fhPeak.lastBPM;
  const slope1 = buf[n-2].v - buf[n-3].v;
  const slope2 = buf[n-1].v - buf[n-2].v;

  if (slope1 > 0 && slope2 < 0) {
    const peakT = buf[n-2].t;
    const peakV = buf[n-2].v;

    // RMS 振幅門檻
    const rms = Math.sqrt(buf.reduce((s, p) => s + p.v * p.v, 0) / buf.length);
    if (peakV < rms * 0.5) return _fhPeak.lastBPM;

    // 不應期
    const lastPk = _fhPeak.peaks.at(-1);
    if (lastPk && (peakT - lastPk) < REFRACTORY) return _fhPeak.lastBPM;

    // ── 防護層 2：峰間距一致性檢查 ──────────────────────────────
    // 新間距偏離近期中位數超過 IVDEV_MAX → 可能是動作假峰，拒絕
    if (_fhPeak.peaks.length >= 2 && lastPk) {
      const recentIvals = [];
      for (let i = 1; i < _fhPeak.peaks.length; i++)
        recentIvals.push(_fhPeak.peaks[i] - _fhPeak.peaks[i-1]);
      recentIvals.sort((a, b) => a - b);
      const medIval = recentIvals[Math.floor(recentIvals.length / 2)];
      const newIval = peakT - lastPk;
      if (Math.abs(newIval - medIval) / medIval > IVDEV_MAX) {
        return _fhPeak.lastBPM;
      }
    }

    _fhPeak.peaks.push(peakT);
    if (_fhPeak.peaks.length > 8) _fhPeak.peaks.shift();
  }

  // 5. 中位數間距換算 BPM
  if (_fhPeak.peaks.length >= 3) {
    const ivals = [];
    for (let i = 1; i < _fhPeak.peaks.length; i++)
      ivals.push(_fhPeak.peaks[i] - _fhPeak.peaks[i-1]);
    ivals.sort((a, b) => a - b);
    const medI = ivals[Math.floor(ivals.length / 2)];
    if (medI >= 0.3 && medI <= 1.5) {
      const newBPM = Math.round(60 / medI);
      // ── 防護層 3：BPM 跳動限制，防止動作導致數字瞬間飛走 ────
      if (_fhPeak.lastBPM > 0) {
        const diff = newBPM - _fhPeak.lastBPM;
        _fhPeak.lastBPM += Math.sign(diff) * Math.min(Math.abs(diff), BPM_JUMP);
      } else {
        _fhPeak.lastBPM = newBPM;
      }
    }
  }

  return _fhPeak.lastBPM;
}

function _fhPeakReset() {
  _fhPeak.buf        = [];
  _fhPeak.peaks      = [];
  _fhPeak.smBuf      = [];
  _fhPeak.dc         = null;
  _fhPeak.typicalAmp = null;
  _fhPeak.lastBPM    = 0;
}

