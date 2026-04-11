// Global config & constants
// Source: biomonitor_v26.html lines 1793-1823

// ============================================================
// CONFIG — 從設定頁讀取，可透過 BLE 同步至 ESP32
// ============================================================
const CFG = {
  // 權重（研究依據：HR 最穩定，GSR 次之，Resp 受自主控制影響較大）
  // 參考：Healey & Picard 2005；Kim & André 2008；Subramanian et al. 2014
  w_hr: 0.45, w_gsr: 0.30, w_resp: 0.25,
  // restHR / restResp 由 BASELINE 封包自動帶入（S.base.hr / S.base.resp）
  rest_hr:  70,    // 靜息心率 BPM（fallback，通常由 BASELINE 覆蓋）
  max_hr:  120,    // 保留欄位，已改用 hr_sens 計算（下方）
  calm_resp: 14,   // 靜息呼吸率 RPM（fallback）
  // hr_sens：高於靜息 X% → S_HR = 100
  // 研究：心理壓力下 HR 通常上升 20–50%；40% 為中等敏感度基準
  // 參考：Kreibig 2010, Psychophysiology; AHA 壓力生理反應建議
  hr_sens: 40,
  // resp_stress_mult：呼吸速率達基準 × 此倍率 → S_Resp = 100
  // 研究：壓力下呼吸率通常升至 >20 次/分（靜息 14 × 1.20 ≈ 16.8）
  // 參考：American Lung Association；Grossman 1983, Psychophysiology
  resp_stress_mult: 1.20,
  calib: 60,
  // gsr_dir: 'up' = 壓力時 ADC 上升（出汗→導電↑→ADC↑），'down' = 壓力時 ADC 下降
  // 預設 'up'：最常見的電阻分壓（R上/皮膚下）接法
  gsr_dir: 'up',
  // gsr_thresh：ADC 相對基準變化 X% → S_GSR = 100（方向由 gsr_dir 決定）
  // 研究：皮膚電導在心理壓力下通常變化 15–30%；20% 為保守門檻減少假陽性
  // 參考：Boucsein 2012, Electrodermal Activity; WESAD dataset (Schmidt et al. 2018)
  gsr_thresh: 20,
  data_rate: 25,
  chart_rate: 10,
};

