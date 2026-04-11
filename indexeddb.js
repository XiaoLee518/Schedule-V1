// IndexedDB recording history
// Source: biomonitor_v26.html lines 5721-6146

// ============================================================
//  回放頁面 — IndexedDB 保存最近 5 次錄影
// ============================================================
const PB_DB_NAME    = 'BioMonitorRecordings';
const PB_DB_VERSION = 1;
const PB_STORE      = 'recordings';
const PB_MAX        = 5;

let pbDB = null;

// ── 開啟 IndexedDB ──────────────────────────────────────────
function pbOpenDB() {
  return new Promise((resolve, reject) => {
    if (pbDB) return resolve(pbDB);
    const req = indexedDB.open(PB_DB_NAME, PB_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(PB_STORE)) {
        const store = db.createObjectStore(PB_STORE, { keyPath: 'id' });
        store.createIndex('ts', 'ts', { unique: false });
      }
    };
    req.onsuccess = e => { pbDB = e.target.result; resolve(pbDB); };
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 取得所有錄影（依時間降序）──────────────────────────────
async function pbGetAll() {
  const db = await pbOpenDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(PB_STORE, 'readonly');
    const store = tx.objectStore(PB_STORE);
    const req   = store.index('ts').getAll();
    req.onsuccess = e => resolve(e.target.result.sort((a,b) => b.ts - a.ts));
    req.onerror   = e => reject(e.target.error);
  });
}

// ── 儲存一筆錄影（自動刪除超出 5 筆的舊資料）──────────────
async function pbSaveRecording(blob, events, sessionMeta) {
  const db   = await pbOpenDB();
  const id   = 'rec_' + Date.now();
  const record = {
    id,
    ts:     Date.now(),
    blob,
    mimeType: blob.type,
    events,   // [{start,end,peak,avg}]
    meta: sessionMeta, // {startDT, duration, avgScore, peakScore, baseBPM, baseRPM}
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PB_STORE, 'readwrite');
    tx.objectStore(PB_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });

  // 刪除超出 MAX 的舊紀錄
  const all = await pbGetAll();
  if (all.length > PB_MAX) {
    const toDelete = all.slice(PB_MAX);
    const tx2 = db.transaction(PB_STORE, 'readwrite');
    toDelete.forEach(r => tx2.objectStore(PB_STORE).delete(r.id));
    await new Promise((res, rej) => { tx2.oncomplete = res; tx2.onerror = rej; });
  }
  return id;
}

// ── 刪除一筆 ──────────────────────────────────────────────
async function pbDeleteRecording(id) {
  const db = await pbOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PB_STORE, 'readwrite');
    tx.objectStore(PB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

// ── 清除全部 ──────────────────────────────────────────────
async function pbClearAll() {
  const db = await pbOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PB_STORE, 'readwrite');
    tx.objectStore(PB_STORE).clear();
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });
}

// ── 量測結束後自動存檔 ────────────────────────────────────
async function pbAutoSave() {
  if (!CAM.recordedBlob && CAM.slices.length === 0) return;
  const blob   = CAM.recordedBlob || CAM.slices[CAM.slices.length-1].blob;
  const events = (typeof buildStressEvents === 'function') ? buildStressEvents(60, 2) : [];
  const scores = S.score && S.score.length > 0 ? S.score.map(p=>p.val) : [];
  const startDT = S.startMs ? new Date(S.startMs + (CFG.calib||0)*1000) : new Date();
  const dur     = S.hr && S.hr.length > 0 ? S.hr[S.hr.length-1].t : 0;
  const meta = {
    startDT:   startDT.toLocaleString('zh-TW'),
    startTs:   startDT.getTime(),
    duration:  dur,
    avgScore:  scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : '--',
    peakScore: scores.length ? Math.max(...scores).toFixed(1) : '--',
    baseBPM:   S.base?.bpm  != null ? S.base.bpm.toFixed(1)  : '--',
    baseRPM:   S.base?.rpm  != null ? S.base.rpm.toFixed(1)  : '--',
    eventCount: events.length,
  };
  try {
    await pbSaveRecording(blob, events, meta);
    console.log('[PB] Recording saved to IndexedDB');
  } catch(e) {
    console.warn('[PB] Save failed:', e);
  }
}

