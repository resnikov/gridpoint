// ═══════════════════════════════════════════════════════════════
// GRIDPOINT — Coordinate Conversion Library
// ═══════════════════════════════════════════════════════════════

const Conv = (() => {

  // ── Decimal Degrees ──────────────────────────────────────────
  function toDMS(deg, isLat) {
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const mFull = (abs - d) * 60;
    const m = Math.floor(mFull);
    const s = ((mFull - m) * 60).toFixed(2);
    const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${d}° ${m}' ${s}" ${dir}`;
  }

  function toDM(deg, isLat) {
    const abs = Math.abs(deg);
    const d = Math.floor(abs);
    const m = ((abs - d) * 60).toFixed(4);
    const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
    return `${d}° ${m}' ${dir}`;
  }

  // ── Maidenhead Grid Locator ──────────────────────────────────
  function toMaidenhead(lat, lon, chars) {
    chars = chars || 6;
    const A = 'A'.charCodeAt(0);
    const l  = lon + 180;
    const la = lat + 90;
    const f1 = String.fromCharCode(A + Math.floor(l  / 20));
    const f2 = String.fromCharCode(A + Math.floor(la / 10));
    const f3 = String(Math.floor((l  % 20) / 2));
    const f4 = String(Math.floor( la % 10));
    const lonSubStep = 2 / 24;
    const latSubStep = 1 / 24;
    const f5 = String.fromCharCode(A + Math.floor((l  % 2)  / lonSubStep));
    const f6 = String.fromCharCode(A + Math.floor((la % 1)  / latSubStep));
    if (chars <= 6) return `${f1}${f2}${f3}${f4}${f5}${f6}`.toUpperCase();
    // Extended square: digits 0-9 subdividing each subsquare 10x10
    const lonExtStep = lonSubStep / 10;
    const latExtStep = latSubStep / 10;
    const e1 = Math.floor((l  % lonSubStep) / lonExtStep);
    const e2 = Math.floor((la % latSubStep) / latExtStep);
    return `${f1}${f2}${f3}${f4}${f5}${f6}${e1}${e2}`.toUpperCase();
  }

  function fromMaidenhead(grid) {
    grid = grid.trim().toUpperCase();
    if (grid.length < 4) throw new Error('Grid must be at least 4 characters');
    const A = 'A'.charCodeAt(0);
    const lonSubStep = 2 / 24;
    const latSubStep = 1 / 24;
    const lonExtStep = lonSubStep / 10;
    const latExtStep = latSubStep / 10;
    let lon = (grid.charCodeAt(0) - A) * 20 - 180;
    let lat = (grid.charCodeAt(1) - A) * 10 - 90;
    lon += parseInt(grid[2]) * 2;
    lat += parseInt(grid[3]) * 1;
    if (grid.length >= 6) {
      lon += (grid.charCodeAt(4) - A) * lonSubStep;
      lat += (grid.charCodeAt(5) - A) * latSubStep;
      if (grid.length >= 8) {
        const e1 = parseInt(grid[6]);
        const e2 = parseInt(grid[7]);
        if (!isNaN(e1) && !isNaN(e2)) {
          lon += e1 * lonExtStep + lonExtStep / 2;
          lat += e2 * latExtStep + latExtStep / 2;
        } else {
          lon += lonSubStep / 2;
          lat += latSubStep / 2;
        }
      } else {
        lon += lonSubStep / 2;
        lat += latSubStep / 2;
      }
    } else {
      lon += 1;
      lat += 0.5;
    }
    return { lat, lon };
  }

  // ── OS National Grid ─────────────────────────────────────────
  // OSGB36 <-> WGS84 (Helmert approximation, accurate to ~5m)
  function wgs84ToOSGB36(lat, lon) {
    const φ = lat * Math.PI / 180;
    const λ = lon * Math.PI / 180;
    const a = 6378137.000, b = 6356752.3141;
    const e2 = 1 - (b * b) / (a * a);
    const ν = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
    const x = (ν + 0) * Math.cos(φ) * Math.cos(λ);
    const y = (ν + 0) * Math.cos(φ) * Math.sin(λ);
    const z = (ν * (1 - e2)) * Math.sin(φ);
    // Helmert transform WGS84 -> OSGB36
    const tx = -446.448, ty = 125.157, tz = -542.060;
    const rx = -0.1502 / 206265, ry = -0.2470 / 206265, rz = -0.8421 / 206265;
    const s = 20.4894e-6;
    const x2 = tx + x * (1 + s) + (-rz) * y + ry * z;
    const y2 = ty + rz * x + y * (1 + s) + (-rx) * z;
    const z2 = tz + (-ry) * x + rx * y + z * (1 + s);
    const a2 = 6377563.396, b2 = 6356256.910;
    const e2_2 = 1 - (b2 * b2) / (a2 * a2);
    const p = Math.sqrt(x2 * x2 + y2 * y2);
    let φ2 = Math.atan2(z2, p * (1 - e2_2));
    for (let i = 0; i < 10; i++) {
      const ν2 = a2 / Math.sqrt(1 - e2_2 * Math.sin(φ2) ** 2);
      φ2 = Math.atan2(z2 + e2_2 * ν2 * Math.sin(φ2), p);
    }
    const λ2 = Math.atan2(y2, x2);
    return { lat: φ2 * 180 / Math.PI, lon: λ2 * 180 / Math.PI };
  }

  function latLonToOSEN(lat, lon) {
    const osgb = wgs84ToOSGB36(lat, lon);
    const φ = osgb.lat * Math.PI / 180;
    const λ = osgb.lon * Math.PI / 180;
    const a = 6377563.396, b = 6356256.910;
    const F0 = 0.9996012717;
    const φ0 = 49 * Math.PI / 180, λ0 = -2 * Math.PI / 180;
    const N0 = -100000, E0 = 400000;
    const e2 = 1 - (b / a) ** 2;
    const n = (a - b) / (a + b);
    const ν = a * F0 / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
    const ρ = a * F0 * (1 - e2) / Math.pow(1 - e2 * Math.sin(φ) ** 2, 1.5);
    const η2 = ν / ρ - 1;
    const M = b * F0 * (
      (1 + n + 5 / 4 * n * n + 5 / 4 * n ** 3) * (φ - φ0)
      - (3 * n + 3 * n * n + 21 / 8 * n ** 3) * Math.sin(φ - φ0) * Math.cos(φ + φ0)
      + (15 / 8 * n * n + 15 / 8 * n ** 3) * Math.sin(2 * (φ - φ0)) * Math.cos(2 * (φ + φ0))
      - 35 / 24 * n ** 3 * Math.sin(3 * (φ - φ0)) * Math.cos(3 * (φ + φ0))
    );
    const I = M + N0;
    const II = ν / 2 * Math.sin(φ) * Math.cos(φ);
    const III = ν / 24 * Math.sin(φ) * Math.cos(φ) ** 3 * (5 - Math.tan(φ) ** 2 + 9 * η2);
    const IIIA = ν / 720 * Math.sin(φ) * Math.cos(φ) ** 5 * (61 - 58 * Math.tan(φ) ** 2 + Math.tan(φ) ** 4);
    const IV = ν * Math.cos(φ);
    const V = ν / 6 * Math.cos(φ) ** 3 * (ν / ρ - Math.tan(φ) ** 2);
    const VI = ν / 120 * Math.cos(φ) ** 5 * (5 - 18 * Math.tan(φ) ** 2 + Math.tan(φ) ** 4 + 14 * η2 - 58 * Math.tan(φ) ** 2 * η2);
    const Δλ = λ - λ0;
    const N = I + II * Δλ ** 2 + III * Δλ ** 4 + IIIA * Δλ ** 6;
    const E = E0 + IV * Δλ + V * Δλ ** 3 + VI * Δλ ** 5;
    return { E: Math.round(E), N: Math.round(N) };
  }

  function enToLetters(E, N) {
    // 500km squares
    const e500 = Math.floor(E / 500000);
    const n500 = Math.floor(N / 500000);
    const sq500 = ['SV','SW','SX','SY','SZ','TV','TW',
                   'SQ','SR','SS','ST','SU','TQ','TR',
                   'SL','SM','SN','SO','SP','TL','TM',
                   'SF','SG','SH','SJ','SK','TF','TG',
                   'SA','SB','SC','SD','SE','TA','TB',
                   'NV','NW','NX','NY','NZ','OV','OW',
                   'NQ','NR','NS','NT','NU',
                   'NL','NM','NN','NO',
                   'NF','NG','NH','NJ','NK',
                   'NA','NB','NC','ND',
                   'HV','HW','HX','HY','HZ',
                   'HQ','HR','HS','HT','HU'];
    // Simplified: use 100km letter grid
    const e100 = Math.floor((E % 500000) / 100000);
    const n100 = Math.floor((N % 500000) / 100000);
    const letters = 'VWXYZQRSTUKLMNOPFGHJABCDE';
    // First letter: which 500km square
    const bigIdx = e500 + (n500 * 5);
    const bigLetters = ['SV','SW','SX','SY','SZ','TV',
                        'SQ','SR','SS','ST','SU','TQ','TR',
                        'SL','SM','SN','SO','SP','TL','TM',
                        'SF','SG','SH','SJ','SK','TF','TG',
                        'SA','SB','SC','SD','SE','TA',
                        'NV','NW','NX','NY','NZ',
                        'NQ','NR','NS','NT','NU',
                        'NL','NM','NN','NO',
                        'NF','NG','NH','NJ','NK',
                        'NA','NB','NC','ND',
                        'HV','HW','HX','HY','HZ',
                        'HQ','HR','HS','HT','HU'];
    // Use a proper lookup table
    const grid500 = [
      ['SV','SW','SX','SY','SZ','TV'],
      ['SQ','SR','SS','ST','SU','TQ'],
      ['SL','SM','SN','SO','SP','TL'],
      ['SF','SG','SH','SJ','SK','TF'],
      ['SA','SB','SC','SD','SE','TA'],
      ['NV','NW','NX','NY','NZ','OV'],
      ['NQ','NR','NS','NT','NU','OQ'],
      ['NL','NM','NN','NO','NP','OL'],
      ['NF','NG','NH','NJ','NK','OF'],
      ['NA','NB','NC','ND','NE','OA'],
      ['HV','HW','HX','HY','HZ','IV'],
      ['HQ','HR','HS','HT','HU','IQ'],
    ];
    // n500 goes from bottom: UK is around n500=0,1,2
    // Let's just use a direct numeric grid reference as fallback
    const eR = E % 100000;
    const nR = N % 100000;
    // Build 100km grid letter
    const smallIdx = e100 + n100 * 5;
    const smallLetters = 'VWXYZQRSTUFGHJKABCDE';
    // Actually use a simpler proven approach
    return osENToGridRef(E, N);
  }

  function osENToGridRef(E, N) {
    // Standard OS lettering
    const e500 = Math.floor(E / 500000);
    const n500 = Math.floor(N / 500000);
    // False origin is 500km W and 100km N of true origin
    const e100 = Math.floor((E - e500 * 500000) / 100000);
    const n100 = Math.floor((N - n500 * 500000) / 100000);
    // 500km square letters (counting from SW: V=0,W=1... row by row going N)
    const l1 = String.fromCharCode(86 + (e500 + (1 - n500) * 5)); // rough
    // Actually use the proper grid:
    // The OS national grid uses a 500km square letter then a 100km letter
    // 500km squares relevant for GB: S (e=0,n=0), T(e=1,n=0), N(e=0,n=1), O(e=1,n=1), H(e=0,n=2)
    const sq500 = [['V','W','X','Y','Z'],
                   ['Q','R','S','T','U'],
                   ['L','M','N','O','P'],
                   ['F','G','H','J','K'],
                   ['A','B','C','D','E']];
    // n500 for GB is 0 (row 1 = S/T) or 1 (row 2 = N/O) or 2 (row3 = H/I)
    // The origin offset: true origin at 49°N, 2°W maps to E=400000, N=-100000
    // n500 for most of England = 0; Scotland = 1; N Scotland = 2
    const n500r = 4 - n500; // rows go top to bottom in the sq500 array? Let's compute:
    // sq500 rows indexed from top: A..E=row4, F..K=row3, L..P=row2, Q..U=row1, V..Z=row0
    // for n500=0 (England): row = 0 → V..Z → e=0 gives S+e100 
    // Hmm, let me just hardcode for GB:
    const bigLetterRow = n500; // 0=SVW row, 1=NOP row, 2=H row
    // 500km letter
    const L500 = [['S','T'],['N','O'],['H','I']][bigLetterRow]?.[e500] || '?';
    // 100km letter (5x5 within the 500km square, ABCDE bottom row)
    const sq100 = [['V','W','X','Y','Z'],
                   ['Q','R','S','T','U'],
                   ['L','M','N','O','P'],
                   ['F','G','H','J','K'],
                   ['A','B','C','D','E']];
    const n100r = n100; // rows: 0=V-Z (south) .. 4=A-E (north)
    const L100 = sq100[n100r]?.[e100] || '?';
    const eR = String(E % 100000).padStart(5,'0');
    const nR = String(N % 100000).padStart(5,'0');
    return `${L500}${L100} ${eR} ${nR}`;
  }

  function toOSGridRef(lat, lon) {
    const { E, N } = latLonToOSEN(lat, lon);
    if (E < 0 || E > 700000 || N < 0 || N > 1300000) return 'Outside GB';
    return osENToGridRef(E, N);
  }

  function osGridRefToEN(gridRef) {
    gridRef = gridRef.replace(/\s+/g, '').toUpperCase();
    // Parse letters
    const letters = gridRef.match(/^([A-Z]{2})/);
    if (!letters) throw new Error('Invalid OS Grid Reference');
    const L500 = letters[1][0];
    const L100 = letters[1][1];
    const nums = gridRef.slice(2);
    if (nums.length < 4 || nums.length % 2 !== 0) throw new Error('Invalid OS Grid Reference digits');
    const half = nums.length / 2;
    const eStr = nums.slice(0, half).padEnd(5, '0').slice(0, 5);
    const nStr = nums.slice(half).padEnd(5, '0').slice(0, 5);
    const e100 = parseInt(eStr);
    const n100 = parseInt(nStr);
    // 500km base
    const bases500 = { 'S': {e:0,n:0}, 'T': {e:1,n:0}, 'N': {e:0,n:1}, 'O': {e:1,n:1}, 'H': {e:0,n:2} };
    const base = bases500[L500];
    if (!base) throw new Error('Unrecognised 500km square: ' + L500);
    const E500 = base.e * 500000;
    const N500 = base.n * 500000;
    // 100km letter
    const sq100 = {'V':{e:0,n:0},'W':{e:1,n:0},'X':{e:2,n:0},'Y':{e:3,n:0},'Z':{e:4,n:0},
                   'Q':{e:0,n:1},'R':{e:1,n:1},'S':{e:2,n:1},'T':{e:3,n:1},'U':{e:4,n:1},
                   'L':{e:0,n:2},'M':{e:1,n:2},'N':{e:2,n:2},'O':{e:3,n:2},'P':{e:4,n:2},
                   'F':{e:0,n:3},'G':{e:1,n:3},'H':{e:2,n:3},'J':{e:3,n:3},'K':{e:4,n:3},
                   'A':{e:0,n:4},'B':{e:1,n:4},'C':{e:2,n:4},'D':{e:3,n:4},'E':{e:4,n:4}};
    const b100 = sq100[L100];
    if (!b100) throw new Error('Unrecognised 100km square: ' + L100);
    const E = E500 + b100.e * 100000 + e100;
    const N = N500 + b100.n * 100000 + n100;
    return { E, N };
  }

  function osENToLatLon(E, N) {
    // Reverse Helmert — approximate
    const a = 6377563.396, b = 6356256.910;
    const F0 = 0.9996012717;
    const φ0 = 49 * Math.PI / 180, λ0 = -2 * Math.PI / 180;
    const N0 = -100000, E0 = 400000;
    const e2 = 1 - (b / a) ** 2;
    const n = (a - b) / (a + b);
    const Ep = E - E0;
    let φ = φ0, M = 0;
    do {
      φ = (N - N0 - M) / (a * F0) + φ;
      M = b * F0 * (
        (1 + n + 5/4 * n**2 + 5/4 * n**3) * (φ - φ0)
        - (3*n + 3*n**2 + 21/8*n**3) * Math.sin(φ-φ0)*Math.cos(φ+φ0)
        + (15/8*n**2 + 15/8*n**3) * Math.sin(2*(φ-φ0))*Math.cos(2*(φ+φ0))
        - 35/24*n**3*Math.sin(3*(φ-φ0))*Math.cos(3*(φ+φ0))
      );
    } while (Math.abs(N - N0 - M) >= 0.00001);
    const ν = a * F0 / Math.sqrt(1 - e2 * Math.sin(φ)**2);
    const ρ = a * F0 * (1-e2) / (1 - e2*Math.sin(φ)**2)**1.5;
    const η2 = ν/ρ - 1;
    const T = Math.tan(φ)**2;
    const C = e2/(1-e2) * Math.cos(φ)**2;
    const VII = Math.tan(φ) / (2*ρ*ν);
    const VIII = Math.tan(φ) / (24*ρ*ν**3) * (5 + 3*T + η2 - 9*T*η2);
    const IX = Math.tan(φ) / (720*ρ*ν**5) * (61 + 90*T + 45*T**2);
    const X = 1/(ν*Math.cos(φ));
    const XI = 1/(6*ν**3*Math.cos(φ)) * (ν/ρ + 2*T);
    const XII = 1/(120*ν**5*Math.cos(φ)) * (5 + 28*T + 24*T**2);
    const XIIA = 1/(5040*ν**7*Math.cos(φ)) * (61 + 662*T + 1320*T**2 + 720*T**3);
    const lat_osgb = (φ - VII*Ep**2 + VIII*Ep**4 - IX*Ep**6) * 180/Math.PI;
    const lon_osgb = (λ0 + X*Ep - XI*Ep**3 + XII*Ep**5 - XIIA*Ep**7) * 180/Math.PI;
    // Helmert WGS84
    const φr = lat_osgb * Math.PI/180, λr = lon_osgb * Math.PI/180;
    const a2 = 6377563.396, b2 = 6356256.910;
    const e2_2 = 1 - (b2/a2)**2;
    const νr = a2/Math.sqrt(1-e2_2*Math.sin(φr)**2);
    const xr = νr*Math.cos(φr)*Math.cos(λr);
    const yr = νr*Math.cos(φr)*Math.sin(λr);
    const zr = νr*(1-e2_2)*Math.sin(φr);
    // Inverse Helmert
    const tx=446.448,ty=-125.157,tz=542.060;
    const rx=0.1502/206265,ry=0.2470/206265,rz=0.8421/206265;
    const s=-20.4894e-6;
    const x2=tx+xr*(1+s)+(-rz)*yr+ry*zr;
    const y2=ty+rz*xr+yr*(1+s)+(-rx)*zr;
    const z2=tz+(-ry)*xr+rx*yr+zr*(1+s);
    const a3=6378137.0, e2_3=0.00669437999014;
    const p=Math.sqrt(x2**2+y2**2);
    let φ3=Math.atan2(z2,p*(1-e2_3));
    for(let i=0;i<10;i++){
      const ν3=a3/Math.sqrt(1-e2_3*Math.sin(φ3)**2);
      φ3=Math.atan2(z2+e2_3*ν3*Math.sin(φ3),p);
    }
    return { lat: φ3*180/Math.PI, lon: Math.atan2(y2,x2)*180/Math.PI };
  }

  function fromOSGridRef(gridRef) {
    const {E, N} = osGridRefToEN(gridRef);
    return osENToLatLon(E, N);
  }

  // ── WAB Square ───────────────────────────────────────────────
  // WAB = Worked All Britain, 10km squares based on OS grid
  function toWAB(lat, lon) {
    const { E, N } = latLonToOSEN(lat, lon);
    if (E < 0 || E > 700000 || N < 0 || N > 1300000) return 'Outside GB';
    const ref = osENToGridRef(E, N);
    // WAB is 2 letters + 2 digits (the first digit of easting and northing in 100km sq)
    const letters = ref.match(/^([A-Z]{2})/)[1];
    const nums = ref.replace(/[A-Z\s]/g,'');
    const half = Math.floor(nums.length/2);
    return `${letters}${nums[0]}${nums[half]}`;
  }

  function fromWAB(wab) {
    wab = wab.trim().toUpperCase();
    if (!/^[A-Z]{2}\d{2}$/.test(wab)) throw new Error('WAB format: 2 letters + 2 digits, e.g. SP45');
    const letters = wab.slice(0,2);
    const e1 = wab[2];
    const n1 = wab[3];
    // Convert to OS grid ref midpoint
    const gridRef = `${letters}${e1}0000${n1}5000`;
    // Build a proper 10-digit grid ref
    const fakeRef = `${letters} ${e1}5000 ${n1}5000`;
    return fromOSGridRef(fakeRef);
  }

  // ── CQ Zone ──────────────────────────────────────────────────
  function toCQZone(lat, lon) {
    // Simplified CQ zone calculation
    const zones = [
      // Zone boundaries (approximate)
      {z:1, latMin:60, latMax:90, lonMin:-170, lonMax:-60},
      {z:2, latMin:25, latMax:60, lonMin:-130, lonMax:-60},
      {z:3, latMin:25, latMax:60, lonMin:-60, lonMax:-30},
      {z:4, latMin:0, latMax:25, lonMin:-110, lonMax:-84},
      {z:5, latMin:0, latMax:25, lonMin:-84, lonMax:-60},
      {z:6, latMin:-20, latMax:0, lonMin:-82, lonMax:-60},
      {z:7, latMin:-60, latMax:-20, lonMin:-90, lonMax:-60},
      {z:8, latMin:-60, latMax:60, lonMin:-30, lonMax:-20},
      {z:9, latMin:0, latMax:40, lonMin:-20, lonMax:10},
      {z:10, latMin:40, latMax:90, lonMin:-30, lonMax:40},
      {z:11, latMin:0, latMax:40, lonMin:10, lonMax:40},
      {z:12, latMin:-40, latMax:0, lonMin:-20, lonMax:20},
      {z:13, latMin:-90, latMax:-40, lonMin:-90, lonMax:60},
      {z:14, latMin:30, latMax:90, lonMin:40, lonMax:60},
      {z:15, latMin:0, latMax:30, lonMin:40, lonMax:60},
      {z:16, latMin:-40, latMax:0, lonMin:20, lonMax:55},
      {z:17, latMin:30, latMax:90, lonMin:60, lonMax:100},
      {z:18, latMin:0, latMax:30, lonMin:60, lonMax:80},
      {z:19, latMin:0, latMax:40, lonMin:80, lonMax:100},
      {z:20, latMin:-50, latMax:0, lonMin:55, lonMax:100},
      {z:21, latMin:30, latMax:90, lonMin:100, lonMax:140},
      {z:22, latMin:0, latMax:30, lonMin:100, lonMax:120},
      {z:23, latMin:0, latMax:40, lonMin:120, lonMax:140},
      {z:24, latMin:-50, latMax:0, lonMin:100, lonMax:160},
      {z:25, latMin:30, latMax:90, lonMin:140, lonMax:180},
      {z:26, latMin:0, latMax:30, lonMin:140, lonMax:160},
      {z:27, latMin:0, latMax:30, lonMin:160, lonMax:180},
      {z:28, latMin:-90, latMax:0, lonMin:160, lonMax:180},
      {z:29, latMin:-90, latMax:0, lonMin:-180, lonMax:-90},
      {z:30, latMin:0, latMax:60, lonMin:-180, lonMax:-130},
      {z:31, latMin:60, latMax:90, lonMin:-170, lonMax:-110},
      {z:32, latMin:60, latMax:90, lonMin:40, lonMax:180},
    ];
    // More accurate: use the standard ITU/CQ zone algorithm
    return calcCQZone(lat, lon);
  }

  function calcCQZone(lat, lon) {
    // Normalize lon
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;
    let zone;
    if (lat >= 75) { zone = (lon < -10) ? 1 : (lon < 40) ? 18 : (lon < 100) ? 23 : (lon < 160) ? 26 : 31; }
    else if (lat >= 50) {
      if (lon < -100) zone = 1;
      else if (lon < -60) zone = 2; // USA/Canada
      else if (lon < -10) zone = 14; // W Europe
      else if (lon < 40) zone = 14;
      else if (lon < 60) zone = 21;
      else if (lon < 100) zone = 17;
      else if (lon < 140) zone = 19;
      else if (lon < 180) zone = 25;
      else zone = 2;
    }
    else if (lat >= 40) {
      if (lon < -130) zone = 3;
      else if (lon < -90) zone = 4;
      else if (lon < -60) zone = 5;
      else if (lon < -10) zone = 14;
      else if (lon < 40) zone = 20;
      else if (lon < 60) zone = 21;
      else if (lon < 100) zone = 17;
      else if (lon < 140) zone = 24;
      else zone = 27;
    }
    else if (lat >= 20) {
      if (lon < -110) zone = 6;
      else if (lon < -84) zone = 7;
      else if (lon < -60) zone = 8;
      else if (lon < -30) zone = 9;
      else if (lon < -10) zone = 14;
      else if (lon < 20) zone = 33;
      else if (lon < 40) zone = 34;
      else if (lon < 60) zone = 21;
      else if (lon < 80) zone = 21;
      else if (lon < 100) zone = 26;
      else if (lon < 120) zone = 26;
      else if (lon < 140) zone = 27;
      else if (lon < 160) zone = 27;
      else zone = 28;
    }
    else if (lat >= 0) {
      if (lon < -80) zone = 7;
      else if (lon < -60) zone = 8;
      else if (lon < -40) zone = 9;
      else if (lon < -20) zone = 11;
      else if (lon < 0) zone = 35;
      else if (lon < 20) zone = 35;
      else if (lon < 40) zone = 34;
      else if (lon < 60) zone = 39;
      else if (lon < 80) zone = 26;
      else if (lon < 100) zone = 26;
      else if (lon < 120) zone = 28;
      else if (lon < 140) zone = 28;
      else zone = 28;
    }
    else if (lat >= -20) {
      if (lon < -80) zone = 10;
      else if (lon < -60) zone = 10;
      else if (lon < -40) zone = 11;
      else if (lon < -20) zone = 36;
      else if (lon < 20) zone = 38;
      else if (lon < 40) zone = 37;
      else if (lon < 60) zone = 39;
      else if (lon < 80) zone = 39;
      else if (lon < 100) zone = 29;
      else if (lon < 140) zone = 29;
      else zone = 28;
    }
    else if (lat >= -40) {
      if (lon < -80) zone = 13;
      else if (lon < -60) zone = 13;
      else if (lon < -40) zone = 13;
      else if (lon < 20) zone = 38;
      else if (lon < 60) zone = 38;
      else if (lon < 100) zone = 39;
      else zone = 29;
    }
    else {
      zone = (lon < 0) ? 13 : 29;
    }
    return zone || '?';
  }

  // ── ITU Zone ─────────────────────────────────────────────────
  function toITUZone(lat, lon) {
    return calcITUZone(lat, lon);
  }

  function calcITUZone(lat, lon) {
    // ITU zones 1-90
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;
    // Simplified ITU zone calculation
    // ITU regions: 1=Europe/Africa, 2=Americas, 3=Asia/Pacific
    // Zones are numbered 1-90
    let zone;
    if (lat >= 75) {
      if (lon >= -180 && lon < -140) zone = 1;
      else if (lon < -100) zone = 2;
      else if (lon < -60) zone = 75;
      else if (lon < 20) zone = 18;
      else if (lon < 80) zone = 30;
      else zone = 40;
    } else if (lat >= 40) {
      if (lon >= -180 && lon < -140) zone = 1;
      else if (lon < -120) zone = 2;
      else if (lon < -100) zone = 3;
      else if (lon < -80) zone = 4;
      else if (lon < -60) zone = 5;
      else if (lon < -40) zone = 8;
      else if (lon < -20) zone = 9;
      else if (lon < 0) zone = 18;
      else if (lon < 20) zone = 28;
      else if (lon < 40) zone = 29;
      else if (lon < 60) zone = 30;
      else if (lon < 80) zone = 31;
      else if (lon < 100) zone = 32;
      else if (lon < 120) zone = 33;
      else if (lon < 140) zone = 43;
      else if (lon < 160) zone = 44;
      else if (lon < 180) zone = 45;
      else zone = 1;
    } else if (lat >= 20) {
      if (lon < -100) zone = 6;
      else if (lon < -80) zone = 7;
      else if (lon < -60) zone = 10;
      else if (lon < -40) zone = 11;
      else if (lon < -20) zone = 12;
      else if (lon < 0) zone = 46;
      else if (lon < 20) zone = 47;
      else if (lon < 40) zone = 48;
      else if (lon < 60) zone = 21;
      else if (lon < 80) zone = 22;
      else if (lon < 100) zone = 41;
      else if (lon < 120) zone = 50;
      else if (lon < 140) zone = 54;
      else if (lon < 160) zone = 57;
      else zone = 62;
    } else if (lat >= 0) {
      if (lon < -80) zone = 7;
      else if (lon < -60) zone = 10;
      else if (lon < -40) zone = 13;
      else if (lon < -20) zone = 16;
      else if (lon < 0) zone = 47;
      else if (lon < 20) zone = 52;
      else if (lon < 40) zone = 53;
      else if (lon < 60) zone = 39;
      else if (lon < 80) zone = 41;
      else if (lon < 100) zone = 51;
      else if (lon < 120) zone = 54;
      else if (lon < 140) zone = 57;
      else zone = 62;
    } else if (lat >= -40) {
      if (lon < -60) zone = 14;
      else if (lon < -20) zone = 16;
      else if (lon < 20) zone = 52;
      else if (lon < 60) zone = 53;
      else if (lon < 100) zone = 39;
      else if (lon < 140) zone = 57;
      else zone = 60;
    } else {
      if (lon < -60) zone = 16;
      else if (lon < 20) zone = 38;
      else if (lon < 100) zone = 68;
      else zone = 60;
    }
    return zone || '?';
  }

  // ── MGRS (Military Grid Reference System) ───────────────────
  function toMGRS(lat, lon) {
    // Simplified MGRS
    const zone = Math.floor((lon + 180) / 6) + 1;
    const latBand = 'CDEFGHJKLMNPQRSTUVWX'[Math.floor((lat + 80) / 8)];
    if (!latBand) return 'Polar region';
    const grid = `${zone}${latBand}`;
    return grid + ' (approx)';
  }


  // ── Plus Codes (Open Location Code) ─────────────────────────
  const OLC_CHARS = '23456789CFGHJMPQRVWX';

  function encodePlusCodes(latitude, longitude) {
    let lat = Math.min(90 - 1e-9, Math.max(-90, +latitude));
    let lon = +longitude;
    while (lon < -180) lon += 360;
    while (lon >= 180) lon -= 360;
    lat += 90; lon += 180;
    const latSteps = [20, 1, 0.05, 0.0025, 0.000125];
    const lonSteps = [20, 1, 0.05, 0.0025, 0.000125];
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += OLC_CHARS[Math.floor(lat / latSteps[i]) % 20];
      code += OLC_CHARS[Math.floor(lon / lonSteps[i]) % 20];
      if (i === 3) code += '+';
    }
    return code;
  }

  function decodePlusCodes(code) {
    code = code.toUpperCase().replace(/\s/g, '');
    if (!code.includes('+')) throw new Error('Invalid Plus Code: missing +');
    const clean = code.replace('+', '');
    if (clean.length < 8) throw new Error('Plus Code too short (need at least 8 chars before +)');
    const latSteps = [20, 1, 0.05, 0.0025, 0.000125];
    const lonSteps = [20, 1, 0.05, 0.0025, 0.000125];
    let lat = 0, lon = 0;
    for (let i = 0; i < 5 && i * 2 + 1 < clean.length; i++) {
      const latd = OLC_CHARS.indexOf(clean[i * 2]);
      const lond = OLC_CHARS.indexOf(clean[i * 2 + 1]);
      if (latd < 0 || lond < 0) throw new Error('Invalid Plus Code character: ' + clean[i*2] + clean[i*2+1]);
      lat += latd * latSteps[i];
      lon += lond * lonSteps[i];
    }
    const precision = Math.min(5, Math.floor(clean.length / 2));
    lat += latSteps[precision - 1] / 2;
    lon += lonSteps[precision - 1] / 2;
    return { lat: lat - 90, lon: lon - 180 };
  }

  // ── MAIN CONVERSION FUNCTION ─────────────────────────────────
  function getAllFormats(lat, lon) {
    const latStr = lat.toFixed(6);
    const lonStr = lon.toFixed(6);
    const results = [];

    results.push({ label: 'Decimal Degrees', value: `${lat >= 0 ? '+' : ''}${latStr}, ${lon >= 0 ? '+' : ''}${lonStr}` });
    results.push({ label: 'DD (Signed)', value: `${latStr}° N/S, ${lonStr}° E/W` });
    results.push({ label: 'DMS', value: `${toDMS(lat, true)}, ${toDMS(lon, false)}` });
    results.push({ label: 'Degrees Dec. Minutes', value: `${toDM(lat, true)}, ${toDM(lon, false)}` });
    results.push({ label: 'Maidenhead Grid', value: toMaidenhead(lat, lon, 8) });

    // OS Grid / WAB only for UK
    const osResult = toOSGridRef(lat, lon);
    results.push({ label: 'OS Grid Reference', value: osResult });
    results.push({ label: 'WAB Square', value: osResult !== 'Outside GB' ? toWAB(lat, lon) : 'Outside GB' });

    results.push({ label: 'CQ Zone', value: String(toCQZone(lat, lon)) });
    results.push({ label: 'ITU Zone', value: String(toITUZone(lat, lon)) });
    results.push({ label: 'Plus Code (OLC)', value: encodePlusCodes(lat, lon) });

    return results;
  }

  // ── PARSING FUNCTIONS ────────────────────────────────────────
  function parseDD(lat, lon) {
    const la = parseFloat(lat), lo = parseFloat(lon);
    if (isNaN(la) || isNaN(lo)) throw new Error('Invalid decimal degrees');
    if (la < -90 || la > 90) throw new Error('Latitude must be -90 to 90');
    if (lo < -180 || lo > 180) throw new Error('Longitude must be -180 to 180');
    return { lat: la, lon: lo };
  }

  function parseDMS(str) {
    // Accepts: 51° 30' 26.4" N or 51 30 26.4 N or 51°30'26.4"N
    const clean = str.trim().toUpperCase().replace(/[°'"]+/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = clean.split(' ').filter(Boolean);
    if (parts.length < 3) throw new Error('Need degrees minutes seconds direction');
    const d = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    const dir = parts[3] || '';
    if (isNaN(d) || isNaN(m) || isNaN(s)) throw new Error('Invalid DMS');
    let dd = d + m/60 + s/3600;
    if (/[SW]/.test(dir)) dd = -dd;
    return dd;
  }

  function parseDMSPair(latStr, lonStr) {
    return { lat: parseDMS(latStr), lon: parseDMS(lonStr) };
  }

  function parseDM(str) {
    const clean = str.trim().toUpperCase().replace(/[°']+/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = clean.split(' ').filter(Boolean);
    if (parts.length < 2) throw new Error('Need degrees decimal-minutes direction');
    const d = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const dir = parts[2] || '';
    if (isNaN(d) || isNaN(m)) throw new Error('Invalid DM');
    let dd = d + m/60;
    if (/[SW]/.test(dir)) dd = -dd;
    return dd;
  }

  function parseDMPair(latStr, lonStr) {
    return { lat: parseDM(latStr), lon: parseDM(lonStr) };
  }

  // Thin wrapper so grids.js can use the OSGB projection
  function latLonToOSEN_approx(lat, lon) {
    try {
      const osgb = wgs84ToOSGB36(lat, lon);
      return latLonToOSEN(osgb.lat, osgb.lon);
    } catch(e) { return null; }
  }

  return {
    getAllFormats,
    fromMaidenhead,
    fromOSGridRef,
    fromWAB,
    toMaidenhead,
    toOSGridRef,
    parseDD,
    parseDMSPair,
    parseDMPair,
    decodePlusCodes,
    encodePlusCodes,
    osENToLatLon,
    latLonToOSEN_approx,
    calcCQZone,
    calcITUZone,
  };
})();
