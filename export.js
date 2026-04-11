// CSV export
// Source: biomonitor_v26.html lines 3641-3717

// ============================================================
// STRESS RECALCULATION (frontend fallback — PDF 公式對齊版)
//
// S_HR   = (BPM − restHR) / (maxHR − restHR) × 100
//   restHR = BASELINE 帶入的基準 BPM（b.bpm）；若無則用 CFG.rest_hr
//   maxHR  = CFG.max_hr（預設 120 BPM）
//
// S_GSR  = (baseGSR − gsrRaw) / (baseGSR × 0.15) × 100
//   GSR 緊張時導電↑ → ADC 讀值↓；相對基準下降 15% → 滿分 100
//   分母固定為 baseGSR × 0.15（與 gsr_thresh 設定值連動）
//
// S_Resp = (RPM − calmResp) / (stressResp − calmResp) × 100
//   calmResp  = BASELINE 帶入的基準 RPM（b.rpm）；若無則用 CFG.calm_resp
//   stressResp = calmResp × CFG.resp_stress_mult（預設 1.25）
//
// Score  = S_HR×w_hr + S_GSR×w_gsr + S_Resp×w_resp（權重自動正規化）
// ============================================================
function recalcStress() {
  if (!S.hr.length) return [];
  const b = S.base;

  // 基準 BPM：優先用 BASELINE 校正帶入的 b.bpm，否則用設定的 rest_hr
  const restBPM  = (b.bpm  && b.bpm  > 0) ? b.bpm  : CFG.rest_hr;
  // S_HR 以個人靜息心率為基準，用靈敏度 % 計算壓力區間
  // 公式：S_HR = (BPM - restHR) / (restHR × hr_sens%) × 100
  // 研究依據：以個人基準做相對比較，避免絕對 maxHR 對不同體能族群偏差
  // 參考：Kreibig 2010, Psychophysiology 27(5); Healey & Picard 2005, IEEE T-ITS
  const hrRange  = restBPM * (CFG.hr_sens / 100); // 高於靜息 hr_sens% 即滿分

  // 基準 RPM：優先用 b.rpm，否則用設定的 calm_resp
  const calmRPM  = (b.rpm  && b.rpm  > 0) ? b.rpm  : CFG.calm_resp;
  const stressRPM = calmRPM * CFG.resp_stress_mult;

  const result = [];
  const n = Math.min(S.hr.length, S.gsr.length, S.resp.length);
  for (let i = 0; i < n; i++) {
    const t      = S.hr[i].t;
    const bpm    = S.hr[i].bpm   || 0;
    const rpm    = S.resp[i].rpm  || 0;
    const gsrRaw = S.gsr[i].raw;

    let s_hr = 0, s_gsr = 0, s_resp = 0;

    // ── S_HR = (BPM − restHR) / (restHR × hr_sens%) × 100
    if (bpm > 0 && restBPM > 0) {
      if (hrRange > 0) s_hr = Math.min(100, Math.max(0, (bpm - restBPM) / hrRange * 100));
    }

    // ── S_GSR：方向由 CFG.gsr_dir 決定
    // 'up'  → 壓力時 ADC 上升：S_GSR = (gsrRaw - baseGSR) / (baseGSR × thresh%) × 100
    // 'down' → 壓力時 ADC 下降：S_GSR = (baseGSR - gsrRaw) / (baseGSR × thresh%) × 100
    if (b.gsr && b.gsr > 0) {
      const denom = b.gsr * (CFG.gsr_thresh / 100);
      if (denom > 0) {
        const delta = (CFG.gsr_dir === 'down') ? (b.gsr - gsrRaw) : (gsrRaw - b.gsr);
        s_gsr = Math.min(100, Math.max(0, delta / denom * 100));
      }
    }

    // ── S_Resp = (RPM − calmResp) / (stressResp − calmResp) × 100
    if (rpm > 0) {
      const range = stressRPM - calmRPM;
      if (range > 0) s_resp = Math.min(100, Math.max(0, (rpm - calmRPM) / range * 100));
    }

    // Normalize weights so they always sum to 1
    const wSum = CFG.w_hr + CFG.w_gsr + CFG.w_resp;
    const whr  = wSum > 0 ? CFG.w_hr   / wSum : 0.4;
    const wgsr = wSum > 0 ? CFG.w_gsr  / wSum : 0.2;
    const wrr  = wSum > 0 ? CFG.w_resp / wSum : 0.4;

    const val = Math.min(100, Math.max(0, s_hr * whr + s_gsr * wgsr + s_resp * wrr));
    result.push({ t, val, s_hr, s_gsr, s_resp });
  }
  return result;
}

