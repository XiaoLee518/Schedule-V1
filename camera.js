// Camera recording & playback
// Source: biomonitor_v26.html lines 4794-5116

// CAMERA RECORDING SYSTEM
// ============================================================
const CAM = {
  stream:null, recorder:null, chunks:[], recordedBlob:null,
  slices:[], recordingStart:null, sliceStart:null,
  active:false, sliceTimer:null, dataTimer:null,
  dataStartMs:null,  // 數據開始時間（用於影片offset計算）
};
const SLICE_MINUTES = 5;

function getSupportedMime() {
  const types=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
  return types.find(t=>MediaRecorder.isTypeSupported(t))||'video/webm';
}
async function camStart(silent=false) {
  if(CAM.active) return;
  try {
    if(!CAM.stream) CAM.stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    CAM.chunks=[]; CAM.recordedBlob=null; CAM.slices=[];
    CAM.recordingStart=Date.now(); CAM.sliceStart=Date.now();
    // 保存數據開始時間（錄製時的實際數據開始時間）
    CAM.dataStartMs = S.startMs ? S.startMs + (CFG.calib||0)*1000 : Date.now();
    CAM.recorder=new MediaRecorder(CAM.stream,{mimeType:getSupportedMime()});
    CAM.recorder.ondataavailable=e=>{if(e.data&&e.data.size>0)CAM.chunks.push(e.data);};
    CAM.recorder.onstop=()=>{
      if(CAM.chunks.length>0){
        const blob=new Blob(CAM.chunks,{type:CAM.recorder.mimeType});
        CAM.slices.push({blob,startMs:CAM.sliceStart,endMs:Date.now(),label:'片段'+(CAM.slices.length+1)});
        CAM.recordedBlob=new Blob(CAM.slices.map(s=>s.blob),{type:CAM.recorder.mimeType});
        CAM.chunks=[];
      }
      CAM.active=false; clearInterval(CAM.sliceTimer); clearInterval(CAM.dataTimer); camUpdateUI();
    };
    CAM.recorder.start(); CAM.active=true;
    // 用 requestData 定期收集，避免 iOS Safari start(timeslice) 自動停止的 bug
    CAM.dataTimer=setInterval(()=>{
      if(CAM.recorder&&CAM.recorder.state==='recording'){try{CAM.recorder.requestData();}catch(e){}}
    },1000);
    CAM.sliceTimer=setInterval(()=>camSlice(),SLICE_MINUTES*60*1000);
    camUpdateUI();
  } catch(err) {
    if(!silent) alert('無法存取鏡頭：'+err.message);
    CAM.active=false; camUpdateUI();
  }
}
function camSlice() {
  if(!CAM.active||!CAM.recorder||CAM.recorder.state==='inactive') return;
  if(CAM.chunks.length>0){
    const blob=new Blob(CAM.chunks,{type:CAM.recorder.mimeType});
    CAM.slices.push({blob,startMs:CAM.sliceStart,endMs:Date.now(),label:'片段'+(CAM.slices.length+1)});
    CAM.chunks=[]; CAM.sliceStart=Date.now();
    CAM.recordedBlob=new Blob(CAM.slices.map(s=>s.blob),{type:CAM.recorder.mimeType});
    camUpdateUI();
  }
}
function camStop() {
  clearInterval(CAM.sliceTimer); clearInterval(CAM.dataTimer);
  if(CAM.recorder&&CAM.recorder.state!=='inactive') {
    // 停止錄製，onstop 事件會處理最後的合併
    CAM.recorder.stop();
  } else if (CAM.slices.length > 0 && !CAM.recordedBlob) {
    // 如果已經有片段但沒有合併，立即合併
    CAM.recordedBlob = new Blob(CAM.slices.map(s => s.blob), {type: CAM.slices[0].blob.type});
    console.log(`[錄影] 合併 ${CAM.slices.length} 個片段，總大小: ${(CAM.recordedBlob.size/1024/1024).toFixed(2)} MB`);
    camUpdateUI();
  }
}
function camUpdateUI() {
  const ind=document.getElementById('camIndicator');
  const txt=document.getElementById('camText');
  const mpBtn=document.getElementById('mpCamBtn');
  const hasRec=CAM.recordedBlob||CAM.slices.length>0;
  const _isEN=typeof _lang!=='undefined'&&_lang==='en';
  if(ind){
    if(CAM.active){ind.classList.remove('cam-off');if(txt)txt.textContent=_isEN?'Recording':'錄製中';}
    else{ind.classList.add('cam-off');if(txt)txt.textContent=hasRec?(_isEN?'Has recording':'有錄影'):(_isEN?'No recording':'未錄製');}
  }
  if(mpBtn){
    mpBtn.textContent=CAM.active?(_isEN?'Stop Recording':'停止錄製'):hasRec?(_isEN?'View Playback':'查看回放'):(_isEN?'Camera':'鏡頭');
    mpBtn.style.borderColor=CAM.active||!hasRec?'rgba(242,102,106,.5)':'rgba(62,207,142,.5)';
    mpBtn.style.color=CAM.active||!hasRec?'var(--red)':'var(--green)';
  }
}
function camAutoStart(){if(!CAM.active) camStart(true);}
function camAutoStop(){if(CAM.active) camSlice();}
window.addEventListener('load',()=>setTimeout(()=>camStart(true),800));

