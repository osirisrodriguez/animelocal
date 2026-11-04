const $ = id => document.getElementById(id);
const v = $('v'), list = $('list');
let eps = [], subs = {}, cur = -1, curUrl = null;
let view = { mode: 'catalog', folder: null, kind: null };

const VIDEO_EXT = /\.(mp4|mkv|webm|m4v|mov|avi|ogv)$/i;
const MOVIE_FOLDER_RE = /pel[ií]cul|pelicula|movie|film|cine|ghibli/i;
const base = n => n.replace(/\.[^.]+$/, '');

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('al:' + k)); } catch { return null; } },
  set(k, val) { try { localStorage.setItem('al:' + k, JSON.stringify(val)); } catch {} }
};

const key = f => f.name + '|' + f.size;

let showHidden = false;
const getHidden = () => {
  const arr = store.get('hiddenSeries');
  return Array.isArray(arr) ? arr : [];
};
function hideSeries(name) {
  const hidden = getHidden();
  if (!hidden.includes(name)) hidden.push(name);
  store.set('hiddenSeries', hidden);
  renderCatalog();
}
function unhideSeries(name) {
  store.set('hiddenSeries', getHidden().filter(n => n !== name));
  renderCatalog();
}

const urlCache = new WeakMap();
function objectUrl(file) {
  let u = urlCache.get(file);
  if (!u) { u = URL.createObjectURL(file); urlCache.set(file, u); }
  return u;
}

function looksLikeSeries(videos) {
  if (videos.length < 2) return false;
  const names = videos.map(f => base(f.name).toLowerCase()).sort();
  if (names.some(n => /(?:^|[\s._-])(?:ep?|cap(?:[ií]tulo)?|episodio|s\d{1,2}e\d{1,3}|t\d{1,2}e\d{1,3})\s*\.?\s*\d/i.test(n))) {
    return true;
  }
  const first = names[0], last = names[names.length - 1];
  let i = 0;
  while (i < first.length && i < last.length && first[i] === last[i]) i++;
  return first.slice(0, i).trim().length >= 6;
}

function isMovieFolder(name, group) {
  if (MOVIE_FOLDER_RE.test(name)) return true;
  return !looksLikeSeries(group.eps);
}

function stopPlayback() {
  if (!v.paused) v.pause();
  if (curUrl) { URL.revokeObjectURL(curUrl); curUrl = null; }
  [...v.querySelectorAll('track')].forEach(t => { URL.revokeObjectURL(t.src); t.remove(); });
  v.removeAttribute('src');
  v.load();
  v.hidden = true;
  $('now').hidden = true;
  $('now').textContent = '';
  $('stageCover').hidden = true;
  $('empty').hidden = false;
  cur = -1;
  document.title = 'Anime Local';
}

function load(files) {
  files = [...files];
  stopPlayback();
  eps = [];
  subs = {};
  showHidden = false;
  $('search').value = '';
  const groups = {};

  files.forEach(f => {
    const pathParts = f.webkitRelativePath ? f.webkitRelativePath.split('/') : [];
    const seriesName = pathParts.length > 2
      ? pathParts[1] || pathParts[0]
      : (pathParts.length === 2 ? pathParts[0] || 'General' : 'General');
    
    if (!groups[seriesName]) groups[seriesName] = { eps: [], subs: {}, images: {}, cover: null, background: null };
    
    if (VIDEO_EXT.test(f.name)) {
      groups[seriesName].eps.push(f);
    } else if (/\.(srt|vtt)$/i.test(f.name)) {
      groups[seriesName].subs[base(f.name)] = f;
    } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(f.name)) {
      const b = base(f.name);
      groups[seriesName].images[b] = f;
      if (b.toLowerCase().includes('fondovideo')) {
        groups[seriesName].background = f;
      } else if (!groups[seriesName].cover && (b.toLowerCase().includes('cover') || b.toLowerCase().includes('poster') || b.toLowerCase() === seriesName.toLowerCase())) {
        groups[seriesName].cover = f;
      }
    }
  });

  for (const name in groups) {
    groups[name].eps.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (!groups[name].cover) {
      const imgs = Object.values(groups[name].images).filter(f => !base(f.name).toLowerCase().includes('fondovideo'));
      if (imgs.length) groups[name].cover = imgs[0];
    }
  }

  window.catalog = groups;
  renderCatalog();
}

function posterHtmlFor(file, name) {
  if (file) return `<img src="${objectUrl(file)}" class="poster" alt="${name}">`;
  return `<div class="poster placeholder"><span>${name}</span></div>`;
}

