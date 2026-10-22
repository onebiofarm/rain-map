/* ฝนตกไหม - free rain map with 60-minute radar nowcast, Open-Meteo forecast and terrain-based flood estimate.
   Vanilla JS + Leaflet. All data sources are public, free, CORS-enabled and used under non-commercial terms. */
'use strict';

const CFG = {
  version: '1.0.0',
  rainviewerApi: 'https://api.rainviewer.com/public/weather-maps.json',
  radarMaxZoom: 7,            // RainViewer free tier serves real data up to zoom 7
  radarColor: 2,              // Universal Blue (the only scheme still served)
  radarTilesPerFrame: 20,     // keep well under the 100 requests / IP / minute limit (in-memory tile cache avoids refetch on pan)
  radarRequestsPerMinute: 80,
  openMeteo: 'https://api.open-meteo.com/v1/forecast',
  floodApi: 'https://flood-api.open-meteo.com/v1/flood',
  geocode: 'https://geocoding-api.open-meteo.com/v1/search',
  demTiles: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  gibs: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png',
  defaultView: [13.75, 100.5],
  defaultZoom: 6,
  nowcastSteps: 6,            // 6 x 10 min = 60 minutes ahead
  nowcastStepMin: 10,
  forecastHours: 48,
  forecastGrid: { nx: 16, ny: 12 },   // 192 points per call, well inside Open-Meteo's free limits
  refreshEveryMs: 5 * 60 * 1000,
};

// ---------------------------------------------------------------- i18n
const I18N = {
  th: {
    tapHint: 'กดปุ่มตำแหน่ง หรือแตะบนแผนที่เพื่อดูฝนที่จุดนั้น',
    loadingRadar: 'กำลังโหลดเรดาร์…',
    computing: 'กำลังคำนวณคาดการณ์ 60 นาที…',
    loadingForecast: 'กำลังโหลดพยากรณ์…',
    loadingFlood: 'กำลังวิเคราะห์ภูมิประเทศ…',
    rainingNow: (s) => `ตอนนี้ฝนกำลังตก (${s})`,
    stopsIn: (m) => `คาดว่าฝนจะเบาลง/หยุดในอีกประมาณ ${m} นาที`,
    rainIn: (m, s) => `ฝน${s}จะมาถึงในอีกประมาณ ${m} นาที`,
    noRain60: 'ไม่มีฝนใน 60 นาทีข้างหน้า (จากเรดาร์)',
    nextRain: (t, p) => `ฝนครั้งถัดไปประมาณ ${t}` + (p != null ? ` (โอกาส ${p}%)` : ''),
    noRain48: 'ไม่มีฝนใน 48 ชั่วโมงข้างหน้า',
    noRadarHere: 'จุดนี้ไม่มีเรดาร์ครอบคลุม ใช้พยากรณ์จากแบบจำลองแทน',
    rain24: (mm) => `ฝนสะสม 24 ชม. ข้างหน้า ${mm} มม.`,
    riverHigh: (x) => `น้ำในแม่น้ำใกล้เคียงสูงกว่าปกติ ${x} เท่า`,
    riverNormal: 'ระดับน้ำในแม่น้ำใกล้เคียงปกติ',
    floodRisk: (lvl) => `ความเสี่ยงน้ำท่วมขัง (ประมาณการ): ${lvl}`,
    lvl: ['ต่ำ', 'ปานกลาง', 'สูง', 'สูงมาก'],
    strength: ['เบา', 'ปานกลาง', 'หนัก', 'หนักมาก'],
    now: 'ตอนนี้', past: 'ย้อนหลัง', next: 'คาดการณ์', fc: 'พยากรณ์',
    minAgo: (m) => `${m} นาทีก่อน`, minAhead: (m) => `+${m} นาที`,
    myLocation: 'ตำแหน่งของฉัน', pinned: 'จุดที่เลือก',
    geoDenied: 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง ลองแตะบนแผนที่แทน',
    geoFail: 'หาตำแหน่งไม่ได้',
    saved: 'บันทึกแล้ว', noFav: 'ยังไม่มีรายการโปรด',
    rateLimited: 'เรดาร์ถูกจำกัดจำนวนคำขอ รอสักครู่แล้วลองใหม่',
    offline: 'ออฟไลน์ แสดงข้อมูลล่าสุดที่มี',
    searchNone: 'ไม่พบสถานที่',
    floodNote: 'ประมาณจากความสูงภูมิประเทศ + ฝนคาดการณ์ 24 ชม.',
    selectFirst: 'เลือกจุดบนแผนที่ก่อน',
    play: 'เล่น', pause: 'หยุด',
  },
  en: {
    tapHint: 'Tap the locate button or tap the map to check rain at a point',
    loadingRadar: 'Loading radar…',
    computing: 'Computing 60-minute nowcast…',
    loadingForecast: 'Loading forecast…',
    loadingFlood: 'Analysing terrain…',
    rainingNow: (s) => `Raining now (${s})`,
    stopsIn: (m) => `Expected to ease/stop in about ${m} min`,
    rainIn: (m, s) => `${s} rain arriving in about ${m} min`,
    noRain60: 'No rain in the next 60 minutes (radar)',
    nextRain: (t, p) => `Next rain around ${t}` + (p != null ? ` (${p}% chance)` : ''),
    noRain48: 'No rain in the next 48 hours',
    noRadarHere: 'No radar coverage here, using model forecast',
    rain24: (mm) => `Next 24 h rainfall ${mm} mm`,
    riverHigh: (x) => `Nearby river flow ${x}x above normal`,
    riverNormal: 'Nearby river flow is normal',
    floodRisk: (lvl) => `Flood-pooling risk (estimate): ${lvl}`,
    lvl: ['low', 'moderate', 'high', 'very high'],
    strength: ['light', 'moderate', 'heavy', 'very heavy'],
    now: 'Now', past: 'Past', next: 'Nowcast', fc: 'Forecast',
    minAgo: (m) => `${m} min ago`, minAhead: (m) => `+${m} min`,
    myLocation: 'My location', pinned: 'Selected point',
    geoDenied: 'Location permission denied, tap the map instead',
    geoFail: 'Could not get location',
    saved: 'Saved', noFav: 'No favourites yet',
    rateLimited: 'Radar rate limit hit, please wait a moment',
    offline: 'Offline, showing last data',
    searchNone: 'No places found',
    floodNote: 'Estimated from terrain height + 24 h forecast rain',
    selectFirst: 'Select a point on the map first',
    play: 'Play', pause: 'Pause',
  }
};
const UI_TEXT = {
  en: {
    '#searchInput': ['placeholder', 'Search city, district, place…'],
    '#lyrRadar': ['label', 'Rain radar (past 2 h)'],
    '#lyrNowcast': ['label', '60-min nowcast (computed from radar)'],
    '#lyrFlood': ['label', 'Flood-risk areas (estimate)'],
    '#lyrClouds': ['label', 'Himawari IR clouds (NASA)'],
    '#lyrSatRain': ['label', 'IMERG satellite rain (NASA, ~4 h delay)'],
    '#btnAddFav': ['text', '+ Save selected point'],
    '.t-past': ['text', 'Past'], '.t-now': ['text', 'Now'], '.t-next': ['text', '60-min nowcast'],
  }
};
let LANG = localStorage.getItem('rain.lang') || 'th';
const T = () => I18N[LANG];