// ── Utility: format datetime for filename ──────────────────
function fmtDT(d) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
}

// ── Build stress events list ───────────────────────────────
function buildStressEvents(minScore=60, mergeGapSec=2) {
  const events = [];
  if (!S.score.length) return events;
  let inEv = false, evStart = 0, evPeak = 0;
  for (let i = 0; i < S.score.length; i++) {
    const v = S.score[i].val, t = S.score[i].t;
    if (!inEv && v >= minScore) { inEv = true; evStart = t; evPeak = v; }
    else if (inEv && v >= minScore) { evPeak = Math.max(evPeak, v); }
    else if (inEv && v < minScore) {
      // Check if there's another event within mergeGapSec
      const nextHigh = S.score.slice(i).find(p => p.val >= minScore && p.t - t <= mergeGapSec);
      if (!nextHigh) {
        events.push({ start: evStart, end: t, peak: evPeak });
        inEv = false;
      }
    }
  }
  if (inEv) events.push({ start: evStart, end: S.score[S.score.length-1].t, peak: evPeak });
  return events;
}

// ── Extract a video segment from a Blob using a hidden video ──
async function extractVideoSegment(sourceBlob, startSec, endSec) {
  return new Promise((resolve, reject) => {
    const mimeType = sourceBlob.type || 'video/webm';
    if (!MediaRecorder.isTypeSupported(mimeType) && !MediaRecorder.isTypeSupported('video/webm')) {
      // Fallback: return the full blob sliced by byte offset (not ideal but works)
      resolve(sourceBlob);
      return;
    }
    const url = URL.createObjectURL(sourceBlob);
    const vid = document.createElement('video');
    vid.src = url;
    vid.muted = true;
    vid.preload = 'auto';

    const canvas = document.createElement('canvas');
    const chunks = [];

    vid.addEventListener('loadedmetadata', () => {
      canvas.width  = vid.videoWidth  || 640;
      canvas.height = vid.videoHeight || 480;
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported(mimeType)?mimeType:'video/webm' });
      rec.ondataavailable = e => { if(e.data && e.data.size>0) chunks.push(e.data); };
      rec.onstop = () => {
        URL.revokeObjectURL(url);
        resolve(new Blob(chunks, { type: rec.mimeType }));
      };

      const ctx = canvas.getContext('2d');
      vid.currentTime = Math.max(0, startSec);

      vid.addEventListener('seeked', function onSeeked() {
        if (vid.currentTime < startSec - 0.05) { vid.currentTime = startSec; return; }
        rec.start();
        function drawFrame() {
          if (vid.currentTime >= endSec || vid.ended) {
            rec.stop();
            return;
          }
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          vid.currentTime = Math.min(vid.currentTime + 1/30, endSec);
        }
        vid.addEventListener('seeked', function frameStep() {
          if (vid.currentTime >= endSec || vid.ended) {
            vid.removeEventListener('seeked', frameStep);
            setTimeout(() => rec.stop(), 100);
            return;
          }
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          vid.currentTime = Math.min(vid.currentTime + 1/30, endSec);
        });
        vid.removeEventListener('seeked', onSeeked);
        drawFrame();
      });
    });
    vid.addEventListener('error', reject);
  });
}

