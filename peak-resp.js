// Respiration peak detection
// Source: biomonitor_v26.html lines 2437-2513

// ============================================================
// FRONTEND RESP PEAK DETECTOR
// 當 ESP32 無法計算 RPM（送出 0）時，前端從 respRaw 自行估算
// ============================================================
const _frPeak = {
  buf:     [],   // { t, v }  — 平滑後訊號，保留 30 s
  peaks:   [],   // 已確認峰值的時間戳
  smBuf:   [],   // 最近 5 點原始值，用於滑動平均
  lastRPM: 0,
};

// 每收到一個 respRaw 點就呼叫一次；回傳目前估算的 RPM（0 = 還不夠資料）
function _frPeakPush(t, rawResp) {
  // 1. 5 點滑動平均去噪
  _frPeak.smBuf.push(rawResp);
  if (_frPeak.smBuf.length > 5) _frPeak.smBuf.shift();
  const sm = _frPeak.smBuf.reduce((a, b) => a + b, 0) / _frPeak.smBuf.length;

  // 2. 更新緩衝區，只保留最近 30 秒
  _frPeak.buf.push({ t, v: sm });
  while (_frPeak.buf.length && _frPeak.buf[0].t < t - 30) _frPeak.buf.shift();

  const buf = _frPeak.buf;
  if (buf.length < 15) return 0; // 資料不足

  // 3. 延遲判峰：檢查 2.5 秒前的點，確保左右都有足夠資料
  const checkT = t - 2.5;
  let ci = -1;
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i].t <= checkT) { ci = i; break; }
  }
  if (ci < 5 || ci > buf.length - 5) return _frPeak.lastRPM;

  // 4. 取 ±5 點的局部視窗，計算動態 prominence 閾值
  const win = buf.slice(ci - 5, ci + 6);
  const maxV = Math.max(...win.map(p => p.v));
  const minV = Math.min(...win.map(p => p.v));
  const amp = maxV - minV;

  // 振幅太小（＜10 ADC counts）→ 訊號太弱，跳過
  if (amp < 10) return _frPeak.lastRPM;

  const center = buf[ci];
  const prominence = amp * 0.35; // 需達到局部振幅的 35% 才算真峰值

  if (center.v >= maxV && (center.v - minV) >= prominence) {
    // 5. 確認最小峰間距（1.5 s = 上限 40 RPM），避免假峰觸發
    const lastPk = _frPeak.peaks.at(-1);
    if (!lastPk || (center.t - lastPk) >= 1.5) {
      _frPeak.peaks.push(center.t);
      if (_frPeak.peaks.length > 5) _frPeak.peaks.shift(); // 只留最近 5 個
    }
  }

  // 6. 用最近幾個峰的平均間距換算 RPM
  if (_frPeak.peaks.length >= 2) {
    const ivals = [];
    for (let i = 1; i < _frPeak.peaks.length; i++)
      ivals.push(_frPeak.peaks[i] - _frPeak.peaks[i - 1]);
    const avgI = ivals.reduce((a, b) => a + b, 0) / ivals.length;
    // 合理呼吸率：2–60 RPM（間距 1–30 s）
    if (avgI >= 1 && avgI <= 30) {
      _frPeak.lastRPM = 60 / avgI;
    }
  }

  return _frPeak.lastRPM;
}

// 校正/量測重置時清空偵測器狀態
function _frPeakReset() {
  _frPeak.buf    = [];
  _frPeak.peaks  = [];
  _frPeak.smBuf  = [];
  _frPeak.lastRPM = 0;
}