// ---------------------------------------------------------------- state
const state = {
  map: null,
  basemap: null,
  overlay: null,          // ImageOverlay for radar / nowcast / forecast frames
  floodOverlay: null,
  gibsLayers: {},
  frames: [],             // timeline frames
  frameIndex: 0,
  radar: null,            // { region, frames: [{time, path, canvas, url}], flow, nowcast: [{time, canvas, url}] }
  forecast: null,         // { bounds, nx, ny, lats, lons, times:[unix], precip:[[...]], prob:[[...]], rendered: Map }
  flood: null,
  point: null,            // { lat, lon, name, kind }
  pointData: null,
  playing: false,
  playTimer: null,
  gen: 0,
  opacity: 0.8,
  clock: localStorage.getItem('rain.clock') || '24',
  favs: JSON.parse(localStorage.getItem('rain.favs') || '[]'),
  userMarker: null,
  pinMarker: null,
};

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, ms);
}
let spinnerEl = null;
function spinner(msg) {
  if (!msg) { if (spinnerEl) { spinnerEl.remove(); spinnerEl = null; } return; }
  if (!spinnerEl) { spinnerEl = document.createElement('div'); spinnerEl.className = 'spinner'; document.body.appendChild(spinnerEl); }
  spinnerEl.textContent = msg;
}

function fmtTime(unix) {
  const d = new Date(unix * 1000);
  return d.toLocaleTimeString(LANG === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: state.clock === '12' });
}
function fmtDayTime(unix) {
  const d = new Date(unix * 1000);
  const day = d.toLocaleDateString(LANG === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short' });
  return `${day} ${fmtTime(unix)}`;
}

// ---------------------------------------------------------------- throttled image loader (RainViewer limit)
const tileCache = new Map();
const radarLoader = {
  times: [], queue: [], active: 0, maxActive: 6,
  cancelPending() {
    // drop queued (not yet started) jobs so a new view does not wait behind a stale one
    for (const j of this.queue) j.reject(new Error('cancelled'));
    this.queue = [];
  },
  load(url, priority = 0) {
    if (tileCache.has(url)) return Promise.resolve(tileCache.get(url));
    return new Promise((resolve, reject) => {
      this.queue.push({ url, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.pump();
    });
  },
  async pump() {
    if (this.active >= this.maxActive || !this.queue.length) return;
    const now = Date.now();
    this.times = this.times.filter((t) => now - t < 60000);
    if (this.times.length >= CFG.radarRequestsPerMinute) {
      const wait = 60000 - (now - this.times[0]) + 50;
      setTimeout(() => this.pump(), wait);
      return;
    }
    const job = this.queue.shift();
    if (tileCache.has(job.url)) { job.resolve(tileCache.get(job.url)); this.pump(); return; }
    this.active++; this.times.push(now);
    loadImage(job.url).then((img) => { tileCache.set(job.url, img); job.resolve(img); })
      .catch((e) => job.reject(e))
      .finally(() => { this.active--; this.pump(); });
    this.pump();
  }
};
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load failed ' + url));
    img.src = url;
  });
}

// ---------------------------------------------------------------- map
function initMap() {
  const saved = JSON.parse(localStorage.getItem('rain.view') || 'null');
  const map = L.map('map', { zoomControl: true, attributionControl: false, worldCopyJump: true, maxZoom: 15, minZoom: 3 })
    .setView(saved ? [saved.lat, saved.lon] : CFG.defaultView, saved ? saved.z : CFG.defaultZoom);
  state.map = map;
  setBasemap(localStorage.getItem('rain.basemap') || 'dark');
  state.overlay = L.imageOverlay('', [[0, 0], [0, 0]], { opacity: state.opacity, interactive: false, zIndex: 400 }).addTo(map);
  state.floodOverlay = L.imageOverlay('', [[0, 0], [0, 0]], { opacity: 0.75, interactive: false, zIndex: 390 });

  map.on('moveend', onMoveEnd);
  map.on('resize', onMoveEnd);   // rotation, browser toolbar show/hide, window resize: re-check coverage
  if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe(document.getElementById('map'));
  map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng, T().pinned, 'pin'));
}

function setBasemap(kind) {
  const esri = 'Tiles © <a href="https://www.esri.com/" target="_blank" rel="noopener">Esri</a> — Esri, DeLorme, NAVTEQ';
  const urls = {
    dark: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", esri, 16],
    light: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", esri, 16],
    osm: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors", 19],
  };
  const [url, attr, maxNative] = urls[kind] || urls.dark;
  if (state.basemap) state.basemap.remove();
  state.basemap = L.tileLayer(url, { maxNativeZoom: maxNative, maxZoom: 19 }).addTo(state.map);
  $('#attribBase').innerHTML = attr;
  state.basemap.bringToBack();
  localStorage.setItem('rain.basemap', kind);
}

function setGibsLayer(key, layerId, on) {
  const map = state.map;
  if (on && !state.gibsLayers[key]) {
    state.gibsLayers[key] = L.tileLayer(CFG.gibs.replace('{layer}', layerId), { maxNativeZoom: 6, maxZoom: 19, opacity: key === 'clouds' ? 0.55 : 0.7, zIndex: key === 'clouds' ? 350 : 380 }).addTo(map);
  } else if (!on && state.gibsLayers[key]) {
    state.gibsLayers[key].remove(); delete state.gibsLayers[key];
  }
}

// ---------------------------------------------------------------- tile math
function lon2x(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
function lat2y(lat, z) { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z); }
function x2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
function y2lat(y, z) { const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }

/* Pick a tile region (zoom + tile range) covering the current view padded by `pad`, with at most maxTiles tiles. */
function pickRegion(maxZoom, maxTiles, pad = 0.3) {
  const map = state.map;
  const b = map.getBounds().pad(pad);
  let z = Math.min(maxZoom, Math.round(map.getZoom()));
  for (; z >= 2; z--) {
    const x0 = Math.floor(lon2x(b.getWest(), z)), x1 = Math.floor(lon2x(b.getEast(), z));
    const y0 = Math.max(0, Math.floor(lat2y(b.getNorth(), z))), y1 = Math.min(Math.pow(2, z) - 1, Math.floor(lat2y(b.getSouth(), z)));
    const n = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (n <= maxTiles || z === 2) {
      const bounds = L.latLngBounds([y2lat(y1 + 1, z), x2lon(x0, z)], [y2lat(y0, z), x2lon(x1 + 1, z)]);
      const latC = map.getCenter().lat;
      const pxKm = 40075 * Math.cos(latC * Math.PI / 180) / (256 * Math.pow(2, z));
      return { z, x0, x1, y0, y1, W: (x1 - x0 + 1) * 256, H: (y1 - y0 + 1) * 256, bounds, pxKm };
    }
  }
}
function regionCovers(region, viewBounds) {
  return region && region.bounds.contains(viewBounds);
}
function regionKey(r) { return `${r.z}/${r.x0}-${r.x1}/${r.y0}-${r.y1}`; }

async function stitch(region, urlFn, loader, priority = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = region.W; canvas.height = region.H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const jobs = [];
  for (let y = region.y0; y <= region.y1; y++) for (let x = region.x0; x <= region.x1; x++) {
    const n = Math.pow(2, region.z);
    const xw = ((x % n) + n) % n;
    jobs.push(loader(urlFn(region.z, xw, y), priority).then((img) => ctx.drawImage(img, (x - region.x0) * 256, (y - region.y0) * 256)).catch(() => {}));
  }
  await Promise.all(jobs);
  return canvas;
}
function canvasToUrl(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)), 'image/png'));
}

