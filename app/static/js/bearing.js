// ═══════════════════════════════════════════════════════════════
// GRIDPOINT — Bearing & Distance between two points
// ═══════════════════════════════════════════════════════════════

const BearingTool = (() => {

  const EARTH_RADIUS_KM = 6371.0088;   // IUGG mean radius
  const KM_PER_MILE     = 1.609344;
  const KM_PER_NMI      = 1.852;
  const RAD             = Math.PI / 180;
  const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

  // ── Great-circle maths ───────────────────────────────────────
  // Initial (forward) true bearing from a to b, 0–360°.
  function initialBearing(a, b) {
    const φ1 = a.lat * RAD, φ2 = b.lat * RAD, Δλ = (b.lon - a.lon) * RAD;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) / RAD + 360) % 360;
  }

  // Haversine distance in km.
  function distanceKm(a, b) {
    const dφ = (b.lat - a.lat) * RAD, dλ = (b.lon - a.lon) * RAD;
    const h = Math.sin(dφ / 2) ** 2 +
              Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dλ / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function compassPoint(deg) {
    return COMPASS[Math.round(deg / 22.5) % 16];
  }

  // Points along the great circle from a to b. Longitudes are unwrapped so a
  // path crossing the antimeridian draws as one continuous line rather than
  // streaking back across the whole map.
  function greatCircle(a, b, steps = 96) {
    const φ1 = a.lat * RAD, λ1 = a.lon * RAD, φ2 = b.lat * RAD, λ2 = b.lon * RAD;
    const d = distanceKm(a, b) / EARTH_RADIUS_KM;
    const sinD = Math.sin(d);
    // Coincident or antipodal: the path is undefined, so fall back to a straight segment.
    if (Math.abs(sinD) < 1e-12) return [[a.lat, a.lon], [b.lat, b.lon]];

    const pts = [];
    let prevLon = a.lon;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const A = Math.sin((1 - f) * d) / sinD;
      const B = Math.sin(f * d) / sinD;
      const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
      const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
      const z = A * Math.sin(φ1) + B * Math.sin(φ2);
      const lat = Math.atan2(z, Math.hypot(x, y)) / RAD;
      let lon = Math.atan2(y, x) / RAD;
      while (lon - prevLon > 180)  lon -= 360;
      while (lon - prevLon < -180) lon += 360;
      pts.push([lat, lon]);
      prevLon = lon;
    }
    return pts;
  }

  // ── Formatting ───────────────────────────────────────────────
  function fmtDeg(deg) {
    return `${deg.toFixed(1).padStart(5, '0')}°`;
  }

  function fmtDist(v) {
    if (v < 10)   return v.toFixed(2);
    if (v < 1000) return v.toFixed(1);
    return Math.round(v).toLocaleString('en-GB');
  }

  // ── UI ───────────────────────────────────────────────────────
  // deps: resolveInput, renderFormatInputs, renderResultItem, showLoading,
  //       formatOptionsHtml, getLocatedPoint, setHint
  function create(map, deps) {
    const points  = { A: null, B: null };
    const markers = {};
    const layer   = L.layerGroup();
    let line      = null;
    let pickSlot  = 'A';
    let active    = false;

    const el       = id => document.getElementById(id);
    const errorEl  = el('brg-error');
    const resultEl = el('brg-result');
    const rowsEl   = el('brg-rows');
    const selects  = {};
    const slotEls  = {};

    const icons = {
      A: L.divIcon({ className: 'brg-marker brg-marker--a', html: 'A', iconSize: [22, 22], iconAnchor: [11, 11] }),
      B: L.divIcon({ className: 'brg-marker brg-marker--b', html: 'B', iconSize: [22, 22], iconAnchor: [11, 11] }),
    };

    function setError(msg) { errorEl.textContent = msg; }

    function updateHint() {
      if (active) deps.setHint(`Click the map to set point ${pickSlot}`);
    }

    function setPickSlot(slot) {
      pickSlot = slot;
      Object.entries(slotEls).forEach(([s, root]) => {
        root.classList.toggle('picking', s === slot);
      });
      updateHint();
    }

    function updateStatus(slot) {
      const p = points[slot];
      const status = slotEls[slot].querySelector('.brg-point-status');
      status.classList.toggle('set', !!p);
      status.textContent = p
        ? `${Conv.toMaidenhead(p.lat, p.lon, 6)} · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`
        : 'Not set';
    }

    function setPoint(slot, lat, lon) {
      points[slot] = { lat, lon };
      if (markers[slot]) markers[slot].setLatLng([lat, lon]);
      else markers[slot] = L.marker([lat, lon], { icon: icons[slot], zIndexOffset: 500 }).addTo(layer);
      updateStatus(slot);
      // A is usually set once (home), B is the one that changes, so after
      // setting A the next map click goes to B.
      if (slot === 'A') setPickSlot('B');
      redraw();
    }

    function redraw() {
      if (line) { layer.removeLayer(line); line = null; }
      const { A, B } = points;
      if (!A || !B) {
        resultEl.classList.add('hidden');
        return;
      }

      const path = greatCircle(A, B);
      // Put B on the same world copy as the end of the unwrapped line.
      markers.B.setLatLng(path[path.length - 1]);

      const fwd = initialBearing(A, B);
      const rev = initialBearing(B, A);
      const km  = distanceKm(A, B);

      line = L.polyline(path, { className: 'brg-line', weight: 3, interactive: true })
        .bindTooltip(`${fmtDist(km)} km · ${fmtDeg(fwd)}`, {
          permanent: true, direction: 'center', className: 'brg-line-label',
        })
        .addTo(layer);

      el('brg-arrow').style.transform = `rotate(${fwd}deg)`;
      el('brg-head-bearing').textContent = fmtDeg(fwd);
      el('brg-head-compass').textContent = `${compassPoint(fwd)} · true`;
      el('brg-head-dist').textContent = `${fmtDist(km)} km`;
      el('brg-head-dist-sub').textContent =
        `${fmtDist(km / KM_PER_MILE)} mi · ${fmtDist(km / KM_PER_NMI)} nmi`;

      rowsEl.innerHTML = '';
      [
        ['Bearing A → B', `${fmtDeg(fwd)} ${compassPoint(fwd)}`],
        ['Bearing B → A', `${fmtDeg(rev)} ${compassPoint(rev)}`],
        ['Distance (km)', `${fmtDist(km)} km`],
        ['Distance (mi)', `${fmtDist(km / KM_PER_MILE)} mi`],
        ['Distance (nmi)', `${fmtDist(km / KM_PER_NMI)} nmi`],
      ].forEach(([label, value], i) => deps.renderResultItem(rowsEl, label, value, i));

      resultEl.classList.remove('hidden');
    }

    // Bring whatever is set into view (only for typed input — a map click
    // should never move the map out from under the pointer).
    function frame() {
      if (line) {
        map.fitBounds(line.getBounds(), { padding: [60, 60], maxZoom: 14 });
      } else {
        const p = points.A || points.B;
        if (p) map.setView([p.lat, p.lon], Math.max(map.getZoom(), 12));
      }
    }

    async function setFromInput(slot) {
      setError('');
      const v1 = el(`brg${slot}-inp1`)?.value?.trim();
      const v2 = el(`brg${slot}-inp2`)?.value?.trim();
      deps.showLoading(true);
      try {
        const p = await deps.resolveInput(selects[slot].value, v1, v2);
        setPoint(slot, p.lat, p.lon);
        frame();
      } catch (e) {
        setError(`Point ${slot}: ${e.message}`);
      } finally {
        deps.showLoading(false);
      }
    }

    ['A', 'B'].forEach(slot => {
      const root   = document.querySelector(`.brg-point[data-slot="${slot}"]`);
      const select = root.querySelector('.brg-format');
      const area   = root.querySelector('.brg-input-area');
      slotEls[slot] = root;
      selects[slot] = select;
      select.innerHTML = deps.formatOptionsHtml;

      const render = () => {
        deps.renderFormatInputs(area, select.value, `brg${slot}-inp`, () => setFromInput(slot));
        setError('');
      };
      select.addEventListener('change', render);
      render();

      root.querySelector('.brg-set-btn').addEventListener('click', () => setFromInput(slot));
      root.querySelector('.brg-pick-btn').addEventListener('click', () => setPickSlot(slot));
      updateStatus(slot);
    });

    el('brg-swap').addEventListener('click', () => {
      const { A, B } = points;
      points.A = B;
      points.B = A;
      ['A', 'B'].forEach(slot => {
        const p = points[slot];
        if (p) {
          if (markers[slot]) markers[slot].setLatLng([p.lat, p.lon]);
          else markers[slot] = L.marker([p.lat, p.lon], { icon: icons[slot], zIndexOffset: 500 }).addTo(layer);
        } else if (markers[slot]) {
          layer.removeLayer(markers[slot]);
          delete markers[slot];
        }
        updateStatus(slot);
      });
      redraw();
    });

    el('brg-clear').addEventListener('click', () => {
      layer.clearLayers();
      line = null;
      points.A = points.B = null;
      delete markers.A;
      delete markers.B;
      updateStatus('A');
      updateStatus('B');
      setError('');
      setPickSlot('A');
      redraw();
    });

    setPickSlot('A');

    return {
      activate() {
        active = true;
        layer.addTo(map);
        const here = deps.getLocatedPoint();
        if (!points.A && here) setPoint('A', here.lat, here.lon);
        updateHint();
      },
      deactivate() {
        active = false;
        map.removeLayer(layer);
      },
      handleMapClick(lat, lon) {
        setPoint(pickSlot, lat, lon);
      },
      // "Use my location" — always moves A.
      setHome(lat, lon) {
        setPoint('A', lat, lon);
        frame();
      },
      // Startup geolocation — only fills A if the user hasn't set one yet.
      offerHome(lat, lon) {
        if (!points.A) setPoint('A', lat, lon);
      },
    };
  }

  return { create, initialBearing, distanceKm, greatCircle };
})();
