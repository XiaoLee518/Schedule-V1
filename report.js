// Report page & LTI calculation
// Source: biomonitor_v26.html lines 3718-3958

// ── LTI 長期緊張指數計算（報告頁用）─────────────────────────
// LTI = Peak×0.4 + 平均×0.4 + 事件密度×0.2
// 事件密度 = (Score ≥ 60 的點數 / 總點數) × 100
function calcLTI(scoreArr) {
  if (!scoreArr.length) return 0;
  const vals = scoreArr.map(p => (typeof p === 'object') ? p.val : p);
  const peak = Math.max(...vals);
  const avg  = vals.reduce((a, v) => a + v, 0) / vals.length;
  const density = (vals.filter(v => v >= 60).length / vals.length) * 100;
  return Math.min(100, peak * 0.4 + avg * 0.4 + density * 0.2);
}

// ============================================================
// REPORT BUILDER
// ============================================================
let rptCharts = {};
function buildReport() {
  const now = new Date();
  document.getElementById('rpt_date').textContent        = now.toLocaleDateString('zh-TW');
  document.getElementById('rpt_footer_date').textContent = now.toLocaleString('zh-TW');

  const dur = S.hr.length > 0 ? S.hr[S.hr.length-1].t : 0;
  document.getElementById('rpt_duration').textContent = `時長: ${dur.toFixed(0)} s`;
  document.getElementById('rpt_pts').textContent      = `資料點: ${S.hr.length}`;

  // ── Baseline ──────────────────────────────────────────────
  const b = S.base;
  const bEl = document.getElementById('rpt_baseline');
  if (b.hr != null || b.gsr != null || b.resp != null) {
    bEl.innerHTML = [
      b.hr   != null ? `<div style="background:#f0f4ff;border:1px solid #d0daff;border-radius:4px;padding:5px 10px;text-align:center"><div style="font-size:.54rem;color:#888;font-family:'IBM Plex Mono',monospace">HR baseline</div><div style="font-size:1.1rem;font-weight:700;color:#2d4a8a;font-family:'IBM Plex Mono',monospace">${b.hr.toFixed(0)}</div></div>` : '',
      b.gsr  != null ? `<div style="background:#fffbf0;border:1px solid #ffe0a0;border-radius:4px;padding:5px 10px;text-align:center"><div style="font-size:.54rem;color:#888;font-family:'IBM Plex Mono',monospace">GSR baseline</div><div style="font-size:1.1rem;font-weight:700;color:#8a5a00;font-family:'IBM Plex Mono',monospace">${b.gsr.toFixed(0)}</div></div>` : '',
      b.resp != null ? `<div style="background:#f0fff8;border:1px solid #a0e0c0;border-radius:4px;padding:5px 10px;text-align:center"><div style="font-size:.54rem;color:#888;font-family:'IBM Plex Mono',monospace">Resp baseline</div><div style="font-size:1.1rem;font-weight:700;color:#006040;font-family:'IBM Plex Mono',monospace">${b.resp.toFixed(0)}</div></div>` : '',
    ].filter(Boolean).join('');
  } else {
    bEl.innerHTML = '<span style="color:#aaa;font-size:.76rem;font-family:\'IBM Plex Mono\'">無基準值記錄</span>';
  }

  // ── Stress data: ESP32 優先，fallback 重算 ───────────────
  const espOK = S.score && S.score.length > 0 && S.score.some(p => p.val > 0);
  const stressData = espOK
    ? S.score.map(p => ({ t: p.t, val: p.val }))
    : recalcStress();
  const src = espOK ? 'ESP32 計算值' : '前端重算';

  // ── Formula ───────────────────────────────────────────────
  const wSum = CFG.w_hr + CFG.w_gsr + CFG.w_resp || 1;
  const whr  = (CFG.w_hr   / wSum).toFixed(2);
  const wgsr = (CFG.w_gsr  / wSum).toFixed(2);
  const wrr  = (CFG.w_resp / wSum).toFixed(2);
  document.getElementById('rpt_formula').textContent =
    `Score = S_HR×${whr} + S_GSR×${wgsr} + S_Resp×${wrr}  [${src}]  |  LTI = Peak×0.4 + Avg×0.4 + 事件密度×0.2`;

  // ── Stress statistics + LTI ───────────────────────────────
  const sv    = stressData.map(p => p.val);
  const sAvg  = sv.length ? sv.reduce((a,v)=>a+v,0)/sv.length : 0;
  const sMax  = sv.length ? Math.max(...sv) : 0;
  const sMin  = sv.length ? Math.min(...sv) : 0;
  const sEv60 = (() => {
    let cnt = 0, inEv = false;
    sv.forEach(v => { if (v >= 60 && !inEv) { cnt++; inEv=true; } else if (v < 60) inEv=false; });
    return cnt;
  })();
  const lti = calcLTI(stressData);
  const ltiLevel = lti >= 80 ? '高度' : lti >= 60 ? '中度' : lti >= 30 ? '輕度' : '放鬆';
  const ltiColor = lti >= 80 ? '#c0392b' : lti >= 60 ? '#f2666a' : lti >= 30 ? '#d68910' : '#27ae60';

  // Expand grid to 5 columns to fit LTI
  document.getElementById('rpt_stressStats').style.gridTemplateColumns = 'repeat(5,1fr)';
  document.getElementById('rpt_stressStats').innerHTML = [
    ['平均 Avg',    sAvg.toFixed(1),  '#4a9eff'],
    ['最大 Max',    sMax.toFixed(1),  '#f2666a'],
    ['最小 Min',    sMin.toFixed(1),  '#3ecf8e'],
    ['緊張事件',    sEv60,            '#f0b429'],
    [`LTI (${ltiLevel})`, lti.toFixed(1), ltiColor],
  ].map(([lbl, val, col]) =>
    `<div style="background:#f8f9ff;border:1px solid #e8eaf0;border-radius:4px;padding:6px 8px;text-align:center">
      <div style="font-size:.54rem;color:#999;font-family:'IBM Plex Mono',monospace;margin-bottom:3px">${lbl}</div>
      <div style="font-size:1.2rem;font-weight:700;color:${col};font-family:'IBM Plex Mono',monospace">${val}</div>
 </div>`
  ).join('');

  // ── Stress events table ───────────────────────────────────
  const evEl = document.getElementById('rpt_events');
  const events = [];
  for (let i = 0; i < stressData.length; i++) {
    if (stressData[i].val >= 60) {
      let j = i;
      while (j < stressData.length && stressData[j].val >= 60) j++;
      const seg = stressData.slice(i, j);
      events.push({
        start: seg[0].t, end: seg[seg.length-1].t,
        peak:  Math.max(...seg.map(p=>p.val)),
        avg:   seg.reduce((a,p)=>a+p.val,0)/seg.length,
      });
      i = j - 1;
    }
  }
  if (!events.length) {
    evEl.innerHTML = '<div style="color:#aaa;font-size:.74rem;font-family:\'IBM Plex Mono\'">無緊張事件 (Score &lt; 60)</div>';
  } else {
    evEl.innerHTML = `<table style="width:100%;border-collapse:collapse;font-family:'IBM Plex Mono',monospace;font-size:.7rem">
      <thead><tr style="border-bottom:2px solid #ddd;color:#888;font-size:.6rem">
        <th style="padding:5px 6px;text-align:left">#</th>
        <th style="padding:5px 6px;text-align:left">開始(s)</th>
        <th style="padding:5px 6px;text-align:left">結束(s)</th>
        <th style="padding:5px 6px;text-align:left">持續(s)</th>
        <th style="padding:5px 6px;text-align:left">Peak</th>
        <th style="padding:5px 6px;text-align:left">平均</th>
        <th style="padding:5px 6px;text-align:left">評估</th>
 </tr></thead>
      <tbody>${events.map((e,i) => {
        const dur = (e.end - e.start).toFixed(0);
        const [level, color] = e.peak >= 80 ? ['高度緊張','#c0392b'] : ['中度緊張','#d68910'];
        return `<tr style="border-bottom:1px solid #f0f0f0">
          <td style="padding:5px 6px;color:#888">${i+1}</td>
          <td style="padding:5px 6px">${e.start.toFixed(1)}</td>
          <td style="padding:5px 6px">${e.end.toFixed(1)}</td>
          <td style="padding:5px 6px">${dur}</td>
          <td style="padding:5px 6px;font-weight:700;color:${color}">${e.peak.toFixed(1)}</td>
          <td style="padding:5px 6px">${e.avg.toFixed(1)}</td>
          <td style="padding:5px 6px;color:${color};font-weight:600">${level}</td>
 </tr>`;
      }).join('')}</tbody>
 </table>`;
  }

  // ── Charts ────────────────────────────────────────────────
  Object.values(rptCharts).forEach(c => { try { c.destroy(); } catch(_){} });
  rptCharts = {};

  const lightOpts = {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { type:'linear', grid:{color:'#f4f4f4'}, ticks:{color:'#bbb', font:{size:8,family:'IBM Plex Mono'}, maxTicksLimit:10} },
      y: {                 grid:{color:'#f4f4f4'}, ticks:{color:'#bbb', font:{size:8,family:'IBM Plex Mono'}, maxTicksLimit:5}  },
    },
  };

  // Full-session stress chart — colored by level, threshold line, event annotations
  if (stressData.length > 0) {
    // Build segment-colored datasets
    const mkSegColor = pt => {
      if (pt.val >= 80) return '#c0392b';
      if (pt.val >= 60) return '#f2666a';
      if (pt.val >= 30) return '#f0b429';
      return '#3ecf8e';
    };
    const stressPoints = stressData.map(p => ({ x: p.t, y: p.val }));
    const tMax = stressData[stressData.length-1].t;
    const tMin = stressData[0].t;

    const stressCtx = document.getElementById('cRptStress').getContext('2d');
    // Segment colors as background fill areas
    // Use gradient-like approach: single dataset with point background colors
    rptCharts.stress = new Chart(stressCtx, {
      type: 'line',
      data: {
        datasets: [
          // Colored line segments (one dataset per color range, filled)
          {
            label: 'Score',
            data: stressPoints,
            borderColor: '#2d7dd2',
            borderWidth: 2,
            pointRadius: stressPoints.length < 120 ? 2 : 0,
            pointBackgroundColor: stressData.map(p => mkSegColor(p)),
            fill: false, tension: 0.2,
            segment: {
              borderColor: ctx => {
                const v = ctx.p0.parsed.y;
                if (v >= 80) return '#c0392b';
                if (v >= 60) return '#f2666a';
                if (v >= 30) return '#f0b429';
                return '#3ecf8e';
              }
            }
          },
          // Threshold 60 dashed line
          {
            label: 'Threshold 60',
            data: [{ x: tMin, y: 60 }, { x: tMax, y: 60 }],
            borderColor: '#e74c3c', borderWidth: 1.2,
            borderDash: [5, 4], pointRadius: 0, fill: false,
          },
          // Threshold 30 dashed line
          {
            label: 'Threshold 30',
            data: [{ x: tMin, y: 30 }, { x: tMax, y: 30 }],
            borderColor: '#f0b429', borderWidth: 1,
            borderDash: [3, 4], pointRadius: 0, fill: false,
          },
        ]
      },
      options: {
        ...lightOpts,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                if (ctx.datasetIndex !== 0) return null;
                const v = ctx.parsed.y;
                const lv = v>=80?'高度緊張':v>=60?'中度緊張':v>=30?'輕度緊張':'放鬆';
                return `Score: ${v.toFixed(1)} — ${lv}`;
              }
            }
          }
        },
        scales: {
          ...lightOpts.scales,
          y: {
            ...lightOpts.scales.y,
            min: 0, max: 100,
            ticks: { color:'#bbb', font:{size:8,family:'IBM Plex Mono'}, callback: v => v },
          }
        }
      }
    });
  }

  const mkRpt = (id, color, arr, yKey='raw') => {
    const canvas = document.getElementById(id);
    if (!canvas || !arr.length) return;
    return new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets: [{ data: arr.map(p=>({x:p.t,y:p[yKey]})), borderColor:color, borderWidth:1.3, pointRadius:0, fill:false, tension:0.2 }] },
      options: lightOpts,
    });
  };
  rptCharts.hr   = mkRpt('cRptHR',   '#e74c3c', S.hr);
  rptCharts.gsr  = mkRpt('cRptGSR',  '#d4a017', S.gsr);
  rptCharts.resp = mkRpt('cRptResp', '#27ae60', S.resp);
}

// Print report
document.getElementById('btnPrintReport').addEventListener('click', () => {
  window.print();
});