// ---------------------------------------------------------------- radar + nowcast
let radarMeta = null, radarMetaAt = 0;
async function fetchRadarMeta() {
  if (radarMeta && Date.now() - radarMetaAt < 120000) return radarMeta;
  const res = await fetch(CFG.rainviewerApi, { cache: 'no-store' });
  if (!res.ok) throw new Error('rainviewer meta ' + res.status);
  radarMeta = await res.json(); radarMetaAt = Date.now();
  return radarMeta;
}

async function refreshRadar(force = false) {
  const map = state.map;
  const view = map.getBounds();
  let meta;
  try { meta = await fetchRadarMeta(); } catch (e) { toast(navigator.onLine ? T().rateLimited : T().offline); return; }
  const latest = meta.radar.past[meta.radar.past.length - 1];
  const region = pickRegion(CFG.radarMaxZoom, CFG.radarTilesPerFrame, 0.2);
  const sameData = state.radar && state.radar.latestTime === latest.time;
  if (!force && sameData && regionCovers(state.radar.region, view) && state.radar.region.z === region.z) return;
  if (!force && sameData && regionCovers(state.radar.region, view) && Math.abs(state.radar.region.z - region.z) <= 1 && map.getZoom() > CFG.radarMaxZoom) return;

  const gen = ++state.gen;
  radarLoader.cancelPending();
  spinner(T().loadingRadar);
  const past = meta.radar.past.slice(-13);
  const radar = { region, key: regionKey(region), latestTime: latest.time, frames: past.map((f) => ({ time: f.time, path: f.path, canvas: null, url: null })), nowcast: [], flow: null };
  const urlFn = (path) => (z, x, y) => `${meta.host}${path}/256/${z}/${x}/${y}/${CFG.radarColor}/1_1.png`;

  // Newest frame first so "now" shows immediately; the 4 newest feed the nowcast.
  // The oldest 6 frames (60-120 min ago) wait 12 s so a quick pan/zoom keeps its request budget.
  const order = [...radar.frames].reverse();
  let loaded = 0;
  for (let i = 0; i < order.length; i++) {
    const fr = order[i];
    if (i === 7) { await sleep(12000); if (gen !== state.gen) return; }
    const canvas = await stitch(region, urlFn(fr.path), (u, p) => radarLoader.load(u, p), 100 - i);
    if (gen !== state.gen) return;
    fr.canvas = canvas; fr.url = await canvasToUrl(recolor(canvas));
    loaded++;
    if (loaded === 1) { state.radar = radar; rebuildTimeline(true); }
    if (loaded === 4) { spinner(T().computing); await computeNowcast(radar, gen); if (gen !== state.gen) return; rebuildTimeline(); spinner(null); refreshPointStatus(); }
    if (loaded > 4) rebuildTimeline();
  }
  spinner(null);
}

/* RainViewer's served palette (measured from unsmoothed tiles): semi-transparent beige = drizzle,
   cyan -> dark blue = light to moderate rain, yellow -> orange -> red = heavy, pink = extreme.
   Map any pixel to a 0..1 intensity so radar, nowcast and forecast share one colour scale. */
function intensityOf(r, g, b, a) {
  if (a < 20) return 0;
  const af = a / 255;
  if (r === 255 && g === 170 && b === 255) return 1;                               // pink, extreme
  if (r > 200 && g > 60 && b < 40) return 0.62 + 0.18 * clamp((238 - g) / 170, 0, 1);   // yellow -> orange
  if (r > 100 && g < 70 && b < 70) return 0.8 + 0.15 * clamp((255 - r) / 112, 0, 1);    // red -> dark red
  if (b > r + 40 && b >= g * 0.9 && r < 150) return 0.2 + 0.42 * clamp((238 - b) / 134, 0, 1); // cyan -> dark blue
  if (r > 90 && r >= g && g >= b && r - b < 110) return 0.04 + 0.16 * af;             // beige drizzle (alpha ramp)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;                                   // smoothed blends
  return af * (1 - (lum / 255) * 0.65) * 0.6;
}
const RAIN_THRESHOLD = 0.15;                       // "it is raining" (drizzle with alpha >= ~170 counts)
function strengthClass(s) { return s < 0.21 ? 0 : s < 0.45 ? 1 : s < 0.65 ? 2 : 3; }
/* One colour ramp for every layer (matches the legend): light blue, blue, dark blue, purple, red. */
function levelColor(s) {
  if (s < 0.04) return [0, 0, 0, 0];
  if (s < 0.2) return [154, 211, 255, Math.round(90 + 110 * (s - 0.04) / 0.16)];
  if (s < 0.45) return [58, 134, 255, 220];
  if (s < 0.65) return [26, 47, 181, 230];
  if (s < 0.8) return [177, 0, 158, 240];
  return [255, 40, 60, 250];
}
function recolor(canvas) {
  const W = canvas.width, H = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d'), img = octx.createImageData(W, H), d = img.data;
  for (let i = 0; i < src.length; i += 4) {
    const s = intensityOf(src[i], src[i + 1], src[i + 2], src[i + 3]);
    if (s < 0.04) continue;
    const c = levelColor(s);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3];
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function grayFrame(canvas, f) {
  const W = canvas.width, H = canvas.height, ws = Math.ceil(W / f), hs = Math.ceil(H / f);
  const d = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const out = new Float32Array(ws * hs);
  for (let y = 0; y < H; y++) {
    const oy = Math.floor(y / f) * ws;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = intensityOf(d[i], d[i + 1], d[i + 2], d[i + 3]);
      if (v) out[oy + Math.floor(x / f)] += v / (f * f);
    }
  }
  return { data: out, w: ws, h: hs };
}
function downsample2(g) {
  const w = Math.ceil(g.w / 2), h = Math.ceil(g.h / 2), out = new Float32Array(w * h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) out[(y >> 1) * w + (x >> 1)] += g.data[y * g.w + x] / 4;
  return { data: out, w, h };
}
function sad(a, b, ax, ay, bx, by, bw, bh, dx, dy) {
  // sum |a(ax..ax+bw, ay..) - b(ax+dx..)| ; returns Infinity when the shifted block leaves the image
  if (ax + dx < 0 || ay + dy < 0 || ax + dx + bw > b.w || ay + dy + bh > b.h) return Infinity;
  let s = 0;
  for (let y = 0; y < bh; y++) {
    const ra = (ay + y) * a.w + ax, rb = (ay + dy + y) * b.w + ax + dx;
    for (let x = 0; x < bw; x++) s += Math.abs(a.data[ra + x] - b.data[rb + x]);
  }
  return s;
}
/* Motion between two intensity images (a older, b newer). Returns global vector + block field (px of the images). */
function estimateMotion(a, b) {
  // 1) Global vector on a 2x downsampled copy, search radius 12.
  const a2 = downsample2(a), b2 = downsample2(b);
  let best = Infinity, gdx = 0, gdy = 0;
  const R = 12;
  const m = 2;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    // compare overlapping area only, normalised by overlap size
    const ax = Math.max(0, -dx), ay = Math.max(0, -dy), bw = a2.w - Math.abs(dx), bh = a2.h - Math.abs(dy);
    if (bw < 8 || bh < 8) continue;
    let s = 0, n = 0;
    for (let y = ay; y < ay + bh; y += m) {
      const ra = y * a2.w, rb = (y + dy) * b2.w + dx;
      for (let x = ax; x < ax + bw; x += m) { s += Math.abs(a2.data[ra + x] - b2.data[rb + x]); n++; }
    }
    s /= n;
    if (s < best) { best = s; gdx = dx; gdy = dy; }
  }
  gdx *= 2; gdy *= 2;
  // 2) Local refinement: blocks of 12 px, search +-4 around the global vector.
  const B = 12, r = 4, gw = Math.floor(a.w / B), gh = Math.floor(a.h / B);
  const vx = new Float32Array(gw * gh), vy = new Float32Array(gw * gh), wt = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
    const ax = bx * B, ay = by * B;
    let energy = 0;
    for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) energy += a.data[(ay + y) * a.w + ax + x];
    if (energy < B * B * 0.03) continue;
    let bs = Infinity, bdx = gdx, bdy = gdy;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const s = sad(a, b, ax, ay, 0, 0, B, B, gdx + dx, gdy + dy);
      if (s < bs) { bs = s; bdx = gdx + dx; bdy = gdy + dy; }
    }
    const base = sad(a, b, ax, ay, 0, 0, B, B, gdx, gdy);
    if (!isFinite(bs)) continue;
    const k = by * gw + bx;
    // weight by energy and by how much better than the global vector it is (avoid noise)
    const gain = isFinite(base) ? clamp((base - bs) / (base + 1e-6), 0, 1) : 0;
    vx[k] = bdx; vy[k] = bdy; wt[k] = energy * (0.3 + gain);
  }
  // 3) Fill empty blocks with the global vector and smooth.
  for (let k = 0; k < gw * gh; k++) if (!wt[k]) { vx[k] = gdx; vy[k] = gdy; wt[k] = 0.05; }
  const sm = (src) => {
    const out = new Float32Array(src.length);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let s = 0, w = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const yy = y + j, xx = x + i;
        if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue;
        const k = yy * gw + xx; s += src[k] * wt[k]; w += wt[k];
      }
      out[y * gw + x] = w ? s / w : 0;
    }
    return out;
  };
  return { gdx, gdy, gw, gh, B, vx: sm(sm(vx)), vy: sm(sm(vy)) };
}

