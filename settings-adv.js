// Advanced settings handlers
// Source: biomonitor_v26.html lines 4483-4513

// ============================================================
// CSV EXPORT ONLY (Import removed — use live data)
// ============================================================

function exportCsv() {
  if (!S.hr.length) { alert('尚無數據'); return; }
  const bHR   = S.base.hr   != null ? S.base.hr.toFixed(2)   : '';
  const bGSR  = S.base.gsr  != null ? S.base.gsr.toFixed(2)  : '';
  const bResp = S.base.resp != null ? S.base.resp.toFixed(2) : '';
  const bBPM  = S.base.bpm  != null ? S.base.bpm.toFixed(2)  : '';
  const bRPM  = S.base.rpm  != null ? S.base.rpm.toFixed(2)  : '';
  const espOK = S.score && S.score.length > 0 && S.score.some(p => p.val > 0);
  const scores = espOK ? S.score : recalcStress();
  let csv = 'time_s,gsr_raw,gsr_change_pct,hr_raw,resp_raw,BPM_raw,BPM_calibrated,RPM,AW_coeff,filtered,Score,S_HR,S_GSR,S_Resp,base_hr,base_gsr,base_resp,base_bpm,base_rpm\n';
  const n = Math.min(S.hr.length, S.gsr.length, S.resp.length);
  const awCoeff = (typeof appleWatchCalibCoeff !== 'undefined') ? appleWatchCalibCoeff : 1.0;
  for (let i = 0; i < n; i++) {
    const hr   = S.hr[i];
    const gsr  = S.gsr[i]  || {};
    const resp = S.resp[i] || {};
    const sc   = scores[i] || {};
    const bpmR = hr.bpmRaw != null ? hr.bpmRaw : hr.bpm;
    csv += `${hr.t.toFixed(3)},${gsr.raw||''},${gsr.pct!=null?gsr.pct.toFixed(2):''},${hr.raw},${resp.raw||''},${bpmR!=null?bpmR.toFixed(2):''},${hr.bpm!=null?hr.bpm.toFixed(2):''},${resp.rpm!=null?resp.rpm.toFixed(2):''},${awCoeff.toFixed(4)},${hr.filtered?1:0},${sc.val!=null?sc.val.toFixed(2):''},${sc.s_hr!=null?sc.s_hr.toFixed(2):''},${sc.s_gsr!=null?sc.s_gsr.toFixed(2):''},${sc.s_resp!=null?sc.s_resp.toFixed(2):''},${bHR},${bGSR},${bResp},${bBPM},${bRPM}\n`;
  }
  const fname = 'BioMonitor_' + new Date().toISOString().slice(0,19).replace(/[:\-T]/g,'') + '.csv';
  const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const a     = Object.assign(document.createElement('a'), { href:url, download:fname });
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
// (analysis page CSV export removed — use mpCsvBtn or btnExportCsv)