function renderCatalog() {
  view = { mode: 'catalog', folder: null, kind: null };
  if (!v.paused) v.pause();
  const q = $('search').value.toLowerCase();
  list.innerHTML = '';
  document.body.classList.add('catalog-mode');
  $('backBtn').style.display = 'none';
  
  const series = Object.keys(window.catalog)
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
  const hidden = getHidden().filter(name => window.catalog[name]);
  const hiddenSet = new Set(hidden);

  if (hidden.length) {
    const toolbar = document.createElement('div');
    toolbar.className = 'catalog-toolbar';
    const toggle = document.createElement('button');
    toggle.className = 'btn ghost hide-toggle';
    toggle.textContent = showHidden ? 'Ocultar series ocultas' : `Mostrar ocultas (${hidden.length})`;
    toggle.onclick = () => { showHidden = !showHidden; renderCatalog(); };
    toolbar.appendChild(toggle);
    list.appendChild(toolbar);
  }

  const grid = document.createElement('div');
  grid.className = 'catalog-grid';

  series.forEach(name => {
    if (q && !name.toLowerCase().includes(q)) return;

    const isHidden = hiddenSet.has(name);
    if (isHidden && !showHidden) return;

    const group = window.catalog[name];
    const movies = isMovieFolder(name, group);
    const count = group.eps.length;
    const countLabel = movies
      ? (count === 1 ? 'Película' : 'Películas')
      : (count === 1 ? 'Episodio' : 'Episodios');
    
    const card = document.createElement('div');
    card.className = 'series-card' + (isHidden ? ' hidden-series' : '');

    card.innerHTML = `
      ${posterHtmlFor(group.cover, name)}
      <div class="info">
        <span class="title">${name}</span>
        <span class="eps-count">${count} ${countLabel}</span>
      </div>
    `;

    const action = document.createElement('button');
    action.className = 'card-action';
    action.title = isHidden ? 'Mostrar serie' : 'Ocultar serie';
    action.textContent = isHidden ? '↺' : '✕';
    action.onclick = e => {
      e.stopPropagation();
      if (isHidden) unhideSeries(name); else hideSeries(name);
    };
    card.appendChild(action);

    card.onclick = () => openFolder(name);
    grid.appendChild(card);
  });
  list.appendChild(grid);
}