async function computeNowcast(radar, gen) {
  const frames = radar.frames.filter((f) => f.canvas).sort((a, b) => a.time - b.time).slice(-4);
  if (frames.length < 2) return;
  const region = radar.region;
  const f = clamp(Math.ceil(2 / region.pxKm), 1, 4);           // working pixel ~2-4 km
  const grays = frames.map((fr) => grayFrame(fr.canvas, f));
  await sleep(0);
  // Combine two lags (last->first and last->second) for sub-pixel resolution; convert to px per 10 minutes.
  const last = frames.length - 1;
  const pairs = [[0, last], [Math.min(1, last - 1), last]];
  let acc = null;
  for (const [i, j] of pairs) {
    if (i === j) continue;
    const dtMin = (frames[j].time - frames[i].time) / 60;
    if (dtMin <= 0) continue;
    const mo = estimateMotion(grays[i], grays[j]);
    const scale = f * CFG.nowcastStepMin / dtMin;         // tile px per step
    if (!acc) { acc = { gw: mo.gw, gh: mo.gh, B: mo.B * f, vx: mo.vx.map((v) => v * scale), vy: mo.vy.map((v) => v * scale), n: 1 }; }
    else { for (let k = 0; k < acc.vx.length; k++) { acc.vx[k] = (acc.vx[k] * acc.n + mo.vx[k] * scale) / (acc.n + 1); acc.vy[k] = (acc.vy[k] * acc.n + mo.vy[k] * scale) / (acc.n + 1); } acc.n++; }
    await sleep(0);
    if (gen !== state.gen) return;
  }
  if (!acc) return;
  radar.flow = acc;

  // Extrapolate the newest frame forward with backward mapping (semi-Lagrangian) using the local field.
  const src = frames[last].canvas;
  const W = src.width, H = src.height;
  const sdata = src.getContext('2d').getImageData(0, 0, W, H).data;
  const { gw, gh, B, vx, vy } = acc;
  const fieldAt = (x, y) => {
    const gx = clamp(x / B - 0.5, 0, gw - 1), gy = clamp(y / B - 0.5, 0, gh - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(x0 + 1, gw - 1), y1 = Math.min(y0 + 1, gh - 1);
    const tx = gx - x0, ty = gy - y0;
    const k00 = y0 * gw + x0, k10 = y0 * gw + x1, k01 = y1 * gw + x0, k11 = y1 * gw + x1;
    return [
      (vx[k00] * (1 - tx) + vx[k10] * tx) * (1 - ty) + (vx[k01] * (1 - tx) + vx[k11] * tx) * ty,
      (vy[k00] * (1 - tx) + vy[k10] * tx) * (1 - ty) + (vy[k01] * (1 - tx) + vy[k11] * tx) * ty,
    ];
  };
  // Precompute the field per 4x4 pixel cell for speed.
  const cw = Math.ceil(W / 4), ch = Math.ceil(H / 4), fx = new Float32Array(cw * ch), fy = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const v = fieldAt(x * 4 + 2, y * 4 + 2); fx[y * cw + x] = v[0]; fy[y * cw + x] = v[1]; }

  radar.nowcast = [];
  for (let k = 1; k <= CFG.nowcastSteps; k++) {
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const octx = out.getContext('2d');
    const img = octx.createImageData(W, H), od = img.data;
    const decay = 1;   // no artificial fading: a hindcast test showed decay only lowers accuracy versus persistence
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = (y >> 2) * cw + (x >> 2);
        const sx = x - fx[c] * k, sy = y - fy[c] * k;
        if (sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) continue;
        const x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0;
        const i00 = (y0 * W + x0) * 4, i10 = i00 + 4, i01 = i00 + W * 4, i11 = i01 + 4;
        const o = (y * W + x) * 4;
        for (let ch2 = 0; ch2 < 4; ch2++) {
          const v = (sdata[i00 + ch2] * (1 - tx) + sdata[i10 + ch2] * tx) * (1 - ty) + (sdata[i01 + ch2] * (1 - tx) + sdata[i11 + ch2] * tx) * ty;
          od[o + ch2] = ch2 === 3 ? v * decay : v;
        }
      }
      if ((y & 127) === 127) { await sleep(0); if (gen !== state.gen) return; }
    }
    octx.putImageData(img, 0, 0);
    radar.nowcast.push({ time: frames[last].time + k * CFG.nowcastStepMin * 60, canvas: out, url: await canvasToUrl(recolor(out)) });
    if (gen !== state.gen) return;
  }
}