function openPlayback(dataTimeSec) {
  if(!CAM.recordedBlob&&CAM.slices.length===0){alert('沒有錄影資料。');return;}
  const modal=document.getElementById('playbackModal');
  const video=document.getElementById('playbackVideo');
  if(!modal||!video) return;
  if(video.src) URL.revokeObjectURL(video.src);
  const blob=CAM.recordedBlob||CAM.slices[CAM.slices.length-1].blob;
  video.src=URL.createObjectURL(blob);
  const dataDuration=S.score.length>0?S.score[S.score.length-1].t:0;
  const dataStartMs=S.startMs?S.startMs+CFG.calib*1000:CAM.recordingStart;
  const videoOffset=CAM.recordingStart?(dataStartMs-CAM.recordingStart)/1000:0;
  const jumpTo=sec=>{video.currentTime=Math.max(0,videoOffset+sec);video.play();};
  video.addEventListener('loadedmetadata',()=>jumpTo(dataTimeSec||0),{once:true});

  const evList=document.getElementById('pbEventList');
  const timeline=document.getElementById('pbTimeline');
  const clipsList=document.getElementById('pbClipsList');
  if(evList) evList.innerHTML='';
  if(clipsList) clipsList.innerHTML='';
  if(timeline) timeline.querySelectorAll('.pb-marker').forEach(m=>m.remove());

  const events = buildStressEvents(60, 2);

  // Timeline markers + event chips
  events.forEach((ev,idx)=>{
    const pct=dataDuration>0?ev.start/dataDuration*100:0;
    if(timeline){
      const marker=document.createElement('div');
      marker.className='pb-marker';
      marker.style.left=pct+'%';
      marker.setAttribute('data-label','#'+(idx+1)+' '+ev.start.toFixed(0)+'s');
      marker.addEventListener('click',()=>jumpTo(ev.start));
      timeline.appendChild(marker);
    }
    if(evList){
      const chip=document.createElement('button');
      chip.style.cssText='padding:3px 9px;font-size:.65rem;cursor:pointer;border:1px solid var(--red);color:var(--red);background:transparent;border-radius:3px;font-family:var(--mono)';
      chip.textContent='#'+(idx+1)+' '+ev.start.toFixed(0)+'s (peak:'+ev.peak.toFixed(0)+')';
      chip.addEventListener('click',()=>jumpTo(ev.start));
      evList.appendChild(chip);
    }
    // Per-clip download row
    if(clipsList){
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg3);border-radius:5px;border:1px solid var(--line)';
      const label=document.createElement('span');
      label.style.cssText='font-family:var(--mono);font-size:.68rem;color:var(--text2);flex:1';
      label.textContent=`#${idx+1} — ${ev.start.toFixed(1)}s → ${ev.end.toFixed(1)}s | peak: ${ev.peak.toFixed(0)}`;
      const jumpBtn=document.createElement('button');
      jumpBtn.className='btn';jumpBtn.style.fontSize='.65rem';jumpBtn.style.padding='3px 8px';
      jumpBtn.textContent=' 跳轉';
      jumpBtn.addEventListener('click',()=>jumpTo(ev.start));
      const dlBtn=document.createElement('button');
      dlBtn.className='btn btn-success';dlBtn.style.fontSize='.65rem';dlBtn.style.padding='3px 8px';
      dlBtn.textContent=' 下載';
      dlBtn.addEventListener('click',async()=>{
        dlBtn.disabled=true; dlBtn.textContent='處理中...';
        try {
          const startTime = S.startMs ? new Date(dataStartMs) : new Date();
          const clipStart = videoOffset + ev.start;
          const clipEnd   = videoOffset + ev.end;
          const ext = blob.type.includes('mp4')?'mp4':'webm';
          const fname = `${fmtDT(startTime)}_stress${Math.round(ev.peak)}.${ext}`;
          // Simple approach: use seeked canvas recording
          const clipBlob = await extractVideoSegment(blob, clipStart, clipEnd);
          const a=document.createElement('a');
          a.href=URL.createObjectURL(clipBlob);
          a.download=fname;
          a.click();
          setTimeout(()=>URL.revokeObjectURL(a.href),200);
        } catch(e) {
          alert('片段截取失敗，請改用全段下載：'+e.message);
        } finally {
          dlBtn.disabled=false; dlBtn.textContent=' 下載';
        }
      });
      row.appendChild(label);row.appendChild(jumpBtn);row.appendChild(dlBtn);
      clipsList.appendChild(row);
    }
  });

  if(evList&&events.length===0) evList.innerHTML='<span style="color:var(--text3);font-size:.68rem;font-family:var(--mono)">無緊張事件</span>';
  if(clipsList&&events.length===0) clipsList.innerHTML='<span style="color:var(--text3);font-size:.68rem;font-family:var(--mono)">無緊張事件可截取</span>';

  modal.classList.add('show');
}