// ── 格式化工具 ────────────────────────────────────────────
function pbFmtDur(sec) {
  const m = Math.floor(sec/60), s = Math.round(sec%60);
  return `${m}:${String(s).padStart(2,'0')}`;
}
function pbFmtDT(ts) {
  return new Date(ts).toLocaleString('zh-TW', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

// ── 開啟嵌入播放器 ───────────────────────────────────────
function pbOpenPlayer(record, jumpToSec) {
  const wrap    = document.getElementById('pbPlayerWrap');
  const video   = document.getElementById('pbInlineVideo');
  const title   = document.getElementById('pbPlayerTitle');
  const timeline = document.getElementById('pbInlineTimeline');
  const evDiv   = document.getElementById('pbInlineEvents');
  const clipsDiv = document.getElementById('pbInlineClips');
  if (!wrap || !video) return;

  // 釋放舊 URL
  if (video.src) URL.revokeObjectURL(video.src);
  const url = URL.createObjectURL(record.blob);
  video.src = url;
  video.load();

  title.textContent = ` ${record.meta.startDT}`;
  wrap.style.display = 'block';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // 計算影片偏移（錄影可能比量測稍早開始）
  const dataStartMs  = record.meta.startTs || Date.now();
  const recStartMs   = record.meta.recStartMs;  // 不使用 || 運算符
  const videoOffset  = recStartMs ? Math.max(0, (dataStartMs - recStartMs) / 1000) : 0;
  const dataDuration = record.meta.duration || 0;

  const jumpTo = sec => {
    const targetTime = videoOffset + sec;
    console.log('[影片跳轉]', {
      '請求秒數': sec,
      'videoOffset': videoOffset,
      '目標時間': targetTime,
      '影片總長': video.duration,
      'dataStartMs': dataStartMs,
      'recStartMs': recStartMs,
      '時間差(秒)': (dataStartMs - recStartMs) / 1000
    });
    video.currentTime = Math.max(0, targetTime);
    video.play().catch(()=>{});
  };

  // 跳到指定秒數
  if (jumpToSec != null) {
    video.addEventListener('loadedmetadata', () => jumpTo(jumpToSec), { once: true });
  }

  // 時間軸 + 事件晶片
  evDiv.innerHTML   = '';
  clipsDiv.innerHTML = '';
  timeline.querySelectorAll('.pb-dot').forEach(d => d.remove());

  const events = record.events || [];

  // 時間軸點擊跳轉
  timeline.onclick = e => {
    const rect = timeline.getBoundingClientRect();
    const pct  = (e.clientX - rect.left) / rect.width;
    jumpTo(pct * dataDuration);
  };

  // 播放進度條
  video.addEventListener('timeupdate', () => {
    const prog = document.getElementById('pbInlineProgress');
    if (prog && video.duration > 0)
      prog.style.width = (video.currentTime / video.duration * 100) + '%';
  });

  events.forEach((ev, idx) => {
    // 時間軸紅點
    const pct = dataDuration > 0 ? ev.start / dataDuration * 100 : 0;
    const dot = document.createElement('div');
    dot.className = 'pb-dot';
    dot.style.cssText = `position:absolute;top:50%;left:${pct}%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:var(--red);cursor:pointer;box-shadow:0 0 4px var(--red)`;
    dot.title = `#${idx+1} ${ev.start.toFixed(1)}s`;
    dot.addEventListener('click', e => { e.stopPropagation(); jumpTo(ev.start); });
    timeline.appendChild(dot);

    // 事件晶片
    const chip = document.createElement('button');
    chip.style.cssText = 'padding:3px 9px;font-size:.63rem;cursor:pointer;border:1px solid var(--red);color:var(--red);background:transparent;border-radius:4px;font-family:var(--mono)';
    chip.textContent = `#${idx+1} ${ev.start.toFixed(0)}s (peak:${ev.peak.toFixed(0)})`;
    chip.addEventListener('click', () => jumpTo(ev.start));
    evDiv.appendChild(chip);

    // 逐段下載列
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg3);border-radius:5px;border:1px solid var(--line);flex-wrap:wrap';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-family:var(--mono);font-size:.65rem;color:var(--text2);flex:1;min-width:160px';
    lbl.textContent = `#${idx+1}  ${ev.start.toFixed(1)}s → ${ev.end.toFixed(1)}s  |  peak: ${ev.peak.toFixed(0)}  |  持續: ${(ev.end-ev.start).toFixed(0)}s`;

    const jBtn = document.createElement('button');
    jBtn.className = 'btn';
    jBtn.style.cssText = 'font-size:.63rem;padding:3px 8px';
    jBtn.textContent = ' 跳轉';
    jBtn.addEventListener('click', () => jumpTo(ev.start));

    const dBtn = document.createElement('button');
    dBtn.className = 'btn';
    dBtn.style.cssText = 'font-size:.63rem;padding:3px 8px;border-color:var(--green);color:var(--green)';
    dBtn.textContent = ' 下載片段';
    dBtn.addEventListener('click', async () => {
      dBtn.disabled = true; dBtn.textContent = '處理中...';
      try {
        const ext  = record.blob.type.includes('mp4') ? 'mp4' : 'webm';
        const fname = `BioMonitor_${pbFmtDT(record.meta.startTs||Date.now()).replace(/[\/\s:]/g,'')}_stress${Math.round(ev.peak)}_#${idx+1}.${ext}`;
        // 直接下載整段（片段截取需 WebCodecs，此處用整段+提示）
        let clipBlob = record.blob;
        if (typeof extractVideoSegment === 'function') {
          try { clipBlob = await extractVideoSegment(record.blob, videoOffset+ev.start, videoOffset+ev.end); }
          catch(_) {}
        }
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(clipBlob), download: fname });
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 300);
      } catch(e) { alert('下載失敗: ' + e.message); }
      finally { dBtn.disabled = false; dBtn.textContent = ' 下載片段'; }
    });

    row.appendChild(lbl); row.appendChild(jBtn); row.appendChild(dBtn);
    clipsDiv.appendChild(row);
  });

  if (events.length === 0) {
    evDiv.innerHTML   = '<span style="color:var(--text3);font-family:var(--mono);font-size:.65rem">無緊張事件</span>';
    clipsDiv.innerHTML = '<span style="color:var(--text3);font-family:var(--mono);font-size:.65rem">無緊張事件片段</span>';
  }
}