/* Sample radar intensity at a lat/lon for a given stitched canvas. Returns null when outside the region. */
function sampleCanvas(canvas, region, lat, lon) {
  const px = (lon2x(lon, region.z) - region.x0) * 256, py = (lat2y(lat, region.z) - region.y0) * 256;
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;
  // average a 5x5 window for robustness
  const ctx = canvas.getContext('2d');
  const x0 = clamp(Math.round(px) - 2, 0, canvas.width - 5), y0 = clamp(Math.round(py) - 2, 0, canvas.height - 5);
  const d = ctx.getImageData(x0, y0, 5, 5).data;
  let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { s += intensityOf(d[i], d[i + 1], d[i + 2], d[i + 3]); n++; }
  return s / n;
}
function radarCoverageAt(lat, lon) {
  // RainViewer paints nothing outside radar coverage; we cannot tell "no rain" from "no radar" per pixel,
  // so we use a coarse check: is the point inside the coverage mask tile at zoom 0?
  return coverageMask ? sampleMask(lat, lon) : true;
}
let coverageMask = null;
async function loadCoverage() {
  try {
    const img = await loadImage('https://tilecache.rainviewer.com/v2/coverage/0/256/0/0/0.png');
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    c.getContext('2d').drawImage(img, 0, 0);
    coverageMask = c.getContext('2d').getImageData(0, 0, 256, 256).data;
  } catch (e) { /* optional */ }
}
function sampleMask(lat, lon) {
  // The coverage tile paints an opaque mask over areas WITHOUT radar; transparent = covered.
  const x = clamp(Math.floor(lon2x(lon, 0) * 256), 0, 255), y = clamp(Math.floor(lat2y(lat, 0) * 256), 0, 255);
  return coverageMask[(y * 256 + x) * 4 + 3] < 128;
}

// ---------------------------------------------------------------- Open-Meteo forecast grid
async function refreshForecast(force = false) {
  const map = state.map;
  const view = map.getBounds();
  if (!force && state.forecast && state.forecast.bounds.contains(view) && Date.now() - state.forecast.at < 30 * 60000 && state.forecast.zoomBucket === zoomBucket()) return;
  const b = view.pad(0.35);
  // finer grid when zoomed in (model resolution is ~10-25 km, so more points only help up to a point)
  const z = map.getZoom();
  const nx = z >= 8 ? 24 : z >= 7 ? 20 : CFG.forecastGrid.nx, ny = z >= 8 ? 18 : z >= 7 ? 15 : CFG.forecastGrid.ny;
  const lats = [], lons = [];
  const south = Math.max(-85, b.getSouth()), north = Math.min(85, b.getNorth());
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    lats.push(+(south + (north - south) * j / (ny - 1)).toFixed(3));
    lons.push(+(b.getWest() + (b.getEast() - b.getWest()) * i / (nx - 1)).toFixed(3));
  }
  const url = `${CFG.openMeteo}?latitude=${lats.join(',')}&longitude=${lons.join(',')}&hourly=precipitation,precipitation_probability&forecast_days=3&timezone=UTC&timeformat=unixtime`;
  spinner(T().loadingForecast);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('open-meteo ' + res.status);
    const arr = await res.json();
    const list = Array.isArray(arr) ? arr : [arr];
    const times = list[0].hourly.time;
    state.forecast = {
      at: Date.now(), bounds: L.latLngBounds([south, b.getWest()], [north, b.getEast()]), nx, ny, lats, lons, times, zoomBucket: zoomBucket(),
      precip: list.map((p) => p.hourly.precipitation.map((v) => v == null ? 0 : v)),
      prob: list.map((p) => p.hourly.precipitation_probability),
      rendered: new Map(),
    };
    if ($('#lyrFlood').checked) refreshFlood(true);
  } catch (e) {
    toast(navigator.onLine ? 'Open-Meteo: ' + e.message : T().offline);
  } finally { spinner(null); }
}
function zoomBucket() { return Math.round(state.map.getZoom()); }

/* Bilinear value from the forecast grid at a lat/lon for hour index h. */
function forecastAt(lat, lon, h, field = 'precip') {
  const f = state.forecast; if (!f) return null;
  const b = f.bounds;
  const gx = clamp((lon - b.getWest()) / (b.getEast() - b.getWest()) * (f.nx - 1), 0, f.nx - 1);
  const gy = clamp((lat - b.getSouth()) / (b.getNorth() - b.getSouth()) * (f.ny - 1), 0, f.ny - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(x0 + 1, f.nx - 1), y1 = Math.min(y0 + 1, f.ny - 1);
  const tx = gx - x0, ty = gy - y0;
  const v = (i, j) => { const a = f[field][j * f.nx + i]; return a ? (a[h] ?? 0) : 0; };
  return (v(x0, y0) * (1 - tx) + v(x1, y0) * tx) * (1 - ty) + (v(x0, y1) * (1 - tx) + v(x1, y1) * tx) * ty;
}
function rainColor(mmh) {
  // mm per hour -> RGBA, loosely matching the radar palette
  if (mmh < 0.15) return [0, 0, 0, 0];
  if (mmh < 1) return [154, 211, 255, 140 + 60 * mmh];
  if (mmh < 4) return [58, 134, 255, 210];
  if (mmh < 10) return [26, 47, 181, 225];
  if (mmh < 25) return [177, 0, 158, 235];
  return [255, 40, 60, 245];
}

// ---------------------------------------------------------------- flood-risk estimate (terrain + forecast rain)
async function refreshFlood(force = false) {
  if (!$('#lyrFlood').checked) return;
  const map = state.map, view = map.getBounds();
  if (!force && state.flood && regionCovers(state.flood.region, view) && Math.abs(state.flood.region.z - clamp(Math.round(map.getZoom()) + 1, 7, 11)) <= 1) return;
  if (!state.forecast) { await refreshForecast(); if (!state.forecast) return; }
  const gen = ++floodGen;
  spinner(T().loadingFlood);
  const region = pickRegion(11, 12, 0.2);
  // DEM tiles (Terrarium): elevation = R*256 + G + B/256 - 32768
  const canvas = await stitch(region, (z, x, y) => CFG.demTiles.replace('{z}', z).replace('{x}', x).replace('{y}', y), (u) => loadImage(u));
  if (gen !== floodGen) return;
  const W = canvas.width, H = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const elev = new Float32Array(W * H);
  for (let i = 0, p = 0; i < elev.length; i++, p += 4) elev[i] = d[p] * 256 + d[p + 1] + d[p + 2] / 256 - 32768;
  await sleep(0);
  // Height above the local minimum within ~2.5 km (separable min filter), and local slope.
  const pxM = region.pxKm * 1000;
  const r = clamp(Math.round(2500 / pxM), 2, 24);
  const tmp = new Float32Array(W * H), mn = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      let m = Infinity;
      for (let i = Math.max(0, x - r); i <= Math.min(W - 1, x + r); i++) { const v = elev[row + i]; if (v < m) m = v; }
      tmp[row + x] = m;
    }
    if ((y & 255) === 255) { await sleep(0); if (gen !== floodGen) return; }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let m = Infinity;
      for (let j = Math.max(0, y - r); j <= Math.min(H - 1, y + r); j++) { const v = tmp[j * W + x]; if (v < m) m = v; }
      mn[y * W + x] = m;
    }
    if ((x & 255) === 255) { await sleep(0); if (gen !== floodGen) return; }
  }
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d'), img = octx.createImageData(W, H), od = img.data;
  // 24 h forecast rain accumulation sampled per 8x8 cell
  const f = state.forecast;
  const h0 = f.times.findIndex((t) => t > Date.now() / 1000) ; const hs = Math.max(0, h0 - 1);
  const cw = Math.ceil(W / 8), ch = Math.ceil(H / 8), rain = new Float32Array(cw * ch);
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
    const lat = y2lat(region.y0 + (cy * 8 + 4) / 256, region.z), lon = x2lon(region.x0 + (cx * 8 + 4) / 256, region.z);
    let s = 0; for (let h = hs; h < Math.min(hs + 24, f.times.length); h++) s += forecastAt(lat, lon, h) || 0;
    rain[cy * cw + cx] = s;
  }
  const risk = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const k = y * W + x, e = elev[k];
      if (e <= 0.5) continue;                                   // sea / no data
      const rel = e - mn[k];                                    // height above local low
      const slope = Math.hypot(elev[k + 1] - elev[k - 1], elev[k + W] - elev[k - W]) / (2 * pxM);
      const sus = clamp(1 - rel / 8, 0, 1) * clamp(1 - slope / 0.04, 0, 1);
      const rf = clamp(rain[(y >> 3) * cw + (x >> 3)] / 90, 0, 1);  // 90 mm/24 h = very heavy
      const v = sus * Math.pow(rf, 0.8);
      risk[k] = v;
      if (v < 0.12) continue;
      const o = k * 4;
      // yellow -> orange -> red
      od[o] = 255; od[o + 1] = Math.round(190 - 170 * clamp((v - 0.12) / 0.6, 0, 1)); od[o + 2] = 0; od[o + 3] = Math.round(70 + 150 * clamp(v, 0, 1));
    }
    if ((y & 255) === 255) { await sleep(0); if (gen !== floodGen) return; }
  }
  octx.putImageData(img, 0, 0);
  state.flood = { region, risk, W, H, url: await canvasToUrl(out) };
  if (gen !== floodGen) return;
  state.floodOverlay.setUrl(state.flood.url).setBounds(region.bounds);
  if (!state.map.hasLayer(state.floodOverlay)) state.floodOverlay.addTo(state.map);
  spinner(null);
  refreshPointStatus();
}
let floodGen = 0;
function floodRiskAt(lat, lon) {
  const fl = state.flood; if (!fl) return null;
  const r = fl.region;
  const px = Math.floor((lon2x(lon, r.z) - r.x0) * 256), py = Math.floor((lat2y(lat, r.z) - r.y0) * 256);
  if (px < 0 || py < 0 || px >= fl.W || py >= fl.H) return null;
  let m = 0;
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const x = clamp(px + i, 0, fl.W - 1), y = clamp(py + j, 0, fl.H - 1); m = Math.max(m, fl.risk[y * fl.W + x]); }
  return m;
}

