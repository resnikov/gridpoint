// ═══════════════════════════════════════════════════════════════
// GRIDPOINT — Main Application
// ═══════════════════════════════════════════════════════════════

const NOMINATIM = 'https://nominatim.openstreetmap.org';

// ── THEME ────────────────────────────────────────────────────
let isDark = true;

function applyTheme(dark) {
  isDark = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.getElementById('theme-toggle').innerHTML = dark
    ? `<span class="theme-icon">☀</span><span class="theme-label">DAY</span>`
    : `<span class="theme-icon">☽</span><span class="theme-label">NIGHT</span>`;
  // Swap tile layer
  updateTileLayer();
  localStorage.setItem('gp-theme', dark ? 'dark' : 'light');
}

// ── MAP TILE LAYERS ──────────────────────────────────────────
const TILE_LAYERS = {
  street: {
    label: 'Street',
    dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attr:  '© OpenStreetMap © CARTO',
  },
  satellite: {
    label: 'Satellite',
    dark:  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    light: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr:  '© Esri, Maxar, Earthstar Geographics',
  },
  topo: {
    label: 'Topo',
    dark:  'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    light: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attr:  '© OpenStreetMap © OpenTopoMap',
  },
  os: {
    label: 'OS',
    dark:  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr:  '© OpenStreetMap contributors',
  },
};

let currentMapType = 'street';
let tileLayer = null;

