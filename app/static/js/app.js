// ═══════════════════════════════════════════════════════════════
// GRIDPOINT — Main Application
// ═══════════════════════════════════════════════════════════════

const NOMINATIM = 'https://nominatim.openstreetmap.org';

// ── HTML ESCAPING ────────────────────────────────────────────
// Anything that originates outside this file (Nominatim place names,
// API responses) must pass through here before touching innerHTML.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

// ── MAP TILE LAYERS ──────────────────────────────
// Every source here is keyless. CARTO basemaps were removed because they
// now require an API key. None of these ship a dark variant, so dark mode
// dims them with a CSS overlay instead (see darkFilter).
const TILE_LAYERS = {
  street: {
    label: 'Street',
    url:   'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr:  '© OpenStreetMap contributors',
    maxZoom: 19,
    darkFilter: true,
  },
  satellite: {
    label: 'Satellite',
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr:  '© Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
    darkFilter: true,
  },
  topo: {
    label: 'Topo',
    url:   'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attr:  '© OpenStreetMap © OpenTopoMap',
    maxZoom: 17,
    darkFilter: true,
  },
};

const DEFAULT_MAP_TYPE = 'street';

let currentMapType = DEFAULT_MAP_TYPE;
let tileLayer = null;

// ── MAP SETUP ────────────────────────────────────────────────
const map = L.map('map', {
  center: [54, -2],
  zoom: 6,
  zoomControl: false,
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

// Map type switcher floats over the map's top-right corner.
const MapTypeControl = L.Control.extend({
  options: { position: 'topright' },
  onAdd() {
    const div = L.DomUtil.create('div', 'map-type-control');
    div.innerHTML = Object.entries(TILE_LAYERS)
      .map(([key, cfg]) => `<button type="button" class="map-type-btn" data-type="${key}">${cfg.label}</button>`)
      .join('');
    // Clicking a button must not also drop a marker on the map.
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  },
});
new MapTypeControl().addTo(map);

// ── GRID OVERLAYS ─────────────────────────────────────────
const grids = GridOverlays.create(map);

// Drop saved keys for overlays that no longer exist, and tolerate a corrupt
// or absent value rather than taking the whole app down at load.
function loadGridPrefs() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem('gp-grids') || '[]'); } catch (e) { /* ignore */ }
  return new Set(Array.isArray(saved) ? saved.filter(k => k in grids) : []);
}

const activeGrids = loadGridPrefs();

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
  // A stale saved preference (e.g. a layer that has since been removed)
  // must not leave the map with no tiles.
  let cfg = TILE_LAYERS[currentMapType];
  if (!cfg) {
    currentMapType = DEFAULT_MAP_TYPE;
    cfg = TILE_LAYERS[currentMapType];
  }
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(cfg.url, {
    attribution: cfg.attr,
    maxZoom: cfg.maxZoom || 19,
  }).addTo(map);
  document.getElementById('map').classList.toggle('map-dark-overlay', isDark && !!cfg.darkFilter);
}

// No initial call here: init() below always runs applyTheme(), which adds the
// tile layer once the saved map type is known. Calling it here as well built
// the layer twice on every load.

let activeTab = 'locate';
let marker = null;
let locatedPoint = null;
const customIcon = L.divIcon({ className: 'custom-marker', iconSize: [14, 14], iconAnchor: [7, 7] });