// ---------------------------------------------------------------- timeline
function rebuildTimeline(resetToNow = false) {
  const frames = [];
  const r = state.radar;
  if (r) {
    for (const fr of r.frames) if (fr.canvas) frames.push({ kind: 'radar', time: fr.time, url: fr.url });
    for (const nc of r.nowcast) frames.push({ kind: 'nowcast', time: nc.time, url: nc.url });
  }
  // The coarse Open-Meteo grid is deliberately NOT drawn on the map (it looked blobby next to radar);
  // it still feeds the point card, the chart and the flood estimate.
  // place the tick labels where those frames really sit on the slider
  const n = Math.max(1, frames.length - 1);
  const segMid = (kind) => { let a = -1, b = -1; frames.forEach((x, i) => { if (x.kind === kind) { if (a < 0) a = i; b = i; } }); return a < 0 ? -1 : (a + b) / 2; };
  const place = (sel, idx) => { const el = $(sel); if (idx < 0) { el.style.display = 'none'; return; } el.style.display = ''; el.style.left = (idx / n * 100) + '%'; };
  let nowIdx = -1; frames.forEach((x, i) => { if (x.kind === 'radar') nowIdx = i; });
  const pastMid = nowIdx > 2 ? (nowIdx - 1) / 2 : -1;
  place('.t-past', pastMid); place('.t-now', nowIdx); place('.t-next', segMid('nowcast'));
  const prevTime = state.frames[state.frameIndex] ? state.frames[state.frameIndex].time : null;
  state.frames = frames;
  const slider = $('#timeSlider');
  slider.max = Math.max(0, frames.length - 1);
  let idx = 0;
  if (resetToNow || prevTime == null) idx = nowIndex();
  else { idx = frames.findIndex((x) => x.time >= prevTime); if (idx < 0) idx = frames.length - 1; }
  showFrame(idx);
  if (!$('#lyrRadar').checked || !$('#lyrNowcast').checked) applyLayerVisibility();
}
function nowIndex() {
  let idx = 0;
  for (let i = 0; i < state.frames.length; i++) if (state.frames[i].kind === 'radar') idx = i;
  return idx;
}
function showFrame(idx) {
  const frames = state.frames;
  if (!frames.length) return;
  idx = clamp(idx, 0, frames.length - 1);
  state.frameIndex = idx;
  const fr = frames[idx];
  $('#timeSlider').value = idx;
  const label = $('#timeLabel');
  const nowT = nowIndex();
  label.classList.toggle('future', fr.kind === 'nowcast');
  if (fr.kind === 'radar') {
    const ago = Math.round((frames[nowT].time - fr.time) / 60);
    label.textContent = `${fmtTime(fr.time)}\n${ago === 0 ? T().now : T().minAgo(ago)}`;
  } else if (fr.kind === 'nowcast') {
    label.textContent = `${fmtTime(fr.time)}\n${T().minAhead(Math.round((fr.time - frames[nowT].time) / 60))}`;
  } else {
    label.textContent = `${fmtDayTime(fr.time)}\n${T().fc}`;
  }
  const on = { radar: $('#lyrRadar').checked, nowcast: $('#lyrNowcast').checked }[fr.kind];
  if (!on) { state.overlay.setOpacity(0); return; }
  state.overlay.setOpacity(state.opacity);
  state.overlay.setUrl(fr.url).setBounds(state.radar.region.bounds);
}
function applyLayerVisibility() { showFrame(state.frameIndex); }

function togglePlay(force) {
  const want = force != null ? force : !state.playing;
  state.playing = want;
  $('#btnPlay').innerHTML = want
    ? '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M7 5v14l11-7z" fill="currentColor" stroke="none"/></svg>';
  clearInterval(state.playTimer);
  if (want) {
    state.playTimer = setInterval(() => {
      const n = state.frames.length; if (!n) return;
      let next = state.frameIndex + 1;
      if (next >= n) next = 0;
      showFrame(next);
    }, 350);
  }
}

