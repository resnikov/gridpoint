// ═══════════════════════════════════════════════════════════════
// GRIDPOINT — Map Grid Overlays
// ═══════════════════════════════════════════════════════════════

const GridOverlays = (() => {

  // ── Helpers ───────────────────────────────────────────────
  function makeLabelIcon(text, cls) {
    return L.divIcon({
      className: '',
      html: `<div class="grid-label ${cls}">${text}</div>`,
      iconSize:   [0, 0],
      iconAnchor: [0, 0],
    });
  }

  function snapDown(v, step) {
    return Math.floor(v / step) * step;
  }

  const A = 'A'.charCodeAt(0);

  // ── Base class ────────────────────────────────────────────
  class GridLayer {
    constructor(map, cssClass) {
      this._map     = map;
      this._css     = cssClass;
      this._active  = false;
      this._polys   = [];
      this._markers = [];
      this._pending = false;
      this._onMove  = () => {
        if (this._pending) return;
        this._pending = true;
        setTimeout(() => { this._pending = false; if (this._active) this._render(); }, 80);
      };
    }

    enable()  {
      if (this._active) return;
      this._active = true;
      this._map.on('moveend zoomend', this._onMove);
      this._render();
    }

    disable() {
      if (!this._active) return;
      this._active = false;
      this._map.off('moveend zoomend', this._onMove);
      this._clear();
    }

    toggle(on) { on ? this.enable() : this.disable(); }

    _clear() {
      this._polys.forEach(p => this._map.removeLayer(p));
      this._markers.forEach(m => this._map.removeLayer(m));
      this._polys = []; this._markers = [];
    }

    // Draw a labelled cell using explicit lat/lon polygon (not rectangle)
    // corners: [sw, se, ne, nw] each {lat, lon}
    _addPoly(sw, se, ne, nw, label, color) {
      const poly = L.polygon([
        [sw.lat, sw.lon], [se.lat, se.lon],
        [ne.lat, ne.lon], [nw.lat, nw.lon],
      ], {
        color, weight: 1, opacity: 0.7,
        fill: true, fillColor: color, fillOpacity: 0.04,
        interactive: false,
      }).addTo(this._map);
      this._polys.push(poly);

      if (label) {
        const midLat = (sw.lat + se.lat + ne.lat + nw.lat) / 4;
        const midLon = (sw.lon + se.lon + ne.lon + nw.lon) / 4;
        const mk = L.marker([midLat, midLon], {
          icon: makeLabelIcon(label, this._css),
          interactive: false,
          zIndexOffset: -500,
        }).addTo(this._map);
        this._markers.push(mk);
      }
    }

    // Simpler axis-aligned rect for grids that ARE lat/lon aligned
    _addRect(s, w, n, e, label, color) {
      const rect = L.rectangle([[s, w], [n, e]], {
        color, weight: 1, opacity: 0.7,
        fill: true, fillColor: color, fillOpacity: 0.04,
        interactive: false,
      }).addTo(this._map);
      this._polys.push(rect);

      if (label) {
        const mk = L.marker([(s + n) / 2, (w + e) / 2], {
          icon: makeLabelIcon(label, this._css),
          interactive: false,
          zIndexOffset: -500,
        }).addTo(this._map);
        this._markers.push(mk);
      }
    }

    _bounds() {
      const b = this._map.getBounds();
      return {
        s: Math.max(-85,  b.getSouth()),
        n: Math.min( 85,  b.getNorth()),
        w: Math.max(-180, b.getWest()),
        e: Math.min( 180, b.getEast()),
      };
    }

    _zoom() { return this._map.getZoom(); }
    _render() {}
  }


  // ══════════════════════════════════════════════════════════
  // LAT/LON GRATICULE
  // ══════════════════════════════════════════════════════════
  class LatLonGrid extends GridLayer {
    constructor(map) { super(map, 'gl-latlon'); }

    _render() {
      this._clear();
      const z = this._zoom(), b = this._bounds();
      const step = z < 4  ? 30 : z < 6  ? 10 : z < 8  ? 5
                 : z < 10 ? 2  : z < 12 ? 1  : z < 14 ? 0.5
                 : z < 16 ? 0.25 : 0.1;

      const lonMin = snapDown(b.w, step);
      const latMin = snapDown(b.s, step);

      for (let lo = lonMin; lo <= b.e + step * 0.01; lo = +(lo + step).toFixed(10)) {
        if (lo < -180 || lo > 180) continue;
        const line = L.polyline([[-85, lo], [85, lo]], {
          color: '#60a5fa', weight: 0.7, opacity: 0.55, interactive: false,
        }).addTo(this._map);
        this._polys.push(line);
        const midLat = Math.max(b.s + 0.01, Math.min(b.n - 0.01, (b.s + b.n) / 2));
        const loR = +lo.toFixed(8);
        const abs = Math.abs(loR), dir = loR >= 0 ? 'E' : 'W';
        const txt = Number.isInteger(loR) ? `${abs}°${dir}` : `${abs}°${dir}`;
        const mk = L.marker([midLat, lo], {
          icon: makeLabelIcon(txt, this._css), interactive: false, zIndexOffset: -500,
        }).addTo(this._map);
        this._markers.push(mk);
      }

      for (let la = latMin; la <= b.n + step * 0.01; la = +(la + step).toFixed(10)) {
        if (la < -85 || la > 85) continue;
        const line = L.polyline([[la, -180], [la, 180]], {
          color: '#60a5fa', weight: 0.7, opacity: 0.55, interactive: false,
        }).addTo(this._map);
        this._polys.push(line);
        const midLon = (b.w + b.e) / 2;
        const laR = +la.toFixed(8);
        const abs = Math.abs(laR), dir = laR >= 0 ? 'N' : 'S';
        const txt = Number.isInteger(laR) ? `${abs}°${dir}` : `${abs}°${dir}`;
        const mk = L.marker([la, midLon], {
          icon: makeLabelIcon(txt, this._css), interactive: false, zIndexOffset: -500,
        }).addTo(this._map);
        this._markers.push(mk);
      }
    }
  }


  // ══════════════════════════════════════════════════════════
  // MAIDENHEAD GRID  (2 / 4 / 6 / 8 chars)
  // ══════════════════════════════════════════════════════════
  class MaidenheadGrid extends GridLayer {
    constructor(map) { super(map, 'gl-maidenhead'); }

    // Compute the Maidenhead reference for a lat/lon point
    _ref(lat, lon, chars) {
      const l = lon + 180, la = lat + 90;
      const f1 = String.fromCharCode(A + Math.floor(l  / 20));
      const f2 = String.fromCharCode(A + Math.floor(la / 10));
      const f3 = Math.floor((l  % 20) / 2);
      const f4 = Math.floor( la % 10);
      if (chars === 2) return `${f1}${f2}`;
      if (chars === 4) return `${f1}${f2}${f3}${f4}`;
      const lonSub = 2 / 24, latSub = 1 / 24;
      const f5 = String.fromCharCode(A + Math.floor((l  % 2)  / lonSub));
      const f6 = String.fromCharCode(A + Math.floor((la % 1)  / latSub));
      if (chars === 6) return `${f1}${f2}${f3}${f4}${f5}${f6}`;
      const lonExt = lonSub / 10, latExt = latSub / 10;
      const e1 = Math.floor((l  % lonSub) / lonExt);
      const e2 = Math.floor((la % latSub) / latExt);
      return `${f1}${f2}${f3}${f4}${f5}${f6}${e1}${e2}`;
    }

    _drawGrid(lonStep, latStep, chars, color) {
      const b = this._bounds();
      const lonMin = snapDown(b.w, lonStep);
      const latMin = snapDown(b.s, latStep);
      const cols = Math.ceil((b.e - lonMin) / lonStep);
      const rows = Math.ceil((b.n - latMin) / latStep);
      if (cols * rows > 800) return;

      for (let la = latMin; la < b.n; la += latStep) {
        for (let lo = lonMin; lo < b.e; lo += lonStep) {
          const cLat = la + latStep / 2;
          const cLon = lo + lonStep / 2;
          const label = this._ref(cLat, cLon, chars).toUpperCase();
          // Maidenhead is lat/lon aligned so _addRect is correct
          this._addRect(la, lo, la + latStep, lo + lonStep, label, color);
        }
      }
    }

    _render() {
      this._clear();
      const z = this._zoom();
      if      (z < 5)  this._drawGrid(20,       10,      2, '#00e5c0');
      else if (z < 10) this._drawGrid(2,         1,       4, '#00e5c0');
      else if (z < 13) this._drawGrid(2/24,      1/24,    6, '#00e5c0');
      else             this._drawGrid(2/24/10,   1/24/10, 8, '#00e5c0');
    }
  }


  // ══════════════════════════════════════════════════════════
  // OS GRID — uses L.polygon with 4 individually projected corners
  // ══════════════════════════════════════════════════════════
  class OSGrid extends GridLayer {
    constructor(map) { super(map, 'gl-osgrid'); }

    _enToLabel(E, N, digits) {
      const sq100 = [['V','W','X','Y','Z'],['Q','R','S','T','U'],
                     ['L','M','N','O','P'],['F','G','H','J','K'],['A','B','C','D','E']];
      const L500t = [['S','T'],['N','O'],['H','I']];
      const e500 = Math.floor(E / 500000), n500 = Math.floor(N / 500000);
      const e100 = Math.floor((E % 500000) / 100000);
      const n100 = Math.floor((N % 500000) / 100000);
      const L500 = L500t[n500]?.[e500] || '?';
      const L100 = sq100[n100]?.[e100] || '?';
      if (digits === 0) return `${L500}${L100}`;
      const d = digits;
      const div = Math.pow(10, 5 - d);
      const eD = String(Math.floor((E % 100000) / div)).padStart(d, '0');
      const nD = String(Math.floor((N % 100000) / div)).padStart(d, '0');
      return `${L500}${L100} ${eD} ${nD}`;
    }

    _drawEN(eMin, nMin, eMax, nMax, step, digits, color) {
      const cols = Math.ceil((eMax - eMin) / step);
      const rows = Math.ceil((nMax - nMin) / step);
      if (cols * rows > 500) return;

      for (let E = eMin; E < eMax; E += step) {
        for (let N = nMin; N < nMax; N += step) {
          if (E < 0 || E >= 700000 || N < 0 || N >= 1300000) continue;
          // Convert all 4 corners individually for accurate polygon
          const sw = Conv.osENToLatLon(E,        N);
          const se = Conv.osENToLatLon(E + step, N);
          const ne = Conv.osENToLatLon(E + step, N + step);
          const nw = Conv.osENToLatLon(E,        N + step);
          if (!sw || !se || !ne || !nw) continue;
          const label = this._enToLabel(E + step / 2, N + step / 2, digits);
          this._addPoly(sw, se, ne, nw, label, color);
        }
      }
    }

    _render() {
      this._clear();
      const z  = this._zoom();
      const b  = this._bounds();
      const sw = Conv.latLonToOSEN_approx(b.s, b.w) || { E: 0,      N: 0 };
      const ne = Conv.latLonToOSEN_approx(b.n, b.e) || { E: 700000, N: 1300000 };

      if (z < 8) {
        const step = 100000;
        this._drawEN(
          Math.max(0,       snapDown(sw.E, step) - step),
          Math.max(0,       snapDown(sw.N, step) - step),
          Math.min(700000,  ne.E + step),
          Math.min(1300000, ne.N + step),
          step, 0, '#ff6b35');
      } else if (z < 13) {
        const step = 10000;
        this._drawEN(
          Math.max(0,       snapDown(sw.E, step) - step),
          Math.max(0,       snapDown(sw.N, step) - step),
          Math.min(700000,  ne.E + step),
          Math.min(1300000, ne.N + step),
          step, 1, '#ff6b35');
      } else {
        const step = 1000;
        this._drawEN(
          Math.max(0,       snapDown(sw.E, step) - step),
          Math.max(0,       snapDown(sw.N, step) - step),
          Math.min(700000,  ne.E + step),
          Math.min(1300000, ne.N + step),
          step, 2, '#ff6b35');
      }
    }
  }


  // ══════════════════════════════════════════════════════════
  // WAB SQUARES — same projection fix as OS Grid
  // ══════════════════════════════════════════════════════════
  class WABGrid extends GridLayer {
    constructor(map) { super(map, 'gl-wab'); }

    _wabLabel(E, N, step) {
      const sq100 = [['V','W','X','Y','Z'],['Q','R','S','T','U'],
                     ['L','M','N','O','P'],['F','G','H','J','K'],['A','B','C','D','E']];
      const L500t = [['S','T'],['N','O'],['H','I']];
      const e500 = Math.floor(E / 500000), n500 = Math.floor(N / 500000);
      const e100 = Math.floor((E % 500000) / 100000);
      const n100 = Math.floor((N % 500000) / 100000);
      const L500 = L500t[n500]?.[e500] || '?';
      const L100 = sq100[n100]?.[e100] || '?';
      if (step >= 100000) return `${L500}${L100}`;
      const e10 = Math.floor((E % 100000) / 10000);
      const n10 = Math.floor((N % 100000) / 10000);
      return `${L500}${L100}${e10}${n10}`;
    }

    _render() {
      this._clear();
      const z   = this._zoom();
      const b   = this._bounds();
      const sw  = Conv.latLonToOSEN_approx(b.s, b.w) || { E: 0,      N: 0 };
      const ne  = Conv.latLonToOSEN_approx(b.n, b.e) || { E: 700000, N: 1300000 };
      const step = z < 8 ? 100000 : 10000;
      const eMin = Math.max(0,       snapDown(sw.E, step) - step);
      const nMin = Math.max(0,       snapDown(sw.N, step) - step);
      const eMax = Math.min(700000,  ne.E + step);
      const nMax = Math.min(1300000, ne.N + step);
      const cols = Math.ceil((eMax - eMin) / step);
      const rows = Math.ceil((nMax - nMin) / step);
      if (cols * rows > 500) return;

      for (let E = eMin; E < eMax; E += step) {
        for (let N = nMin; N < nMax; N += step) {
          if (E < 0 || E >= 700000 || N < 0 || N >= 1300000) continue;
          const sw2 = Conv.osENToLatLon(E,        N);
          const se  = Conv.osENToLatLon(E + step, N);
          const ne2 = Conv.osENToLatLon(E + step, N + step);
          const nw  = Conv.osENToLatLon(E,        N + step);
          if (!sw2 || !se || !ne2 || !nw) continue;
          const label = this._wabLabel(E + step / 2, N + step / 2, step);
          this._addPoly(sw2, se, ne2, nw, label, '#f5c518');
        }
      }
    }
  }


  // ══════════════════════════════════════════════════════════
  // PLUS CODES — fixed zoom thresholds to avoid empty high zoom
  // ══════════════════════════════════════════════════════════
  class PlusCodeGrid extends GridLayer {
    constructor(map) { super(map, 'gl-pluscode'); }

    _render() {
      this._clear();
      const z = this._zoom(), b = this._bounds();

      // Thresholds chosen so cell count stays < 600 at each zoom
      let lonStep, latStep, digits;
      if      (z < 6)  { lonStep = 20;       latStep = 20;        digits = 2; }
      else if (z < 9)  { lonStep = 1;         latStep = 1;         digits = 4; }
      else if (z < 15) { lonStep = 0.05;      latStep = 0.025;     digits = 6; }
      else             { lonStep = 0.0025;     latStep = 0.00125;   digits = 8; }

      const lonMin = snapDown(b.w, lonStep);
      const latMin = snapDown(b.s, latStep);
      const cols   = Math.ceil((b.e - lonMin) / lonStep);
      const rows   = Math.ceil((b.n - latMin) / latStep);
      if (cols * rows > 800) return;

      for (let la = latMin; la < b.n; la += latStep) {
        for (let lo = lonMin; lo < b.e; lo += lonStep) {
          const cLat = la + latStep / 2, cLon = lo + lonStep / 2;
          const full  = Conv.encodePlusCodes(cLat, cLon);
          const clean = full.replace('+', '');
          let label;
          if      (digits <= 2) label = clean.slice(0, 2) + '000+';
          else if (digits <= 4) label = clean.slice(0, 4) + '+';
          else if (digits <= 6) label = clean.slice(0, 4) + '+' + clean.slice(4, 6);
          else                  label = clean.slice(0, 4) + '+' + clean.slice(4, 8);
          this._addRect(la, lo, la + latStep, lo + lonStep, label, '#a78bfa');
        }
      }
    }
  }


  // ══════════════════════════════════════════════════════════
  // CQ ZONES
  // ══════════════════════════════════════════════════════════
  class CQZoneGrid extends GridLayer {
    constructor(map) { super(map, 'gl-cqzone'); }
    _render() {
      this._clear();
      const b = this._bounds(), step = 10;
      for (let la = snapDown(b.s, step); la < b.n; la += step)
        for (let lo = snapDown(b.w, step); lo < b.e; lo += step)
          this._addRect(la, lo, la + step, lo + step,
            `CQ ${Conv.calcCQZone(la + step/2, lo + step/2)}`, '#34d399');
    }
  }


  // ══════════════════════════════════════════════════════════
  // ITU ZONES
  // ══════════════════════════════════════════════════════════
  class ITUZoneGrid extends GridLayer {
    constructor(map) { super(map, 'gl-ituzone'); }
    _render() {
      this._clear();
      const b = this._bounds(), step = 10;
      for (let la = snapDown(b.s, step); la < b.n; la += step)
        for (let lo = snapDown(b.w, step); lo < b.e; lo += step)
          this._addRect(la, lo, la + step, lo + step,
            `ITU ${Conv.calcITUZone(la + step/2, lo + step/2)}`, '#f472b6');
    }
  }


  // ── Factory ───────────────────────────────────────────────
  function create(map) {
    return {
      latlon:     new LatLonGrid(map),
      maidenhead: new MaidenheadGrid(map),
      osgrid:     new OSGrid(map),
      wab:        new WABGrid(map),
      pluscode:   new PlusCodeGrid(map),
      cqzone:     new CQZoneGrid(map),
      ituzone:    new ITUZoneGrid(map),
    };
  }

  return { create };
})();