// ── 關閉播放器 ────────────────────────────────────────────
document.getElementById('pbPlayerClose')?.addEventListener('click', () => {
  const video = document.getElementById('pbInlineVideo');
  const wrap  = document.getElementById('pbPlayerWrap');
  if (video) { video.pause(); if (video.src) URL.revokeObjectURL(video.src); video.src = ''; }
  if (wrap)  wrap.style.display = 'none';
});

// ── 渲染歷史列表 ─────────────────────────────────────────
async function pbRenderHistory() {
  const listEl   = document.getElementById('pbHistoryList');
  const wrapEl   = document.getElementById('pbHistoryWrap');
  const noSessEl = document.getElementById('pbNoSession');
  const curSessEl= document.getElementById('pbCurrentSession');
  if (!listEl) return;

  // 目前量測錄影（記憶體內）
  const hasCurrent = CAM.recordedBlob || CAM.slices.length > 0;
  if (curSessEl) {
    curSessEl.style.display = hasCurrent ? 'block' : 'none';
    if (hasCurrent) {
      const curBlob   = CAM.recordedBlob || CAM.slices[CAM.slices.length-1].blob;
      const curEvents = (typeof buildStressEvents === 'function') ? buildStressEvents(60, 2) : [];
      const infoEl    = document.getElementById('pbCurrentInfo');
      const evEl      = document.getElementById('pbCurrentEvents');
      const scores    = S.score ? S.score.map(p=>p.val) : [];
      if (infoEl) {
        const dur = S.hr?.length ? S.hr[S.hr.length-1].t : 0;
        const avg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1) : '--';
        const pk  = scores.length ? Math.max(...scores).toFixed(1) : '--';
        infoEl.textContent = `時長: ${pbFmtDur(dur)}  |  平均壓力: ${avg}  |  最高壓力: ${pk}  |  緊張事件: ${curEvents.length} 次`;
      }
      if (evEl) {
        evEl.innerHTML = '';
        curEvents.slice(0, 6).forEach((ev, i) => {
          const chip = document.createElement('button');
          chip.style.cssText = 'padding:2px 8px;font-size:.62rem;cursor:pointer;border:1px solid var(--red);color:var(--red);background:transparent;border-radius:3px;font-family:var(--mono)';
          chip.textContent = `#${i+1} ${ev.start.toFixed(0)}s`;
          chip.addEventListener('click', () => {
            const rec = { blob: curBlob, events: curEvents, meta: { startDT: new Date().toLocaleString('zh-TW'), duration: S.hr?.length ? S.hr[S.hr.length-1].t : 0, recStartMs: CAM.recordingStart, startTs: CAM.dataStartMs || Date.now() } };
            pbOpenPlayer(rec, ev.start);
          });
          evEl.appendChild(chip);
        });
      }

      document.getElementById('pbCurrentPlayBtn')?.addEventListener('click', () => {
        const rec = { blob: curBlob, events: curEvents, meta: { startDT: new Date().toLocaleString('zh-TW'), duration: S.hr?.length ? S.hr[S.hr.length-1].t : 0, recStartMs: CAM.recordingStart, startTs: CAM.dataStartMs || Date.now() } };
        pbOpenPlayer(rec, 0);
      }, { once: true });

      document.getElementById('pbCurrentDlBtn')?.addEventListener('click', () => {
        const ext  = curBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const fname = `BioMonitor_${new Date().toISOString().slice(0,19).replace(/[:\-T]/g,'')}.${ext}`;
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(curBlob), download: fname });
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 300);
      }, { once: true });

      document.getElementById('pbCurrentSaveBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('pbCurrentSaveBtn');
        if (btn) { btn.disabled = true; btn.textContent = '儲存中...'; }
        await pbAutoSave();
        if (btn) { btn.textContent = '已儲存'; }
        await pbRenderHistory();
      }, { once: true });
    }
  }

  // 歷史列表
  let records = [];
  try { records = await pbGetAll(); } catch(e) { console.warn('[PB] DB read error', e); }

  const hasAny = hasCurrent || records.length > 0;
  if (noSessEl)  noSessEl.style.display  = hasAny ? 'none'  : 'block';
  if (wrapEl)    wrapEl.style.display    = records.length ? 'block' : 'none';

  listEl.innerHTML = '';
  records.forEach((rec, idx) => {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg2);border:1px solid var(--line);border-radius:8px;overflow:hidden';

    // 標頭列
    const head = document.createElement('div');
    head.style.cssText = 'padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;cursor:pointer';
    head.innerHTML = `
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--mono);font-size:.72rem;font-weight:700;color:var(--text)">#${records.length - idx}  ${rec.meta.startDT}</div>
        <div style="font-family:var(--mono);font-size:.6rem;color:var(--text3);margin-top:2px">
          時長: ${pbFmtDur(rec.meta.duration||0)}  ·  平均壓力: ${rec.meta.avgScore}  ·  最高: ${rec.meta.peakScore}  ·  緊張事件: ${(rec.events||[]).length} 次
 </div>
 </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn pb-play-btn" style="font-size:.65rem;padding:3px 9px;border-color:var(--green);color:var(--green)">播放</button>
        <button class="btn pb-dl-btn"   style="font-size:.65rem;padding:3px 9px">下載</button>
        <button class="btn pb-del-btn"  style="font-size:.65rem;padding:3px 9px;border-color:var(--red);color:var(--red)">[X]</button>
 </div>`;

    // 緊張時刻晶片
    const evRow = document.createElement('div');
    evRow.style.cssText = 'padding:0 14px 10px;display:flex;flex-wrap:wrap;gap:5px';
    (rec.events||[]).slice(0,8).forEach((ev, i) => {
      const chip = document.createElement('button');
      chip.style.cssText = 'padding:2px 8px;font-size:.6rem;cursor:pointer;border:1px solid rgba(242,102,106,.5);color:var(--red);background:transparent;border-radius:3px;font-family:var(--mono)';
      chip.textContent = `#${i+1} ${ev.start.toFixed(0)}s  peak:${ev.peak.toFixed(0)}`;
      chip.addEventListener('click', e => { e.stopPropagation(); pbOpenPlayer(rec, ev.start); });
      evRow.appendChild(chip);
    });
    if ((rec.events||[]).length === 0) {
      evRow.innerHTML = '<span style="font-family:var(--mono);font-size:.6rem;color:var(--text3)">無緊張事件</span>';
    }

    card.appendChild(head);
    card.appendChild(evRow);
    listEl.appendChild(card);

    // 播放
    card.querySelector('.pb-play-btn')?.addEventListener('click', e => { e.stopPropagation(); pbOpenPlayer(rec, 0); });
    // 下載
    card.querySelector('.pb-dl-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const ext  = (rec.mimeType||'').includes('mp4') ? 'mp4' : 'webm';
      const fname = `BioMonitor_${pbFmtDT(rec.ts).replace(/[\/\s:]/g,'')}.${ext}`;
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(rec.blob), download: fname });
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 300);
    });
    // 刪除
    card.querySelector('.pb-del-btn')?.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`刪除此筆錄影記錄？`)) return;
      await pbDeleteRecording(rec.id);
      await pbRenderHistory();
    });
  });
}