function placeMarker(lat, lon) {
  if (marker) map.removeLayer(marker);
  locatedPoint = { lat, lon };
  marker = L.marker([lat, lon], { icon: customIcon });
  // The bearing tab draws its own A/B markers, so keep this one off the map there.
  if (activeTab === 'locate') marker.addTo(map);
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
      if (activeTab === 'bearing') {
        placeMarker(lat, lon);
        renderResults(lat, lon);
        bearing.setHome(lat, lon);
        return;
      }
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

document.getElementById('locate-me-btn').addEventListener('click', (e) => {
  // The button sits inside the brand bar, which toggles the mobile drawer.
  e.stopPropagation();
  geolocate();
});

// ── INPUT TEMPLATES ──────────────────────────────────────────
// Each template takes an id prefix so the Locate and Bearing tabs can render
// the same fields side by side: inputs get ids `${p}1` and `${p}2`.
const inputTemplates = {
  latlon_dd: (p) => `
    <div class="input-label">Latitude</div>
    <input type="text" id="${p}1" placeholder="e.g. 51.5074" />
    <div class="input-label">Longitude</div>
    <input type="text" id="${p}2" placeholder="e.g. -0.1278" />`,

  latlon_dms: (p) => `
    <div class="input-label">Latitude (DMS)</div>
    <input type="text" id="${p}1" placeholder="e.g. 51° 30' 26.4&quot; N" />
    <div class="input-label">Longitude (DMS)</div>
    <input type="text" id="${p}2" placeholder="e.g. 0° 7' 40.0&quot; W" />`,

  latlon_dm: (p) => `
    <div class="input-label">Latitude (DDM)</div>
    <input type="text" id="${p}1" placeholder="e.g. 51° 30.4400' N" />
    <div class="input-label">Longitude (DDM)</div>
    <input type="text" id="${p}2" placeholder="e.g. 0° 7.6667' W" />`,

  maidenhead: (p) => `
    <div class="input-label">Maidenhead Grid Locator</div>
    <input type="text" id="${p}1" placeholder="e.g. IO91WM" style="text-transform:uppercase" />`,

  postcode: (p) => `
    <div class="input-label">UK Postcode</div>
    <input type="text" id="${p}1" placeholder="e.g. SW1A 1AA" style="text-transform:uppercase" />`,

  town: (p) => `
    <div class="input-label">Town / Place Name</div>
    <input type="text" id="${p}1" placeholder="e.g. Manchester, UK" />`,

  osgrid: (p) => `
    <div class="input-label">OS Grid Reference</div>
    <input type="text" id="${p}1" placeholder="e.g. TQ 30081 80861" style="text-transform:uppercase" />`,

  wab: (p) => `
    <div class="input-label">WAB Square</div>
    <input type="text" id="${p}1" placeholder="e.g. SP45" style="text-transform:uppercase" />`,

  pluscode: (p) => `
    <div class="input-label">Plus Code (Open Location Code)</div>
    <input type="text" id="${p}1" placeholder="e.g. 9C3XGV4C+XV" style="text-transform:uppercase" />`,
};

function renderFormatInputs(container, fmt, idPrefix, onEnter) {
  container.innerHTML = inputTemplates[fmt]?.(idPrefix) || '';
  container.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(); });
  });
}

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
  renderFormatInputs(inputArea, formatSelect.value, 'inp', locateAction);
  errorMsg.textContent = '';
}

formatSelect.addEventListener('change', renderInputs);
renderInputs();

function showLoading(v) { loading.classList.toggle('hidden', !v); }
function setError(msg)  { errorMsg.textContent = msg; }

// ── MOBILE DRAWER ────────────────────────────────────────────
(function setupDrawer() {
  const sidebar = document.getElementById('sidebar');
  const brand   = document.getElementById('brand');

  function isMobile() { return window.innerWidth < 600; }

  function openDrawer()  { sidebar.classList.add('drawer-open'); }
  // Collapsed, only the top of the drawer peeks out, so scroll back to the
  // brand bar or the peek shows whatever content the user had scrolled to.
  function closeDrawer() { sidebar.classList.remove('drawer-open'); sidebar.scrollTop = 0; }
  function toggleDrawer(){
    if (sidebar.classList.contains('drawer-open')) closeDrawer(); else openDrawer();
  }

  // Tap the brand bar to toggle on mobile
  brand.addEventListener('click', () => { if (isMobile()) toggleDrawer(); });

  // Close drawer when user taps the map (so they can see the full map)
  document.getElementById('map').addEventListener('click', () => {
    if (isMobile()) closeDrawer();
  });

  // Touch swipe down on sidebar to collapse
  let touchStartY = 0;
  sidebar.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  sidebar.addEventListener('touchend', e => {
    if (!isMobile()) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (dy > 60)  closeDrawer(); // swipe down  → collapse
    if (dy < -60) openDrawer();  // swipe up    → expand
  }, { passive: true });

  // Re-check on resize
  window.addEventListener('resize', () => {
    if (!isMobile()) sidebar.classList.remove('drawer-open');
  });
})();