function setStageCover(file, name) {
  const el = $('stageCover');
  if (file) {
    el.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.72)), url("${objectUrl(file)}")`;
    el.textContent = '';
    el.classList.remove('no-cover');
    el.hidden = false;
  } else if (name) {
    el.style.backgroundImage = 'none';
    el.textContent = name;
    el.classList.add('no-cover');
    el.hidden = false;
  } else {
    el.style.backgroundImage = 'none';
    el.textContent = '';
    el.classList.remove('no-cover');
    el.hidden = true;
  }
  $('empty').hidden = !!name || !!file;
}

function openFolder(name) {
  const group = window.catalog[name];
  eps = group.eps;
  subs = group.subs;
  $('backBtn').style.display = 'block';

  stopPlayback();

  if (isMovieFolder(name, group)) {
    view = { mode: 'movies', folder: name, kind: 'movie' };
    setStageCover(null, null);
    document.body.classList.add('catalog-mode');
    renderMovies(name);
  } else {
    view = { mode: 'episodes', folder: name, kind: 'series' };
    setStageCover(group.background, name);
    document.body.classList.remove('catalog-mode');
    render();
  }
}

function renderMovies(name) {
  const q = $('search').value.toLowerCase();
  list.innerHTML = '';
  document.body.classList.add('catalog-mode');
  $('backBtn').style.display = 'block';

  const grid = document.createElement('div');
  grid.className = 'catalog-grid';
  const group = window.catalog[name];

  eps.forEach((f, i) => {
    const fullName = base(f.name);
    if (q && !fullName.toLowerCase().includes(q)) return;

    const p = store.get('p:' + key(f)) || { t: 0, d: 0 };
    const pct = p.d ? Math.min(100, Math.round((p.t / p.d) * 100)) : 0;
    const status = pct > 92 ? 'Vista' : (pct > 0 ? `${pct}% vista` : 'Película');

    const card = document.createElement('div');
    card.className = 'series-card' + (i === cur ? ' active' : '');
    card.innerHTML = `
      ${posterHtmlFor(group.images[fullName], fullName)}
      <div class="info">
        <span class="title">${fullName}</span>
        <span class="eps-count">${status}</span>
      </div>
    `;
    card.onclick = () => playMovie(i);
    grid.appendChild(card);
  });
  list.appendChild(grid);
}

function playMovie(i) {
  view = { mode: 'episodes', folder: view.folder, kind: 'movie' };
  document.body.classList.remove('catalog-mode');
  play(i);
}

function refreshList() {
  if (view.mode === 'movies') renderMovies(view.folder);
  else render();
}

$('backBtn').onclick = () => {
  if (!window.catalog) return;
  if (view.mode === 'episodes' && view.kind === 'movie') {
    openFolder(view.folder);
  } else {
    renderCatalog();
  }
};

$('logo').onclick = () => {
  if (window.catalog) renderCatalog();
};

// Función para dar formato MM:SS / HH:MM:SS
function formatTime(sec) {
  if (!sec || isNaN(sec) || !isFinite(sec)) return "00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Extrae el número de episodio del nombre del archivo (ej. E01, EP01, - 01)
function parseEpisodeNumber(fullName, index) {
  const epMatch = fullName.match(/(?:ep?|cap(?:itulo)?|t\d+e|[-_ ]s?\d+e|\b)(\d{1,4})\b/i);
  if (epMatch) {
    return `Ep. ${parseInt(epMatch[1], 10)}`;
  }
  return `Ep. ${index + 1}`;
}

function render() {
  const q = $('search').value.toLowerCase();
  list.innerHTML = '';
  
  eps.forEach((f, i) => {
    if (q && !f.name.toLowerCase().includes(q)) return;
    
    const fullName = base(f.name);
    const epNum = view.kind === 'movie' ? 'Película' : parseEpisodeNumber(fullName, i);
    const p = store.get('p:' + key(f)) || { t: 0, d: 0 };
    const pct = p.d ? Math.min(100, Math.round((p.t / p.d) * 100)) : 0;
    
    // Tiempos
    const totalDurationText = p.d ? formatTime(p.d) : 'Desconocida';
    const currentTimeText = p.d ? `${formatTime(p.t)} / ${totalDurationText}` : 'Sin reproducir';
    
    const el = document.createElement('div');
    el.className = 'ep' + (i === cur ? ' active' : '') + (pct > 92 ? ' done' : '');
    
    el.innerHTML = `
      <span class="name"></span>
      <span class="bar"><i style="width:${pct}%"></i></span>
      <div class="ep-tooltip">
        <div class="tooltip-badge">${epNum}</div>
        <span class="tooltip-title"></span>
        <div class="tooltip-info">
          <span>⏱ Duración: ${totalDurationText}</span>
          <span class="tooltip-pct">${pct}%</span>
        </div>
        <div class="tooltip-time">Progreso: ${currentTimeText}</div>
      </div>
    `;
    
    el.querySelector('.name').textContent = fullName;
    el.querySelector('.tooltip-title').textContent = fullName;
    
    el.onclick = () => play(i);
    list.appendChild(el);
  });
}

function srtToVtt(t) {
  return 'WEBVTT\n\n' + t.replace(/\r/g, '').replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2');
}

async function play(i) {
  if (i < 0 || i >= eps.length) return;
  saveProgress();
  cur = i;
  const f = eps[i];
  if (curUrl) URL.revokeObjectURL(curUrl);
  curUrl = URL.createObjectURL(f);
  [...v.querySelectorAll('track')].forEach(t => { URL.revokeObjectURL(t.src); t.remove(); });
  v.src = curUrl;
  
  const sf = subs[base(f.name)];
  if (sf) {
    let text = await sf.text();
    if (/\.srt$/i.test(sf.name)) text = srtToVtt(text);
    const tr = document.createElement('track');
    tr.kind = 'subtitles'; tr.label = 'Subtítulos'; tr.default = true;
    tr.src = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
    v.appendChild(tr);
  }
  
  v.hidden = false; 
  $('stageCover').hidden = true;
  $('empty').hidden = true; 
  $('now').hidden = false;
  $('now').textContent = (view.kind === 'movie' ? 'Película: ' : 'Reproduciendo: ') + base(f.name) + ' (' + (i + 1) + '/' + eps.length + ')';
  document.title = base(f.name);
  store.set('last', key(f));
  
  const p = store.get('p:' + key(f));
  v.onloadedmetadata = () => {
    if (p && p.t > 5 && p.t < v.duration - 20) v.currentTime = p.t;
    v.playbackRate = +$('speed').value;
  };
  v.play().catch(() => {});
  refreshList();
}

function saveProgress() {
  if (cur < 0 || !eps[cur] || !isFinite(v.duration)) return;
  store.set('p:' + key(eps[cur]), { t: v.currentTime, d: v.duration });
}

setInterval(() => { if (!v.paused) saveProgress(); }, 5000);
window.addEventListener('beforeunload', saveProgress);

v.addEventListener('ended', () => { saveProgress(); refreshList(); if ($('auto').checked) play(cur + 1); });
$('speed').onchange = () => v.playbackRate = +$('speed').value;
$('prev').onclick = () => play(cur - 1);
$('next').onclick = () => play(cur + 1);
$('search').oninput = () => {
  if (!window.catalog) return render();
  if (view.mode === 'catalog') renderCatalog();
  else if (view.mode === 'movies') renderMovies(view.folder);
  else render();
};
$('pickFolder').onclick = () => $('folderInput').click();
$('pickFiles').onclick = () => $('fileInput').click();
$('folderInput').onchange = e => { load(e.target.files); e.target.value = ''; };
$('fileInput').onchange = e => { load(e.target.files); e.target.value = ''; };

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
  else if (e.code === 'ArrowRight') v.currentTime += 5;
  else if (e.code === 'ArrowLeft') v.currentTime -= 5;
  else if (e.key === 'f') document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen();
  else if (e.key === 'n') play(cur + 1);
  else if (e.key === 'p') play(cur - 1);
});

// Intro animada estilo Netflix
function playIntroSound(ctx, at) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, at);
  master.gain.exponentialRampToValueAtTime(0.5, at + 0.04);
  master.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
  master.connect(ctx.destination);

  [
    { f0: 150, f1: 110, t: 0, dur: 0.9, vol: 0.4 },
    { f0: 92, f1: 68, t: 0.32, dur: 1.2, vol: 0.55 }
  ].forEach(n => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    filter.type = 'lowpass';
    filter.frequency.value = 780;
    osc.frequency.setValueAtTime(n.f0, at + n.t);
    osc.frequency.exponentialRampToValueAtTime(n.f1, at + n.t + n.dur);
    gain.gain.setValueAtTime(0.0001, at + n.t);
    gain.gain.exponentialRampToValueAtTime(n.vol, at + n.t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + n.t + n.dur);
    osc.connect(gain).connect(filter).connect(master);
    osc.start(at + n.t);
    osc.stop(at + n.t + n.dur + 0.05);
  });

  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  const noiseFilter = ctx.createBiquadFilter();
  noiseGain.gain.value = 0.22;
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 520;
  noise.connect(noiseFilter).connect(noiseGain).connect(master);
  noise.start(at);
}

function startIntroAudio(startMs, onPlay) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return { stop() {} };
  let ctx;
  try { ctx = new AC(); } catch { return { stop() {} }; }

  let played = false;
  const schedule = () => {
    if (played || ctx.state !== 'running') return;
    played = true;
    const hold = Math.max(0, 1.15 - (performance.now() - startMs) / 1000);
    playIntroSound(ctx, ctx.currentTime + hold);
    if (onPlay) onPlay();
  };

  const removeUnlock = () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  const unlock = () => {
    const p = ctx.resume();
    if (p && p.then) p.then(schedule).catch(() => {});
    else schedule();
    removeUnlock();
  };

  if (ctx.state === 'running') {
    schedule();
  } else {
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  return {
    stop() {
      removeUnlock();
      try { if (ctx.state !== 'closed') ctx.close(); } catch {}
    }
  };
}

function setupIntro() {
  const intro = document.createElement('div');
  intro.className = 'intro';
  intro.innerHTML = `
    <div class="intro-fx"></div>
    <div class="intro-content">
      <div class="intro-mark">
        <span class="intro-letter">A</span>
        <span class="intro-letter">N</span>
        <span class="intro-letter">I</span>
        <span class="intro-letter">M</span>
        <span class="intro-letter">E</span>
      </div>
      <div class="intro-sub">LOCAL</div>
      <div class="intro-line"></div>
    </div>
    <div class="intro-hint">Toca para activar el sonido</div>
    <button class="intro-skip" type="button">Saltar</button>
  `;
  document.body.appendChild(intro);

  const start = performance.now();
  let finished = false;
  const hint = intro.querySelector('.intro-hint');
  const audio = startIntroAudio(start, () => hint.remove());

  const finish = () => {
    if (finished) return;
    finished = true;
    audio.stop();
    document.removeEventListener('keydown', onKey);
    intro.remove();
  };
  const skip = () => {
    intro.classList.add('closing');
    setTimeout(finish, 380);
  };
  const onKey = e => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      skip();
    }
  };

  intro.querySelector('.intro-skip').onclick = e => {
    e.stopPropagation();
    skip();
  };
  document.addEventListener('keydown', onKey);
  setTimeout(finish, 4600);
}

setupIntro();

// Arrastrar y soltar
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { 
  e.preventDefault(); 
  if (e.dataTransfer.files.length) load(e.dataTransfer.files); 
});