// ── 按鈕綁定 ────────────────────────────────────────────
document.getElementById('pbRefreshBtn')?.addEventListener('click', pbRenderHistory);
document.getElementById('pbClearAllBtn')?.addEventListener('click', async () => {
  if (!confirm('確定清除全部歷史錄影？（不可復原）')) return;
  await pbClearAll();
  // 關閉播放器
  const video = document.getElementById('pbInlineVideo');
  if (video) { video.pause(); video.src = ''; }
  document.getElementById('pbPlayerWrap').style.display = 'none';
  await pbRenderHistory();
});

// ── 切到回放 tab 時自動刷新 ──────────────────────────────
document.querySelectorAll('.sub-tab[data-subtab="playback"]').forEach(btn => {
  btn.addEventListener('click', pbRenderHistory);
});

// ── 量測結束時自動存檔 ─────────────────────────────────
// 掛在 handleEnd 之後（覆寫 camAutoStop 後面）
const _origHandleEnd = typeof handleEnd === 'function' ? handleEnd : null;
window.handleEnd = async function() {
  if (_origHandleEnd) _origHandleEnd();
  // 等錄影 stop 完成後存檔
  setTimeout(async () => {
    if (CAM.recordedBlob || CAM.slices.length > 0) {
      await pbAutoSave();
      console.log('[PB] Auto-saved after session end');
    }
  }, 1500);
};

// ── 初始化：開啟 DB ──────────────────────────────────────
pbOpenDB().catch(e => console.warn('[PB] IndexedDB init failed:', e));