// ── GEOCODING ────────────────────────────────────────────────
async function geocodeNominatim(query) {
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  // Nominatim answers a rate-limited request with HTML, so parsing first
  // surfaced a raw JSON SyntaxError to the user.
  if (!res.ok) {
    throw new Error(res.status === 429
      ? 'Place lookup is rate limited right now — please wait a moment.'
      : `Place lookup failed (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data.length) throw new Error(`No results found for: "${query}"`);
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function resolvePostcode(postcode) {
  const clean = String(postcode || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{5,7}$/.test(clean)) throw new Error(`Not a valid UK postcode: ${postcode}`);
  // Encode the segment: an unencoded value can otherwise rewrite the request path.
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
  // 404 carries a JSON body with status, so let that fall through to the check below.
  if (!res.ok && res.status !== 404) throw new Error(`Postcode lookup failed (HTTP ${res.status})`);
  const data = await res.json();
  if (data.status !== 200) throw new Error(`Postcode not found: ${postcode}`);
  return { lat: data.result.latitude, lon: data.result.longitude };
}

// ── RESOLVE INPUT ────────────────────────────────────────────
async function resolveInput(fmt, inp1, inp2) {
  let r;
  switch (fmt) {
    case 'latlon_dd':  r = Conv.parseDD(inp1, inp2);       break;
    case 'latlon_dms': r = Conv.parseDMSPair(inp1, inp2);  break;
    case 'latlon_dm':  r = Conv.parseDMPair(inp1, inp2);   break;
    case 'maidenhead': r = Conv.fromMaidenhead(inp1);      break;
    case 'postcode':   r = await resolvePostcode(inp1);    break;
    case 'town':       r = await geocodeNominatim(inp1);   break;
    case 'osgrid':     r = Conv.fromOSGridRef(inp1);       break;
    case 'wab':        r = Conv.fromWAB(inp1);             break;
    case 'pluscode':   r = Conv.decodePlusCodes(inp1);     break;
    default: throw new Error('Unknown format');
  }
  assertLatLon(r.lat, r.lon);
  return { lat: r.lat, lon: r.lon };
}

// ── LOCATE ACTION ────────────────────────────────────────────
async function locateAction() {
  setError('');
  const inp1 = document.getElementById('inp1')?.value?.trim();
  const inp2 = document.getElementById('inp2')?.value?.trim();
  showLoading(true);
  try {
    const { lat, lon } = await resolveInput(formatSelect.value, inp1, inp2);
    showPoint(lat, lon);
  } catch (e) {
    setError(e.message);
  } finally {
    showLoading(false);
  }
}

goBtn.addEventListener('click', locateAction);

// ── SHOW POINT ───────────────────────────────────────────────
// A parser that returns NaN or an out-of-range value must not reach Leaflet:
// setView([NaN, NaN]) throws, and toFixed() would print "NaN" in the sidebar.
function assertLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('That input did not resolve to a valid coordinate');
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`Coordinate out of range: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  }
}

function showPoint(lat, lon) {
  map.setView([lat, lon], Math.max(map.getZoom(), 12));
  placeMarker(lat, lon);
  renderResults(lat, lon);
  // On mobile, open the drawer so user can see the results
  if (window.innerWidth < 600) {
    document.getElementById('sidebar').classList.add('drawer-open');
  }
}

function renderResults(lat, lon) {
  const formats = Conv.getAllFormats(lat, lon);
  resultsCoords.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  resultsGrid.innerHTML = '';
  resultsPanel.classList.remove('hidden');

  formats.forEach((item, i) => renderResultItem(resultsGrid, item.label, item.value, i));
}

function renderResultItem(container, label, value, i) {
  const div = document.createElement('div');
  div.className = 'result-item';
  div.style.animationDelay = `${i * 40}ms`;
  div.innerHTML = `
    <span class="result-label">${escapeHtml(label)}</span>
    <span class="result-value">${escapeHtml(value)}</span>
    <button class="copy-btn" title="Copy">⧉</button>
  `;
  const btn = div.querySelector('.copy-btn');
  btn.addEventListener('click', () => copyVal(btn, value));
  container.appendChild(div);
}

function copyVal(btn, val) {
  navigator.clipboard.writeText(val).then(() => {
    const item = btn.closest('.result-item');
    item.classList.add('copied');
    btn.textContent = '✓';
    setTimeout(() => { item.classList.remove('copied'); btn.textContent = '⧉'; }, 1200);
  });
}

// ── MAP CLICK ────────────────────────────────────────────────
// Nominatim asks for at most one request per second, and a burst of clicks used
// to fire one lookup each. Defer the lookup and abort any request the next click
// supersedes — that also stops a slow reply for an earlier click opening its
// popup on the marker for a later one.
const REVERSE_DEBOUNCE_MS = 400;
let reverseTimer = null;
let reverseAbort = null;

function queueReverseGeocode(lat, lon) {
  clearTimeout(reverseTimer);
  if (reverseAbort) reverseAbort.abort();
  reverseTimer = setTimeout(async () => {
    const ctl = new AbortController();
    reverseAbort = ctl;
    try {
      const res = await fetch(
        `${NOMINATIM}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&format=json`,
        { signal: ctl.signal, headers: { 'Accept-Language': 'en' } }
      );
      if (!res.ok) return;
      const data = await res.json();
      // A later click may have won the race while we were parsing.
      if (ctl !== reverseAbort || !data.display_name || !marker) return;
      marker.bindPopup(`
        <div class="popup-label">NEAREST PLACE</div>
        <div style="font-size:13px;margin-top:4px;max-width:220px;white-space:normal">${escapeHtml(data.display_name)}</div>
        <div class="popup-label" style="margin-top:8px">COORDINATES</div>
        <div class="popup-coord">${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
      `).openPopup();
    } catch (_) { /* aborted or offline — leave the marker without a popup */ }
  }, REVERSE_DEBOUNCE_MS);
}

map.on('click', (e) => {
  if (activeTab === 'bearing') {
    // Wrap so a click on a repeated world copy still yields a valid longitude.
    const { lat, lng } = e.latlng.wrap();
    bearing.handleMapClick(lat, lng);
    return;
  }
  const { lat, lng: lon } = e.latlng;
  placeMarker(lat, lon);
  renderResults(lat, lon);
  queueReverseGeocode(lat, lon);
});

// ── BEARING TOOL ─────────────────────────────────────────────
const mapHintText = document.getElementById('map-hint-text');
const LOCATE_HINT = 'Click anywhere on the map to decode that location';

const bearing = BearingTool.create(map, {
  resolveInput,
  renderFormatInputs,
  renderResultItem,
  showLoading,
  formatOptionsHtml: formatSelect.innerHTML,
  getLocatedPoint: () => locatedPoint,
  setHint: (text) => { mapHintText.textContent = text; },
});

// ── SIDEBAR TABS ─────────────────────────────────────────────
function setTab(name) {
  if (name !== 'locate' && name !== 'bearing') name = 'locate';
  activeTab = name;
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p =>
    p.classList.toggle('active', p.dataset.pane === name));

  if (name === 'bearing') {
    if (marker) map.removeLayer(marker);
    bearing.activate();
  } else {
    bearing.deactivate();
    if (marker) marker.addTo(map);
    mapHintText.textContent = LOCATE_HINT;
  }
  localStorage.setItem('gp-tab', name);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab));
});

// ── RESTORE SAVED PREFS & AUTO-LOCATE ────────────────────────
(function init() {
  const savedType      = localStorage.getItem('gp-maptype');
  const savedMapType   = TILE_LAYERS[savedType] ? savedType : DEFAULT_MAP_TYPE;
  const savedTheme     = localStorage.getItem('gp-theme');      // null = never set
  const userHasSetTheme = savedTheme !== null;

  setTab(localStorage.getItem('gp-tab'));

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
        bearing.offerHome(lat, lon);

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