// ── MAP SETUP ────────────────────────────────────────────────
const map = L.map('map', {
  center: [54, -2],
  zoom: 6,
  zoomControl: false,
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

// ── GRID OVERLAYS ─────────────────────────────────────────
const grids = GridOverlays.create(map);
const activeGrids = new Set(JSON.parse(localStorage.getItem('gp-grids') || '[]'));

function saveGridPrefs() {
  localStorage.setItem('gp-grids', JSON.stringify([...activeGrids]));
}

document.querySelectorAll('.grid-toggle-btn').forEach(btn => {
  const key = btn.dataset.grid;
  if (activeGrids.has(key)) {
    btn.classList.add('active');
    grids[key]?.enable();
  }
  btn.addEventListener('click', () => {
    const on = !btn.classList.contains('active');
    btn.classList.toggle('active', on);
    grids[key]?.toggle(on);
    if (on) activeGrids.add(key); else activeGrids.delete(key);
    saveGridPrefs();
  });
});

function updateTileLayer() {
  const cfg = TILE_LAYERS[currentMapType];
  const url = isDark ? cfg.dark : cfg.light;
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(url, { attribution: cfg.attr, maxZoom: 19 }).addTo(map);
  // Satellite has no dark variant so overlay a dark filter in dark mode
  document.getElementById('map').classList.toggle('map-dark-overlay',
    isDark && (currentMapType === 'satellite' || currentMapType === 'topo' || currentMapType === 'os')
  );
}

updateTileLayer();

let marker = null;
const customIcon = L.divIcon({ className: 'custom-marker', iconSize: [14, 14], iconAnchor: [7, 7] });

function placeMarker(lat, lon) {
  if (marker) map.removeLayer(marker);
  marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
}

// ── MAP TYPE BUTTONS ─────────────────────────────────────────
function setMapType(type) {
  currentMapType = type;
  document.querySelectorAll('.map-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  updateTileLayer();
  localStorage.setItem('gp-maptype', type);
}

document.querySelectorAll('.map-type-btn').forEach(btn => {
  btn.addEventListener('click', () => setMapType(btn.dataset.type));
});

// ── THEME TOGGLE ─────────────────────────────────────────────
document.getElementById('theme-toggle').addEventListener('click', () => applyTheme(!isDark));

// ── GEOLOCATION ──────────────────────────────────────────────
function geolocate() {
  const btn = document.getElementById('locate-me-btn');
  if (!navigator.geolocation) {
    setError('Geolocation not supported by this browser');
    return;
  }
  btn.classList.add('locating');
  btn.title = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.classList.remove('locating');
      btn.title = 'Use my location';
      const { latitude: lat, longitude: lon } = pos.coords;
      map.setView([lat, lon], 13);
      showPoint(lat, lon);
    },
    (err) => {
      btn.classList.remove('locating');
      btn.title = 'Use my location';
      const msgs = {
        1: 'Location access denied. Please allow location in your browser.',
        2: 'Location unavailable.',
        3: 'Location request timed out.',
      };
      setError(msgs[err.code] || 'Geolocation failed');
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

document.getElementById('locate-me-btn').addEventListener('click', geolocate);

// ── INPUT TEMPLATES ──────────────────────────────────────────
const inputTemplates = {
  latlon_dd: () => `
    <div class="input-label">Latitude</div>
    <input type="text" id="inp1" placeholder="e.g. 51.5074" />
    <div class="input-label">Longitude</div>
    <input type="text" id="inp2" placeholder="e.g. -0.1278" />`,

  latlon_dms: () => `
    <div class="input-label">Latitude (DMS)</div>
    <input type="text" id="inp1" placeholder="e.g. 51° 30' 26.4&quot; N" />
    <div class="input-label">Longitude (DMS)</div>
    <input type="text" id="inp2" placeholder="e.g. 0° 7' 40.0&quot; W" />`,

  latlon_dm: () => `
    <div class="input-label">Latitude (DDM)</div>
    <input type="text" id="inp1" placeholder="e.g. 51° 30.4400' N" />
    <div class="input-label">Longitude (DDM)</div>
    <input type="text" id="inp2" placeholder="e.g. 0° 7.6667' W" />`,

  maidenhead: () => `
    <div class="input-label">Maidenhead Grid Locator</div>
    <input type="text" id="inp1" placeholder="e.g. IO91WM" style="text-transform:uppercase" />`,

  postcode: () => `
    <div class="input-label">UK Postcode</div>
    <input type="text" id="inp1" placeholder="e.g. SW1A 1AA" style="text-transform:uppercase" />`,

  town: () => `
    <div class="input-label">Town / Place Name</div>
    <input type="text" id="inp1" placeholder="e.g. Manchester, UK" />`,

  osgrid: () => `
    <div class="input-label">OS Grid Reference</div>
    <input type="text" id="inp1" placeholder="e.g. TQ 30081 80861" style="text-transform:uppercase" />`,

  wab: () => `
    <div class="input-label">WAB Square</div>
    <input type="text" id="inp1" placeholder="e.g. SP45" style="text-transform:uppercase" />`,

  pluscode: () => `
    <div class="input-label">Plus Code (Open Location Code)</div>
    <input type="text" id="inp1" placeholder="e.g. 9C3XGV4C+XV" style="text-transform:uppercase" />`,
};

// ── UI LOGIC ─────────────────────────────────────────────────
const formatSelect = document.getElementById('format-select');
const inputArea    = document.getElementById('input-area');
const goBtn        = document.getElementById('go-btn');
const errorMsg     = document.getElementById('error-msg');
const resultsPanel = document.getElementById('results-panel');
const resultsGrid  = document.getElementById('results-grid');
const resultsCoords = document.getElementById('results-coords');
const loading      = document.getElementById('loading');

function renderInputs() {
  const fmt = formatSelect.value;
  inputArea.innerHTML = inputTemplates[fmt]?.() || '';
  errorMsg.textContent = '';
  inputArea.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') locateAction(); });
  });
}

formatSelect.addEventListener('change', renderInputs);
renderInputs();

function showLoading(v) { loading.classList.toggle('hidden', !v); }
function setError(msg)  { errorMsg.textContent = msg; }

// ── GEOCODING ────────────────────────────────────────────────
async function geocodeNominatim(query) {
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  if (!data.length) throw new Error(`No results found for: "${query}"`);
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}



async function resolvePostcode(postcode) {
  const clean = postcode.replace(/\s+/g, '').toUpperCase();
  const res  = await fetch(`https://api.postcodes.io/postcodes/${clean}`);
  const data = await res.json();
  if (data.status !== 200) throw new Error(`Postcode not found: ${postcode}`);
  return { lat: data.result.latitude, lon: data.result.longitude };
}

// ── LOCATE ACTION ────────────────────────────────────────────
async function locateAction() {
  setError('');
  const fmt  = formatSelect.value;
  const inp1 = document.getElementById('inp1')?.value?.trim();
  const inp2 = document.getElementById('inp2')?.value?.trim();
  showLoading(true);
  try {
    let lat, lon;
    switch (fmt) {
      case 'latlon_dd':  { const r = Conv.parseDD(inp1, inp2);       lat = r.lat; lon = r.lon; break; }
      case 'latlon_dms': { const r = Conv.parseDMSPair(inp1, inp2);  lat = r.lat; lon = r.lon; break; }
      case 'latlon_dm':  { const r = Conv.parseDMPair(inp1, inp2);   lat = r.lat; lon = r.lon; break; }
      case 'maidenhead': { const r = Conv.fromMaidenhead(inp1);       lat = r.lat; lon = r.lon; break; }
      case 'postcode':   { const r = await resolvePostcode(inp1);     lat = r.lat; lon = r.lon; break; }
      case 'town':       { const r = await geocodeNominatim(inp1);    lat = r.lat; lon = r.lon; break; }
      case 'osgrid':     { const r = Conv.fromOSGridRef(inp1);        lat = r.lat; lon = r.lon; break; }
      case 'wab':        { const r = Conv.fromWAB(inp1);              lat = r.lat; lon = r.lon; break; }
      case 'pluscode':   { const r = Conv.decodePlusCodes(inp1);       lat = r.lat; lon = r.lon; break; }
      default: throw new Error('Unknown format');
    }
    showPoint(lat, lon);
  } catch (e) {
    setError(e.message);
  } finally {
    showLoading(false);
  }
}

goBtn.addEventListener('click', locateAction);

// ── SHOW POINT ───────────────────────────────────────────────
function showPoint(lat, lon) {
  map.setView([lat, lon], Math.max(map.getZoom(), 12));
  placeMarker(lat, lon);
  renderResults(lat, lon);
}

function renderResults(lat, lon) {
  const formats = Conv.getAllFormats(lat, lon);
  resultsCoords.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  resultsGrid.innerHTML = '';
  resultsPanel.classList.remove('hidden');

  formats.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.style.animationDelay = `${i * 40}ms`;
    const safeVal = item.value.replace(/'/g, "\\'");
    div.innerHTML = `
      <span class="result-label">${item.label}</span>
      <span class="result-value">${item.value}</span>
      <button class="copy-btn" title="Copy" onclick="copyVal(this,'${safeVal}')">⧉</button>
    `;
    resultsGrid.appendChild(div);
  });
}

function copyVal(btn, val) {
  navigator.clipboard.writeText(val).then(() => {
    const item = btn.closest('.result-item');
    item.classList.add('copied');
    btn.textContent = '✓';
    setTimeout(() => { item.classList.remove('copied'); btn.textContent = '⧉'; }, 1200);
  });
}
window.copyVal = copyVal;

// ── MAP CLICK ────────────────────────────────────────────────
map.on('click', async (e) => {
  const { lat, lng: lon } = e.latlng;
  placeMarker(lat, lon);
  renderResults(lat, lon);
  try {
    const res  = await fetch(`${NOMINATIM}/reverse?lat=${lat}&lon=${lon}&format=json`);
    const data = await res.json();
    if (data.display_name) {
      marker.bindPopup(`
        <div class="popup-label">NEAREST PLACE</div>
        <div style="font-size:13px;margin-top:4px;max-width:220px;white-space:normal">${data.display_name}</div>
        <div class="popup-label" style="margin-top:8px">COORDINATES</div>
        <div class="popup-coord">${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
      `).openPopup();
    }
  } catch(_) { /* silent */ }
});

// ── RESTORE SAVED PREFS & AUTO-LOCATE ────────────────────────
(function init() {
  const savedMapType   = localStorage.getItem('gp-maptype') || 'street';
  const savedTheme     = localStorage.getItem('gp-theme');      // null = never set
  const userHasSetTheme = savedTheme !== null;

  // Apply saved map type
  currentMapType = savedMapType;
  document.querySelectorAll('.map-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === savedMapType);
  });

  // Theme fallback using local clock while we wait for geolocation
  if (userHasSetTheme) {
    applyTheme(savedTheme === 'dark');
  } else {
    const h = new Date().getHours();
    applyTheme(h < 7 || h >= 20); // rough local-time fallback
  }

  // Auto-locate: fly to user and refine theme with accurate solar maths
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        map.setView([lat, lon], 13);
        placeMarker(lat, lon);
        renderResults(lat, lon);

        // Only override theme if user hasn't manually picked one this session
        if (!userHasSetTheme) {
          applyTheme(!isDaytime(lat, lon));
        }
      },
      () => { /* permission denied — keep clock-based fallback */ },
      { timeout: 8000, maximumAge: 300000 }
    );
  }
})();

// ── SOLAR DAY/NIGHT CALCULATION ──────────────────────────────
// Returns true if it is currently daytime at the given lat/lon.
// Pure maths — no API required.
function isDaytime(lat, lon) {
  const now  = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;

  // Day of year
  const start     = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / 86400000);

  // Solar declination & equation of time
  const B    = (360 / 365) * (dayOfYear - 81);
  const decl = 23.45 * Math.sin(B * Math.PI / 180);
  const eot  = 9.87 * Math.sin(2 * B * Math.PI / 180)
             - 7.53 * Math.cos(B * Math.PI / 180)
             - 1.5  * Math.sin(B * Math.PI / 180);

  // Solar noon UTC at this longitude
  const solarNoonUTC = 12 - lon / 15 - eot / 60;

  // Hour angle at sunrise/sunset
  const latR  = lat  * Math.PI / 180;
  const declR = decl * Math.PI / 180;
  const cosH  = -Math.tan(latR) * Math.tan(declR);

  if (cosH < -1) return true;  // midnight sun
  if (cosH >  1) return false; // polar night

  const halfDay = Math.acos(cosH) * 180 / Math.PI / 15;
  return utcH >= (solarNoonUTC - halfDay) && utcH <= (solarNoonUTC + halfDay);
}