// ---------------------------------------------------------------- point status (my location / tapped point)
let pointFetchGen = 0;
async function setPoint(lat, lon, name, kind) {
  state.point = { lat, lon, name, kind };
  state.pointData = null;
  if (kind === 'user') {
    if (!state.userMarker) state.userMarker = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="user-marker"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }).addTo(state.map);
    else state.userMarker.setLatLng([lat, lon]);
  } else {
    if (!state.pinMarker) state.pinMarker = L.marker([lat, lon], { icon: L.divIcon({ className: '', html: '<div class="pin-marker"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), interactive: false }).addTo(state.map);
    else state.pinMarker.setLatLng([lat, lon]);
  }
  $('#btnAddFav').disabled = false;
  renderStatus();
  const gen = ++pointFetchGen;
  try {
    const [fc, fl] = await Promise.all([
      fetch(`${CFG.openMeteo}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&minutely_15=precipitation&forecast_minutely_15=12&hourly=precipitation,precipitation_probability,weather_code&forecast_days=3&timezone=auto&timeformat=unixtime`).then((r) => r.json()),
      fetch(`${CFG.floodApi}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=river_discharge,river_discharge_mean&forecast_days=3`).then((r) => r.json()).catch(() => null),
    ]);
    if (gen !== pointFetchGen) return;
    state.pointData = { fc, fl };
  } catch (e) { if (gen === pointFetchGen) state.pointData = { error: e }; }
  renderStatus();
}
function refreshPointStatus() { if (state.point) renderStatus(); }

function renderStatus() {
  const p = state.point, card = $('#statusCard'), title = $('#statusTitle'), sub = $('#statusSub');
  card.classList.remove('rain', 'soon', 'flood');
  if (!p) { title.textContent = T().tapHint; sub.textContent = ''; drawMiniChart(null); return; }
  const t = T();
  const lines = [];
  let headline = '';
  // 1) Radar-based nowcast at the point
  const r = state.radar;
  let radarVerdict = null;
  if (r && r.frames.some((f) => f.canvas)) {
    const latestFrame = [...r.frames].filter((f) => f.canvas).sort((a, b) => b.time - a.time)[0];
    const nowI = sampleCanvas(latestFrame.canvas, r.region, p.lat, p.lon);
    if (nowI != null) {
      const series = [{ dt: 0, i: nowI }, ...r.nowcast.map((n, k) => ({ dt: (k + 1) * CFG.nowcastStepMin, i: sampleCanvas(n.canvas, r.region, p.lat, p.lon) ?? 0 }))];
      const TH = RAIN_THRESHOLD;
      if (nowI >= TH) {
        const stop = series.find((s) => s.i < TH);
        headline = t.rainingNow(t.strength[strengthClass(nowI)]);
        if (stop && r.nowcast.length) lines.push(t.stopsIn(stop.dt));
        card.classList.add('rain');
        radarVerdict = 'raining';
      } else if (r.nowcast.length) {
        const start = series.find((s) => s.i >= TH);
        if (start) { headline = t.rainIn(start.dt, t.strength[strengthClass(start.i)]); card.classList.add('soon'); radarVerdict = 'soon'; }
        else { headline = t.noRain60; radarVerdict = 'dry'; }
      }
      if (!radarCoverageAt(p.lat, p.lon)) { headline = ''; radarVerdict = null; lines.push(t.noRadarHere); }
    }
  }
  // 2) Model forecast at the point
  const pd = state.pointData;
  if (pd && pd.fc && pd.fc.hourly) {
    const H = pd.fc.hourly, now = Date.now() / 1000;
    let i0 = H.time.findIndex((x) => x >= now - 3600); if (i0 < 0) i0 = 0;
    const next = [];
    for (let i = i0; i < H.time.length && i < i0 + 48; i++) next.push({ t: H.time[i], mm: H.precipitation[i] || 0, p: H.precipitation_probability ? H.precipitation_probability[i] : null });
    const rain24 = next.slice(0, 24).reduce((s, x) => s + x.mm, 0);
    if (radarVerdict !== 'raining' && radarVerdict !== 'soon') {
      // look at 15-minute series first (next 3 h), then hourly
      const M = pd.fc.minutely_15;
      let found = null;
      if (M) for (let i = 0; i < M.time.length; i++) if (M.time[i] >= now && (M.precipitation[i] || 0) >= 0.2) { found = { t: M.time[i], p: null }; break; }
      if (!found) { const h = next.find((x) => x.t >= now && (x.mm >= 0.3 || (x.p != null && x.p >= 60))); if (h) found = { t: h.t, p: h.p }; }
      if (found) { const txt = t.nextRain(fmtDayTime(found.t), found.p); if (!headline) { headline = txt; card.classList.add('soon'); } else lines.push(txt); }
      else if (!headline) headline = t.noRain48;
      else lines.push(t.noRain48);
    }
    lines.push(t.rain24(rain24.toFixed(1)));
    drawMiniChart(next.slice(0, 24));
    // 3) River discharge (GloFAS via Open-Meteo flood API)
    const fl = pd.fl;
    if (fl && fl.daily && fl.daily.river_discharge) {
      const q = fl.daily.river_discharge.slice(0, 3), qm = fl.daily.river_discharge_mean.slice(0, 3);
      let ratio = 0;
      for (let i = 0; i < q.length; i++) if (q[i] != null && qm[i] > 0.05) ratio = Math.max(ratio, q[i] / qm[i]);
      if (ratio >= 1.5) { lines.push(t.riverHigh(ratio.toFixed(1))); card.classList.add('flood'); }
      else if (ratio > 0) lines.push(t.riverNormal);
    }
  } else if (!headline) headline = t.loadingForecast;
  // 4) Terrain flood estimate
  const fr = floodRiskAt(p.lat, p.lon);
  if (fr != null && $('#lyrFlood').checked) {
    const lvl = fr < 0.12 ? 0 : fr < 0.3 ? 1 : fr < 0.55 ? 2 : 3;
    lines.push(t.floodRisk(t.lvl[lvl]) + (lvl >= 2 ? ' ⚠' : ''));
    if (lvl >= 2) card.classList.add('flood');
  }
  title.textContent = `${p.name ? p.name + ': ' : ''}${headline}`;
  sub.innerHTML = lines.map((l) => l.replace(/⚠/g, '<b>⚠</b>')).join('\n');
}

function drawMiniChart(rows) {
  const c = $('#miniChart'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  if (!rows || !rows.length) { c.style.display = 'none'; return; }
  c.style.display = 'block';
  const W = c.width, H = c.height, n = rows.length, bw = W / n;
  const max = Math.max(2, ...rows.map((r) => r.mm));
  ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
  rows.forEach((r, i) => {
    const h = (r.mm / max) * (H - 24);
    const col = rainColor(Math.max(r.mm, 0.2));
    ctx.fillStyle = r.mm > 0 ? `rgb(${col[0]},${col[1]},${col[2]})` : 'rgba(255,255,255,0.08)';
    ctx.fillRect(i * bw + 2, H - 20 - Math.max(h, r.mm > 0 ? 3 : 2), bw - 4, Math.max(h, r.mm > 0 ? 3 : 2));
    if (r.p != null) { ctx.fillStyle = 'rgba(255,176,0,0.9)'; ctx.fillRect(i * bw + 2, H - 20 - (r.p / 100) * (H - 24), bw - 4, 2); }
    if (i % 4 === 0) { ctx.fillStyle = '#9db4cc'; ctx.fillText(fmtTime(r.t).replace(/:00$/, ''), i * bw + bw / 2, H - 4); }
  });
}

// ---------------------------------------------------------------- location, search, favourites
function locate() {
  if (!navigator.geolocation) { toast(T().geoFail); return; }
  $('#btnLocate').classList.add('active');
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    state.map.flyTo([lat, lon], Math.max(state.map.getZoom(), 8), { duration: 0.8 });
    setPoint(lat, lon, T().myLocation, 'user');
    $('#btnLocate').classList.remove('active');
  }, (err) => {
    $('#btnLocate').classList.remove('active');
    toast(err.code === 1 ? T().geoDenied : T().geoFail);
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
}

let searchTimer = null;
async function doSearch(q) {
  const list = $('#searchResults');
  if (!q || q.length < 2) { list.hidden = true; return; }
  try {
    const res = await fetch(`${CFG.geocode}?name=${encodeURIComponent(q)}&count=7&language=${LANG}&format=json`);
    const data = await res.json();
    list.innerHTML = '';
    if (!data.results || !data.results.length) { list.innerHTML = `<li><small>${T().searchNone}</small></li>`; list.hidden = false; return; }
    for (const r of data.results) {
      const li = document.createElement('li');
      li.tabIndex = 0;
      li.innerHTML = `${r.name}<small>${[r.admin2, r.admin1, r.country].filter(Boolean).join(' · ')}</small>`;
      li.onclick = () => { list.hidden = true; $('#searchInput').value = r.name; $('#searchInput').blur(); state.map.flyTo([r.latitude, r.longitude], Math.max(state.map.getZoom(), 9), { duration: 0.8 }); setPoint(r.latitude, r.longitude, r.name, 'pin'); };
      li.onkeydown = (e) => { if (e.key === 'Enter') li.onclick(); };
      list.appendChild(li);
    }
    list.hidden = false;
  } catch (e) { toast(T().offline); }
}

function renderFavs() {
  const ul = $('#favList'); ul.innerHTML = '';
  if (!state.favs.length) { ul.innerHTML = `<li class="empty">${T().noFav}</li>`; return; }
  state.favs.forEach((f, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="name">★ ${f.name}</span><button class="del" aria-label="ลบ">×</button>`;
    li.querySelector('.name').onclick = () => { closeDrawer(); state.map.flyTo([f.lat, f.lon], Math.max(state.map.getZoom(), 9), { duration: 0.8 }); setPoint(f.lat, f.lon, f.name, 'pin'); };
    li.querySelector('.del').onclick = () => { state.favs.splice(i, 1); saveFavs(); renderFavs(); };
    ul.appendChild(li);
  });
}
function saveFavs() { localStorage.setItem('rain.favs', JSON.stringify(state.favs)); }
function addFav() {
  const p = state.point; if (!p) { toast(T().selectFirst); return; }
  let name = p.name && p.name !== T().pinned && p.name !== T().myLocation ? p.name : prompt(LANG === 'th' ? 'ตั้งชื่อจุดนี้' : 'Name this place', p.name || '');
  if (!name) return;
  state.favs.push({ name, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4) });
  saveFavs(); renderFavs(); toast(T().saved);
}
function openDrawer() { $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').hidden = false; }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#scrim').hidden = true; }

// ---------------------------------------------------------------- events
let moveTimer = null;
function onMoveEnd() {
  const c = state.map.getCenter();
  localStorage.setItem('rain.view', JSON.stringify({ lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4), z: state.map.getZoom() }));
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => { refreshRadar(); if ($('#lyrFlood').checked) { refreshForecast(); refreshFlood(); } }, 700);
}

function applyLang() {
  document.documentElement.lang = LANG;
  const t = UI_TEXT[LANG];
  if (t) for (const [sel, [kind, val]] of Object.entries(t)) document.querySelectorAll(sel).forEach((el) => {
    if (kind === 'placeholder') el.placeholder = val;
    else if (kind === 'label') { const lab = el.closest('label'); if (lab) { lab.childNodes[lab.childNodes.length - 1].textContent = ' ' + val; } }
    else el.textContent = val;
  });
  if (LANG === 'th') { // restore Thai defaults
    $('#searchInput').placeholder = 'ค้นหาเมือง อำเภอ สถานที่…';
    const th = { lyrRadar: 'เรดาร์ฝน (ย้อนหลัง 2 ชม.)', lyrNowcast: 'คาดการณ์ 60 นาที (คำนวณจากเรดาร์)', lyrFlood: 'พื้นที่เสี่ยงน้ำท่วม (ประมาณการ)', lyrClouds: 'เมฆดาวเทียม Himawari IR (NASA)', lyrSatRain: 'ฝนดาวเทียม IMERG (NASA, ช้า ~4 ชม.)' };
    for (const [id, v] of Object.entries(th)) { const lab = $('#' + id).closest('label'); lab.childNodes[lab.childNodes.length - 1].textContent = ' ' + v; }
    $('#btnAddFav').textContent = '+ บันทึกจุดที่เลือกไว้';
    $('.t-past').textContent = 'ย้อนหลัง'; $('.t-now').textContent = 'ตอนนี้'; $('.t-next').textContent = 'คาดการณ์ 60 นาที';
  }
  renderFavs(); renderStatus(); if (state.frames.length) showFrame(state.frameIndex);
}

function bindUI() {
  $('#btnMenu').onclick = openDrawer;
  $('#btnCloseDrawer').onclick = closeDrawer;
  $('#scrim').onclick = closeDrawer;
  $('#btnLocate').onclick = locate;
  $('#btnLayers').onclick = () => { $('#layersPopover').hidden = !$('#layersPopover').hidden; };
  document.addEventListener('click', (e) => {
    if (!$('#layersPopover').hidden && !e.target.closest('#layersPopover') && !e.target.closest('#btnLayers')) $('#layersPopover').hidden = true;
    if (!e.target.closest('.search')) $('#searchResults').hidden = true;
  });
  $('#searchInput').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(e.target.value.trim()), 350); });
  $('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(searchTimer); doSearch(e.target.value.trim()); } });
  $('#timeSlider').addEventListener('input', (e) => { togglePlay(false); showFrame(+e.target.value); });
  $('#btnPlay').onclick = () => togglePlay();
  $('#opacity').addEventListener('input', (e) => { state.opacity = +e.target.value; showFrame(state.frameIndex); });
  $('#basemap').value = localStorage.getItem('rain.basemap') || 'dark';
  $('#basemap').onchange = (e) => setBasemap(e.target.value);
  ['lyrRadar', 'lyrNowcast'].forEach((id) => { $('#' + id).onchange = applyLayerVisibility; });
  $('#lyrFlood').onchange = (e) => { if (e.target.checked) refreshFlood(true); else { state.floodOverlay.remove(); } renderStatus(); };
  $('#lyrClouds').onchange = (e) => setGibsLayer('clouds', 'Himawari_AHI_Band13_Clean_Infrared', e.target.checked);
  $('#lyrSatRain').onchange = (e) => setGibsLayer('satrain', 'IMERG_Precipitation_Rate_30min', e.target.checked);
  $('#btnAddFav').onclick = addFav;
  $('#lang').value = LANG;
  $('#lang').onchange = (e) => { LANG = e.target.value; localStorage.setItem('rain.lang', LANG); applyLang(); };
  $('#clock').value = state.clock;
  $('#clock').onchange = (e) => { state.clock = e.target.value; localStorage.setItem('rain.clock', state.clock); showFrame(state.frameIndex); renderStatus(); };
  $('#version').textContent = 'v' + CFG.version;
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowLeft') showFrame(state.frameIndex - 1);
    if (e.key === 'ArrowRight') showFrame(state.frameIndex + 1);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshRadar(); } });
}

// ---------------------------------------------------------------- boot
async function boot() {
  initMap();
  bindUI();
  applyLang();
  renderFavs();
  loadCoverage();
  refreshRadar(true);
  if ($('#lyrFlood').checked) refreshForecast(true);   // the grid is only needed for the flood estimate
  setInterval(() => { refreshRadar(); if ($('#lyrFlood').checked) refreshForecast(); }, CFG.refreshEveryMs);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
