// Export center - download control panel
// Provides selective download of CSV, charts, report, video

function ecSetStatus(msg) {
  const el = document.getElementById('ecStatus');
  if (!el) return;
  el.style.display = msg ? 'block' : 'none';
  el.textContent = msg;
  if (msg) setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function ecGenerateReport() {
  if (!S.hr.length) return '';
  const scores = recalcStress();
  const n = Math.min(S.hr.length, S.gsr.length, S.resp.length);
  const awCoeff = (typeof appleWatchCalibCoeff !== 'undefined') ? appleWatchCalibCoeff : 1.0;
  const dur = S.hr[S.hr.length - 1].t;

  const avgBpm = S.hr.reduce((a, p) => a + (p.bpm || 0), 0) / S.hr.length;
  const avgRpm = S.resp.reduce((a, p) => a + (p.rpm || 0), 0) / S.resp.length;
  const avgScore = scores.length ? scores.reduce((a, p) => a + p.val, 0) / scores.length : 0;
  const maxScore = scores.length ? Math.max(...scores.map(p => p.val)) : 0;

  let txt = '=== BioMonitor 數據分析報告 ===\n';
  txt += `日期: ${new Date().toLocaleString('zh-TW')}\n`;
  txt += `量測時間: ${dur.toFixed(1)} 秒\n`;
  txt += `數據點數: ${n}\n\n`;
  txt += '--- 基準值 ---\n';
  txt += `HR: ${S.base.hr ?? '--'}  GSR: ${S.base.gsr ?? '--'}  Resp: ${S.base.resp ?? '--'}\n`;
  txt += `BPM: ${S.base.bpm ?? '--'}  RPM: ${S.base.rpm ?? '--'}\n\n`;
  txt += '--- Apple Watch 校正 ---\n';
  txt += `校正係數: ${awCoeff.toFixed(4)}\n`;
  txt += `濾波器: ${FILTER_STATE.enabled ? 'Butterworth+FFT 已啟用' : '未啟用'}\n\n`;
  txt += '--- 統計摘要 ---\n';
  txt += `平均 BPM（校正後）: ${avgBpm.toFixed(1)}\n`;
  txt += `平均 RPM: ${avgRpm.toFixed(1)}\n`;
  txt += `平均壓力指數: ${avgScore.toFixed(1)}\n`;
  txt += `最高壓力指數: ${maxScore.toFixed(1)}\n\n`;
  txt += '--- 權重設定 ---\n';
  txt += `w_hr: ${CFG.w_hr}  w_gsr: ${CFG.w_gsr}  w_resp: ${CFG.w_resp}\n`;
  txt += `hr_sens: ${CFG.hr_sens}%  gsr_thresh: ${CFG.gsr_thresh}%  gsr_dir: ${CFG.gsr_dir}\n`;
  txt += `resp_stress_mult: ${CFG.resp_stress_mult}\n`;
  return txt;
}

function ecDownload(blob, fname) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fname;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 300);
}

// ── Download all selected items ─────────────────────────────
document.getElementById('ecDownloadAll')?.addEventListener('click', async () => {
  if (!S.hr.length) { alert('尚無數據'); return; }
  const ts = new Date().toISOString().slice(0, 19).replace(/[:\-T]/g, '');
  let count = 0;

  if (document.getElementById('ecCsv')?.checked) {
    exportCsv();
    count++;
  }

  if (document.getElementById('ecBpmPng')?.checked && DC.bpmChart) {
    setTimeout(() => dcDownloadChart(DC.bpmChart, 'BPM'), count * 400);
    count++;
  }
  if (document.getElementById('ecRpmPng')?.checked && DC.rpmChart) {
    setTimeout(() => dcDownloadChart(DC.rpmChart, 'RPM'), count * 400);
    count++;
  }
  if (document.getElementById('ecGsrPng')?.checked && DC.gsrChart) {
    setTimeout(() => dcDownloadChart(DC.gsrChart, 'GSR'), count * 400);
    count++;
  }

  if (document.getElementById('ecReport')?.checked) {
    const txt = ecGenerateReport();
    setTimeout(() => {
      ecDownload(new Blob([txt], { type: 'text/plain;charset=utf-8' }), `BioMonitor_Report_${ts}.txt`);
    }, count * 400);
    count++;
  }

  if (document.getElementById('ecVideo')?.checked) {
    const blob = CAM.recordedBlob || (CAM.slices.length ? CAM.slices[CAM.slices.length - 1].blob : null);
    if (blob) {
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      setTimeout(() => {
        ecDownload(blob, `BioMonitor_Video_${ts}.${ext}`);
      }, count * 400);
      count++;
    }
  }

  ecSetStatus(count > 0 ? `已啟動 ${count} 項下載` : '未選擇任何項目');
});

document.getElementById('ecDownloadCsv')?.addEventListener('click', () => {
  if (!S.hr.length) { alert('尚無數據'); return; }
  exportCsv();
  ecSetStatus('CSV 下載完成');
});

document.getElementById('ecDownloadCharts')?.addEventListener('click', () => {
  if (!DC.bpmChart) { alert('請先切到「詳細圖表」頁產生圖表'); return; }
  dcDownloadChart(DC.bpmChart, 'BPM');
  setTimeout(() => dcDownloadChart(DC.rpmChart, 'RPM'), 300);
  setTimeout(() => dcDownloadChart(DC.gsrChart, 'GSR'), 600);
  ecSetStatus('圖表下載完成');
});