document.getElementById('btnPlaybackClose')?.addEventListener('click',()=>{
  document.getElementById('playbackModal')?.classList.remove('show');
  document.getElementById('playbackVideo')?.pause();
});

// Download full video
document.getElementById('btnExportVideo')?.addEventListener('click',()=>{
  if(!CAM.recordedBlob&&CAM.slices.length===0) return;
  const blob=CAM.recordedBlob||CAM.slices[CAM.slices.length-1].blob;
  const startTime=S.startMs?new Date(S.startMs+CFG.calib*1000):new Date();
  const ext=blob.type.includes('mp4')?'mp4':'webm';
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`BioMonitor_${fmtDT(startTime)}_full.${ext}`;
  a.click(); URL.revokeObjectURL(a.href);
});

// Download all stress clips as sequential download
document.getElementById('btnDownloadClips')?.addEventListener('click',async()=>{
  if(!CAM.recordedBlob&&CAM.slices.length===0){alert('沒有錄影資料。');return;}
  const blob=CAM.recordedBlob||CAM.slices[CAM.slices.length-1].blob;
  const dataStartMs=S.startMs?S.startMs+CFG.calib*1000:CAM.recordingStart;
  const videoOffset=CAM.recordingStart?(dataStartMs-CAM.recordingStart)/1000:0;
  const events = buildStressEvents(60, 2);
  if(!events.length){alert('無緊張事件（Score < 60），無法截取片段。');return;}
  const btn=document.getElementById('btnDownloadClips');
  btn.disabled=true;btn.textContent='截取中...';
  const ext=blob.type.includes('mp4')?'mp4':'webm';
  const startTime=S.startMs?new Date(dataStartMs):new Date();
  for(let i=0;i<events.length;i++){
    const ev=events[i];
    btn.textContent=`截取 ${i+1}/${events.length}...`;
    try {
      const clipBlob=await extractVideoSegment(blob,videoOffset+ev.start,videoOffset+ev.end);
      const fname=`${fmtDT(startTime)}_stress${Math.round(ev.peak)}_clip${i+1}.${ext}`;
      const a=document.createElement('a');a.href=URL.createObjectURL(clipBlob);a.download=fname;
      a.click();await new Promise(r=>setTimeout(r,400));URL.revokeObjectURL(a.href);
    }catch(e){console.warn('clip',i,'failed',e);}
  }
  btn.disabled=false;btn.textContent='下載緊張片段';
});

// Download session: CSV + video bundle
document.getElementById('btnDownloadSession')?.addEventListener('click',()=>{
  // Export CSV
  if(S.hr.length) {
    exportCsv();
    setTimeout(()=>{
      // Then export video
      if(CAM.recordedBlob||CAM.slices.length>0){
        const blob=CAM.recordedBlob||CAM.slices[CAM.slices.length-1].blob;
        const startTime=S.startMs?new Date(S.startMs+CFG.calib*1000):new Date();
        const ext=blob.type.includes('mp4')?'mp4':'webm';
        const a=document.createElement('a');a.href=URL.createObjectURL(blob);
        a.download=`BioMonitor_${fmtDT(startTime)}_full.${ext}`;
        a.click();URL.revokeObjectURL(a.href);
      }
    },600);
  } else {
    alert('尚無量測數據。');
  }
});

