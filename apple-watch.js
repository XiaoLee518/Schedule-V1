// Apple Watch calibration
// Source: biomonitor_v26.html lines 4734-4793

let appleWatchCalibCoeff = 1.0;  // 校正係數
document.getElementById('btnApplyAppleWatchCalib')?.addEventListener('click', () => {
  const awBpm = parseFloat(document.getElementById('cfg_applewatch_bpm')?.value);
  const resultDiv = document.getElementById('appleWatchCalibResult');
  
  if (!awBpm || awBpm < 40 || awBpm > 200) {
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.style.background = 'rgba(242,102,106,.07)';
      resultDiv.style.borderColor = 'rgba(242,102,106,.2)';
      resultDiv.innerHTML = '❌ 請輸入有效的心率（40-200 BPM）';
    }
    return;
  }
  
  // 取得當前ESP32測得的BPM（最近5秒平均）
  if (!S.hr || S.hr.length < 10) {
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.style.background = 'rgba(242,102,106,.07)';
      resultDiv.style.borderColor = 'rgba(242,102,106,.2)';
      resultDiv.innerHTML = '❌ 請先開始監測，累積足夠數據後再校正';
    }
    return;
  }
  
  const recentBpms = S.hr.slice(-100).map(p => p.bpm).filter(b => b > 0);
  if (recentBpms.length < 5) {
    if (resultDiv) {
      resultDiv.style.display = 'block';
      resultDiv.style.background = 'rgba(242,102,106,.07)';
      resultDiv.style.borderColor = 'rgba(242,102,106,.2)';
      resultDiv.innerHTML = '❌ BPM 數據不足，請等待更多數據後再試';
    }
    return;
  }
  
  const avgEsp32Bpm = recentBpms.reduce((a,b)=>a+b,0) / recentBpms.length;
  
  // 計算校正係數
  appleWatchCalibCoeff = awBpm / avgEsp32Bpm;
  
  // 顯示結果
  if (resultDiv) {
    resultDiv.style.display = 'block';
    resultDiv.style.background = 'rgba(62,207,142,.07)';
    resultDiv.style.borderColor = 'rgba(62,207,142,.2)';
    resultDiv.innerHTML = `
      ✓ 校正成功<br>
      ESP32 測得：${avgEsp32Bpm.toFixed(1)} BPM<br>
      Apple Watch：${awBpm.toFixed(1)} BPM<br>
      校正係數：${appleWatchCalibCoeff.toFixed(3)}<br>
      <span style="color:var(--text3)">後續 BPM 將自動乘以此係數</span>
    `;
  }
  
  console.log(`[Apple Watch 校正] 係數=${appleWatchCalibCoeff.toFixed(3)} (${avgEsp32Bpm.toFixed(1)} → ${awBpm.toFixed(1)})`);
});

// ============================================================
