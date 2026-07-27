// First Light — lib/fl-forecast.mjs
// =============================================================================
// Pure deer-forecast maths for the Stands feature (STANDS-PLAN.md /
// STANDS-CODE-MAP.md §9). This file is the TESTED SPEC
// (tests/fl-forecast.test.mjs); several blocks exist twice by design and
// must stay byte-identical with their SPEC pair until the app.js copies are
// retired:
//
//   • ukCalendarYmdLondon  — SPEC pair: app.js (classic script, cannot import)
//   • calcSunTime          — SPEC pair: app.js
//   • ukHourMin, toMinutes — SPEC pair: app.js
//   • fmtMins              — SPEC pair: app.js
//   • getMoonPhase         — SPEC pair: app.js
//   • RUT_SPECIES/RUT_CALENDAR — SPEC pair: app.js
//   • windDirLabel8        — SPEC pair: modules/weather.mjs windDirLabel
//     (lib must not import from modules/ — weather.mjs pulls in svg-icons)
//
// scoreStandDay is a DOCUMENTED PARAMETERISED DIVERGENCE from app.js
// scoreDay: identical constants and factor maths, but lat/lng/date passed in
// (no bannerState) and a per-window wind-direction penalty applied — the
// homepage banner's behaviour is deliberately frozen (owner-confirmed
// 2026-07-07: wind direction must NOT affect index.html forecasts).
//
// Purity contract (lib/ rule): no DOM, no window, no network, no new Date()
// without input. getMoonPhase's `new Date(Date.UTC(2000, 0, 6, 18, 14, 0))` is a
// fixed anchor constant, not "now" (verbatim from the app.js spec pair). It uses
// Date.UTC so the anchor — and therefore the phase — is device-timezone
// independent (a plain new Date(2000,0,6,…) shifted the moon age by the device
// UTC offset).
// =============================================================================

// ── London calendar helpers (SPEC pairs: app.js) ───────────────────────────

// Cached Intl formatters (2026-07-17 perf round — "the stands tab takes time
// to load"): constructing Intl.DateTimeFormat is ~70× the cost of calling
// formatToParts on a cached instance (measured: 200 construct+format = 43 ms
// vs 0.6 ms cached, desktop — phones are several times worse), and these two
// helpers sit under calcSunTime/toMinutes, which run hundreds of times per
// stands render. Formatter instances are immutable and safe to reuse.
var _ukYmdFmt = null;
var _ukHmFmt = null;

/** Calendar Y/M/D (month 1–12) for an instant in Europe/London — single source for “which day” solar + legal calcs use. */
export function ukCalendarYmdLondon(date) {
  if (!_ukYmdFmt) {
    _ukYmdFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  }
  var parts = _ukYmdFmt.formatToParts(date);
  var y, m, d;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].type === 'year') y = parseInt(parts[i].value, 10);
    else if (parts[i].type === 'month') m = parseInt(parts[i].value, 10);
    else if (parts[i].type === 'day') d = parseInt(parts[i].value, 10);
  }
  return { y: y, m: m, d: d };
}

// Always extract hours/minutes in Europe/London time, regardless of device timezone
// This ensures all sunrise/sunset/legal times display correctly for users outside the UK
export function ukHourMin(dateObj) {
  if (!_ukHmFmt) {
    _ukHmFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  }
  var parts = _ukHmFmt.formatToParts(dateObj);
  return {
    h: parseInt(parts.find(function(p) { return p.type === 'hour';   }).value, 10),
    m: parseInt(parts.find(function(p) { return p.type === 'minute'; }).value, 10)
  };
}

export function toMinutes(dateObj) {
  var hm = ukHourMin(dateObj);
  return hm.h * 60 + hm.m;
}

export function fmtMins(m) {
  if (m === null || m === undefined) return '--:--';
  var mm = ((Math.round(m) % 1440) + 1440) % 1440;
  var h = Math.floor(mm / 60), mn = mm % 60;
  return (h < 10 ? '0' : '') + h + ':' + (mn < 10 ? '0' : '') + mn;
}

// ── Solar (SPEC pair: app.js calcSunTime) ──────────────────────────────────

export function calcSunTime(date, lat, lng, isSunrise) {
  var ymd = ukCalendarYmdLondon(date);
  var y = ymd.y, mo = ymd.m, d = ymd.d;
  if (y == null || mo == null || d == null || isNaN(y)) return null;

  var rad = Math.PI / 180;
  var lngHour = lng / 15;
  var jan1 = Date.UTC(y, 0, 1);
  var cur = Date.UTC(y, mo - 1, d);
  var dayOfYear = Math.round((cur - jan1) / 86400000) + 1;

  var t = isSunrise ? dayOfYear + (6  - lngHour) / 24
                    : dayOfYear + (18 - lngHour) / 24;
  var M = (0.9856 * t) - 3.289;
  var L = M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 282.634;
  L = ((L % 360) + 360) % 360;
  var RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
  RA = ((RA % 360) + 360) % 360;
  var Lquad  = Math.floor(L  / 90) * 90;
  var RAquad = Math.floor(RA / 90) * 90;
  RA = (RA + Lquad - RAquad) / 15;
  var sinDec = 0.39782 * Math.sin(L * rad);
  var cosDec = Math.cos(Math.asin(sinDec));
  var cosH   = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;
  var H = isSunrise ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
  H /= 15;
  var T = H + RA - (0.06571 * t) - 6.622;
  var UT = ((T - lngHour) % 24 + 24) % 24;
  // UT ≈ hours from UTC midnight on this Gregorian y-mo-d; display still via ukHourMin → Europe/London
  var utcMs = Date.UTC(y, mo - 1, d) + UT * 3600000;
  return new Date(utcMs);
}

// ── Moon (SPEC pair: app.js getMoonPhase) ──────────────────────────────────

export function getMoonPhase(date) {
  var known = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  var synodicMonth = 29.530588853;
  var diff = (date - known) / 86400000;
  var age  = ((diff % synodicMonth) + synodicMonth) % synodicMonth;
  var pct  = age / synodicMonth;
  var name = age < 1.85   ? 'New Moon'
           : age < 7.38   ? 'Waxing Crescent'
           : age < 9.22   ? 'First Quarter'
           : age < 14.77  ? 'Waxing Gibbous'
           : age < 16.61  ? 'Full Moon'
           : age < 22.15  ? 'Waning Gibbous'
           : age < 23.99  ? 'Last Quarter'
           : age < 29.53  ? 'Waning Crescent'
           :                'New Moon';
  var icon = age < 1.85   ? '<span class="fl-ic fl-moon-new"></span>'
           : age < 7.38   ? '<span class="fl-ic fl-moon-waxcres"></span>'
           : age < 9.22   ? '<span class="fl-ic fl-moon-firstq"></span>'
           : age < 14.77  ? '<span class="fl-ic fl-moon-waxgibb"></span>'
           : age < 16.61  ? '<span class="fl-ic fl-moon-full"></span>'
           : age < 22.15  ? '<span class="fl-ic fl-moon-wangibb"></span>'
           : age < 23.99  ? '<span class="fl-ic fl-moon-lastq"></span>'
           : age < 29.53  ? '<span class="fl-ic fl-moon-wancres"></span>'
           :                '<span class="fl-ic fl-moon-new"></span>';
  return { age: age, pct: pct, name: name, icon: icon, illumination: Math.round((1 - Math.cos(age / synodicMonth * 2 * Math.PI)) / 2 * 100) };
}

// ── Solunar (SPEC pair: app.js getSolunar) ──────────────────────────────────

export function getSolunar(date, lat, lng) {
  var moon = getMoonPhase(date);
  // Moon transit time: shifts ~50 min later each day from solar noon at new moon
  // Each lunar day = 24h 50min = 1490 min, so transit moves 50 min/day
  var SHIFT_PER_DAY = 50; // minutes per day
  var transitMin    = (12 * 60 + moon.age * SHIFT_PER_DAY) % (24 * 60);
  var underfootMin  = (transitMin + 12 * 60 + 25) % (24 * 60);
  // Major periods: ±60 min around transit and underfoot (2hr window each)
  // Minor periods: midpoints between majors (±30 min = 1hr window each)
  var minor1 = (transitMin   + 6 * 60 + 12) % (24 * 60);
  var minor2 = (underfootMin + 6 * 60 + 12) % (24 * 60);
  return {
    major1: { start: (transitMin   - 60 + 1440) % 1440, peak: transitMin,   end: (transitMin   + 60) % 1440 },
    major2: { start: (underfootMin - 60 + 1440) % 1440, peak: underfootMin, end: (underfootMin + 60) % 1440 },
    minor1: { start: (minor1 - 30 + 1440) % 1440, peak: minor1, end: (minor1 + 30) % 1440 },
    minor2: { start: (minor2 - 30 + 1440) % 1440, peak: minor2, end: (minor2 + 30) % 1440 }
  };
}

// ── Minutes-window membership (SPEC pair: app.js inWindow) ──────────────────

export function inWindow(cur, start, end) {
  // All values in minutes-since-midnight (0–1439)
  // Handles windows that cross midnight (end < start)
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end;           // crosses midnight
}

// ── Per-hour activity score at a stand ───────────────────────────────────────
// Parameterised port of app.js hourlyActivityScore (documented divergence,
// same contract as scoreStandDay): identical window/moon/rut/season/solunar/
// weather blocks, but location + species come in as arguments instead of
// bannerState/flMySpecies globals, PLUS a stand-only wind dock — an hour whose
// wind blows FROM one of the stand's bad sectors at ≥ 8 km/h (the same floor
// windDirectionPenalty uses) loses 12 points, the day model's wrong-wind cut.
// app.js hourlyActivityScore itself is unchanged (banner behaviour frozen).
//
// opts: { hour (0-23), date (noon-anchored Date), lat, lng,
//         species (ground species names, [] = all),
//         badWinds (8-wind labels, [] = none),
//         wxHour: { temp, wind (km/h), gustRatio, dir (deg),
//                   precip (mm), postRain (bool) } | null }
export function scoreStandHour(opts) {
  var hour = opts.hour, date = opts.date, lat = opts.lat, lng = opts.lng;
  var wxHour = opts.wxHour || null;
  var sr = calcSunTime(date, lat, lng, true);
  var ss = calcSunTime(date, lat, lng, false);
  var srMin = sr ? toMinutes(sr) : 6 * 60;
  var ssMin = ss ? toMinutes(ss) : 20 * 60;
  var dawnStart = srMin - 60, dawnEnd = srMin + 120;
  var duskStart = ssMin - 90, duskEnd = ssMin + 45;
  var moon = getMoonPhase(date);
  var month = date.getMonth() + 1;
  var score = 0;

  // Time window
  if (hour >= dawnStart / 60 && hour <= dawnEnd / 60)      score += 40;
  else if (hour >= duskStart / 60 && hour <= duskEnd / 60) score += 40;
  else score += 8;

  // Moon — reduced weights (daytime phase effect overstated in literature)
  var mb = moon.illumination < 15 ? 8 : moon.illumination < 40 ? 6
         : moon.illumination < 60 ? 4 : moon.illumination < 85 ? 2 : 1;
  var isNight = !(hour >= dawnStart / 60 && hour <= duskEnd / 60);
  score += isNight ? Math.round(mb * 0.3) : mb;

  // Rut — masked to the ground's species (empty = all species)
  var rutM = RUT_CALENDAR[month] || [0, 0, 0, 0, 0];
  var maxRut = maxRutMasked(rutM, rutMaskForSpecies(opts.species));
  score += maxRut >= 25 ? 15 : maxRut >= 10 ? 8 : maxRut > 0 ? 3 : 0;

  // Season
  score += month === 2 ? 5 : month === 3 ? 3
         : (month === 9 || month === 10) ? 4 : month === 11 ? 2
         : (month >= 6 && month <= 8) ? -3 : 0;

  // Solunar — reduced (contested in peer-reviewed literature; major +3, minor +1)
  var sol = getSolunar(date, lat, lng);
  var hourMin = hour * 60;
  var inMajorH = inWindow(hourMin, sol.major1.start, sol.major1.end) ||
                 inWindow(hourMin, sol.major2.start, sol.major2.end);
  var inMinorH = inWindow(hourMin, sol.minor1.start, sol.minor1.end) ||
                 inWindow(hourMin, sol.minor2.start, sol.minor2.end);
  if (inMajorH)      score += 3;
  else if (inMinorH) score += 1;

  // Weather
  if (wxHour) {
    var t = wxHour.temp;
    var tBase = t <= 0 ? 4 : t <= 8 ? 6 : t <= 14 ? 3 : t <= 18 ? 0 : -3;
    // Frost bonus in hourly: if at/below freezing add extra push
    var tFrost = (t <= 0) ? 3 : (t <= 1) ? 1 : 0;
    score += tBase + tFrost;
    var wkm = wxHour.wind * 0.621; // convert km/h → mph before scoring
    score += wkm <= 8 ? 6 : wkm <= 20 ? 3 : wkm <= 35 ? -2 : -5;
    // Wind consistency: gusty = scent unreliable (only if sustained wind > 5mph)
    if (wxHour.gustRatio !== undefined && wkm > 5) {
      score += wxHour.gustRatio > 0.8 ? -4
             : wxHour.gustRatio > 0.5 ? -2
             : wxHour.gustRatio > 0.3 ? -1
             : wxHour.gustRatio <= 0.15 ? 1 : 0;
    }
    // Post-rain: deer move freely once rain stops (+4). During rain: light +2, heavy -4
    if (wxHour.postRain)          score += 4;
    else if (wxHour.precip > 5)   score += -4;
    else if (wxHour.precip > 0.5) score += 2;
    else                          score += 1;

    // Stand-only divergence: this hour's wind blows from a bad sector.
    if (opts.badWinds && opts.badWinds.length && wxHour.dir != null &&
        wxHour.wind != null && wxHour.wind >= 8 &&
        opts.badWinds.indexOf(windDirLabel8(wxHour.dir)) !== -1) {
      score -= 12;
    }
  }

  return Math.min(100, Math.max(0, score));
}

// ── wxHour builder from raw Open-Meteo hourly arrays ────────────────────────
// Moved here from diary.js standWxHourAt (round 12) so the entry-save
// snapshot logger and the stand views share ONE implementation — diary.js
// now imports this instead of keeping a copy.
// hourly = the raw per-location `.hourly` arrays; dateStr 'YYYY-MM-DD' in the
// forecast's own timezone (timezone=auto → Europe/London for UK stands);
// h = 0-23 on that same clock. null when the hour isn't covered.

export function wxHourAt(hourly, dateStr, h) {
  if (!hourly || !hourly.time || !hourly.temperature_2m) return null;
  var prefix = dateStr + 'T' + (h < 10 ? '0' : '') + h;
  var hi = null;
  for (var i = 0; i < hourly.time.length; i++) {
    if (hourly.time[i].indexOf(prefix) === 0) { hi = i; break; }
  }
  if (hi == null || hourly.temperature_2m[hi] == null) return null;
  var wSpd = hourly.wind_speed_10m ? hourly.wind_speed_10m[hi] : null;
  var wGst = hourly.wind_gusts_10m ? hourly.wind_gusts_10m[hi] : null;
  var pNow = hourly.precipitation ? (hourly.precipitation[hi] || 0) : 0;
  var p1 = hourly.precipitation ? (hourly.precipitation[Math.max(0, hi - 1)] || 0) : 0;
  var p2 = hourly.precipitation ? (hourly.precipitation[Math.max(0, hi - 2)] || 0) : 0;
  return {
    temp: Math.round(hourly.temperature_2m[hi]),
    wind: wSpd,
    gustRatio: (wSpd > 2 && wGst) ? (wGst - wSpd) / wSpd : 0,
    dir: hourly.wind_direction_10m ? hourly.wind_direction_10m[hi] : null,
    precip: pNow,
    precipP: hourly.precipitation_probability ? hourly.precipitation_probability[hi] : null,
    postRain: (pNow < 0.1) && (Math.max(p1, p2) > 0.5),
    code: hourly.weather_code ? hourly.weather_code[hi] : null
  };
}

// ── Forecast-vs-reality snapshot (round 12 — the calibration dataset) ───────
// Pure builder for the silent score log: given the stands list, the RAW
// forecast cache ({ key, ts, data } as modules/stands.mjs stores it) and one
// diary event (cull / blank outing / sighting), return a self-contained
// record pairing the model's PREDICTION for that hour at the nearest stand
// with the OUTCOME the user just logged. Every field needed for later
// calibration rides inside the record — no join back to the entry required.
//
// Returns null — and the caller logs nothing — when the event can't be
// scored honestly: no GPS, no stand within maxDistM (default 400 m), cache
// absent/for different stands, or the event's date+hours outside the cached
// arrays (e.g. a backdated entry). A record with an outcome but no
// prediction is useless for calibration, so it is skipped, not padded.
//
// opts: { stands, cache, lat, lng, dateStr ('YYYY-MM-DD'),
//         timeMin (minutes | null)          — the event's clock time,
//         winMins ([startMin, endMin]|null) — the outing window if known,
//         species (ground species for scoring), kind ('cull'|'blank'|'seen'),
//         n (outcome count), entrySpecies (string|null),
//         nowMs (caller-supplied epoch ms — lib stays Date-free),
//         maxDistM (optional, default 400) }

export function buildScoreSnapshot(opts) {
  var stands = opts.stands, cache = opts.cache;
  if (!stands || !stands.length || !cache || !cache.key || !cache.data) return null;
  if (opts.lat == null || opts.lng == null || !opts.dateStr) return null;

  // Nearest stand to the event, within the radius.
  var maxD = opts.maxDistM || 400;
  var best = null, bestD = Infinity;
  for (var i = 0; i < stands.length; i++) {
    var d = distMeters(opts.lat, opts.lng, stands[i].lat, stands[i].lng);
    if (d != null && d < bestD) { bestD = d; best = stands[i]; }
  }
  if (!best || bestD > maxD) return null;

  // Locate this stand's per-location payload: the cache key is the 4-dp
  // coord list in request order, so match by coord string — robust even if
  // the stands list has since been reordered. (Two stands on the same 11 m
  // grid point share a payload; first index wins, same data either way.)
  var coord = Number(best.lat).toFixed(4) + ',' + Number(best.lng).toFixed(4);
  var idx = cache.key.split('|').indexOf(coord);
  if (idx < 0 || !cache.data[idx] || !cache.data[idx].hourly) return null;
  var hourly = cache.data[idx].hourly;

  // Noon-anchored calendar day (assembleStandDays convention) for sun/moon.
  var parts = opts.dateStr.split('-');
  var date = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 12, 0, 0));
  function scoreAt(h) {
    var wx = wxHourAt(hourly, opts.dateStr, h);
    if (!wx) return null;
    return {
      s: scoreStandHour({
        hour: h, date: date, lat: best.lat, lng: best.lng,
        species: opts.species || [], badWinds: best.bad_winds || [], wxHour: wx
      }),
      wx: wx
    };
  }

  var hour = null, score = null, wx = null;
  if (opts.timeMin != null) {
    hour = Math.floor(opts.timeMin / 60);
    var r = scoreAt(hour);
    if (r) {
      score = r.s;
      wx = { t: r.wx.temp, w: r.wx.wind, d: r.wx.dir, p: r.wx.precip, code: r.wx.code };
    }
  }

  // Outing window → one score per sat hour (same calendar day; a window
  // that runs past midnight — night pest work — is clamped at 23:00).
  var scores = null;
  if (opts.winMins && opts.winMins[0] != null && opts.winMins[1] != null) {
    var h0 = Math.max(0, Math.floor(opts.winMins[0] / 60));
    var h1 = Math.floor(opts.winMins[1] / 60);
    if (h1 < h0) h1 = 23;
    scores = [];
    for (var h = h0; h <= Math.min(23, h1); h++) {
      var rr = scoreAt(h);
      if (rr) scores.push({ h: h, s: rr.s });
    }
    if (!scores.length) scores = null;
  }

  if (score == null && !scores) return null; // outcome without prediction — skip

  return {
    v: 1,
    at: opts.nowMs || 0,
    kind: opts.kind || null,
    n: opts.n == null ? null : opts.n,
    species: opts.entrySpecies || null,
    date: opts.dateStr,
    hour: hour,
    win: opts.winMins || null,
    standId: best.id,
    standName: best.name || null,
    distM: Math.round(bestD),
    score: score,
    scores: scores,
    wx: wx,
    fcAgeMin: (cache.ts && opts.nowMs) ? Math.max(0, Math.round((opts.nowMs - cache.ts) / 60000)) : null
  };
}

// ── Rut calendar (SPEC pair: app.js) ───────────────────────────────────────
// Rut calendar: peak activity boost per species per month (0=none, 30=peak)
// Species: [Red, Fallow, Sika, Roe, CWD]
// Sources: BDS, BASC, Deer Initiative; Sika Oct/Nov shaped to Scotland Wild Deer BPG
// (peak rutting mid Sep–end Oct) + BDS regional late-rut notes (activity into Nov).

export var RUT_SPECIES = ['Red', 'Fallow', 'Sika', 'Roe', 'CWD'];
export var RUT_CALENDAR = {
  1:  [0,  0,  0,  0,  15],
  2:  [0,  0,  0,  0,  5 ],
  3:  [0,  0,  0,  0,  0 ],
  4:  [0,  0,  0,  0,  0 ],
  5:  [0,  0,  0,  5,  0 ],
  6:  [0,  0,  0,  15, 0 ],
  7:  [0,  0,  0,  30, 0 ],
  8:  [5,  0,  0,  20, 0 ],
  9:  [20, 5,  5,  0,  0 ],
  10: [30, 30, 30, 0,  0 ],
  11: [15, 20, 15, 0,  20],
  12: [0,  5,  15, 0,  30],
};

// ── Wind direction (SPEC pair: modules/weather.mjs windDirLabel) ───────────

export function windDirLabel8(deg) {
  if (deg === null || deg === undefined) return '';
  var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/** Canonical 8-wind labels a stand's bad_winds may contain (DB CHECK mirrors this). */
export var WIND_LABELS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

// ── Distance (new — stand history matching) ────────────────────────────────

/** Great-circle distance in metres (haversine). Null-safe: any null/undefined coord → null. */
export function distMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  var R = 6371000;
  var rad = Math.PI / 180;
  var dLat = (lat2 - lat1) * rad;
  var dLng = (lng2 - lng1) * rad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * rad) * Math.cos(lat2 * rad)
        * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ── Wind-direction penalty (new — the per-stand differentiator) ────────────
//
// `hours`: [{ speedKmh, dirDeg }] for one dawn/dusk window; `badWinds`:
// stand's bad 8-wind labels. Hours blowing < 8 km/h (≈5 mph) are ignored —
// calm air carries little scent, so direction is irrelevant below the floor.
// Of the remaining hours, the fraction whose label is in `badWinds`:
//   ≥ 0.5 → −12   (window is scent-compromised)
//   > 0   → −6    (part of the window is)
//   0     → 0
// Empty/absent badWinds or all-calm windows → 0 (stands with no wind config
// score exactly like the base model — STANDS-PLAN §4 same-cell risk note).

export var WIND_PENALTY_SPEED_FLOOR_KMH = 8;

export function windDirectionPenalty(hours, badWinds) {
  if (!badWinds || !badWinds.length || !hours || !hours.length) return 0;
  var relevant = [];
  for (var i = 0; i < hours.length; i++) {
    var h = hours[i];
    if (!h || h.speedKmh === null || h.speedKmh === undefined) continue;
    if (h.speedKmh < WIND_PENALTY_SPEED_FLOOR_KMH) continue;
    relevant.push(h);
  }
  if (!relevant.length) return 0;
  var bad = 0;
  for (var j = 0; j < relevant.length; j++) {
    var lbl = windDirLabel8(relevant[j].dirDeg);
    if (lbl && badWinds.indexOf(lbl) !== -1) bad++;
  }
  var frac = bad / relevant.length;
  return frac >= 0.5 ? -12 : frac > 0 ? -6 : 0;
}

// ── Ideal-wind verdict (new — "best seat this week" planner) ────────────────
// Maps a window's wind-direction penalty (scoreStandDay .windPenalty.dawn/.dusk)
// to a plain verdict for the planner grid:
//   −12 → 'wrong'    (window scent-compromised — deer downwind of you)
//    −6 → 'marginal' (part of the window is)
//     0 → 'good'     (wind not in the stand's bad sectors, or calm)
// Null/absent/positive (no penalty configured) → 'good' — nothing against the seat.
export function standWindVerdict(windPenaltyForWindow) {
  if (windPenaltyForWindow <= -12) return 'wrong';
  if (windPenaltyForWindow < 0) return 'marginal';
  return 'good';
}

// ── Scent-cone geometry (Feature A — HuntZone-style overlay) ────────────────
// Scent travels DOWNWIND: a wind blowing FROM windFromDeg (met convention) carries
// your scent to (windFromDeg + 180). Pure geometry + a verdict that reuses
// windDirLabel8 and the same calm floor as windDirectionPenalty. Note the cone
// reflects a single representative hour's wind, while the stand's window score
// aggregates the whole dawn/dusk window — so at the margins (a briefly-bad hour
// inside a mostly-good window) the cone colour and the score can legitimately
// differ; they agree on the clear-cut cases.

/** Destination point distM metres from (lat,lng) on bearingDeg (great-circle). Inverse of distMeters. Null-safe. */
export function destPoint(lat, lng, bearingDeg, distM) {
  if (lat == null || lng == null || bearingDeg == null || distM == null) return null;
  var R = 6371000;
  var rad = Math.PI / 180;
  var d = distM / R;
  var brng = bearingDeg * rad;
  var lat1 = lat * rad, lng1 = lng * rad;
  var sinLat2 = Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng);
  sinLat2 = Math.max(-1, Math.min(1, sinLat2));
  var lat2 = Math.asin(sinLat2);
  var y = Math.sin(brng) * Math.sin(d) * Math.cos(lat1);
  var x = Math.cos(d) - Math.sin(lat1) * sinLat2;
  var lng2 = lng1 + Math.atan2(y, x);
  return { lat: lat2 / rad, lng: (((lng2 / rad) + 540) % 360) - 180 };
}

/** Initial great-circle bearing (degrees 0–360, 0 = north) from point 1 toward point 2. Null-safe ⇒ null. */
export function bearingDeg(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  var rad = Math.PI / 180;
  var f1 = lat1 * rad, f2 = lat2 * rad, dl = (lng2 - lng1) * rad;
  var y = Math.sin(dl) * Math.cos(f2);
  var x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  var b = Math.atan2(y, x) / rad;
  return ((b % 360) + 360) % 360;
}

/** Cone geometry defaults (metres / degrees). */
export var SCENT_CONE = { spreadDeg: 35, baseM: 90, perKmhM: 14, maxM: 650, arcSteps: 8 };

/** Downwind scent wedge as [{lat,lng}] (apex at the stand + an arc across the spread). Length grows with wind speed to a cap. Null coords ⇒ []. */
export function scentConePolygon(lat, lng, windFromDeg, speedKmh, opts) {
  if (lat == null || lng == null || windFromDeg == null) return [];
  var o = opts || {};
  var spread = o.spreadDeg != null ? o.spreadDeg : SCENT_CONE.spreadDeg;
  var baseM = o.baseM != null ? o.baseM : SCENT_CONE.baseM;
  var perKmh = o.perKmhM != null ? o.perKmhM : SCENT_CONE.perKmhM;
  var maxM = o.maxM != null ? o.maxM : SCENT_CONE.maxM;
  var steps = o.arcSteps != null ? o.arcSteps : SCENT_CONE.arcSteps;
  var spd = (speedKmh == null || speedKmh < 0) ? 0 : speedKmh;
  var len = Math.min(maxM, baseM + perKmh * spd);
  var downwind = (windFromDeg + 180) % 360;
  var pts = [{ lat: lat, lng: lng }];
  for (var i = 0; i <= steps; i++) {
    var b = downwind - spread + (2 * spread) * (i / steps);
    var p = destPoint(lat, lng, ((b % 360) + 360) % 360, len);
    if (p) pts.push(p);
  }
  return pts;
}

/** Cone verdict: 'calm' below the wind floor, 'busted' if the from-label is a bad wind, 'edge' if an adjacent sector is, else 'clear'. */
export function scentConeVerdict(windFromDeg, speedKmh, badWinds) {
  if (speedKmh != null && speedKmh < WIND_PENALTY_SPEED_FLOOR_KMH) return 'calm';
  if (windFromDeg == null) return 'calm';
  var lbl = windDirLabel8(windFromDeg);
  if (badWinds && badWinds.indexOf(lbl) !== -1) return 'busted';
  if (badWinds && badWinds.length) {
    var idx = WIND_LABELS_8.indexOf(lbl);
    if (idx !== -1) {
      if (badWinds.indexOf(WIND_LABELS_8[(idx + 7) % 8]) !== -1 ||
          badWinds.indexOf(WIND_LABELS_8[(idx + 1) % 8]) !== -1) return 'edge';
    }
  }
  return 'clear';
}

// ── Stand day score (parameterised divergence of app.js scoreDay) ──────────
//
// Identical constants and factor maths to app.js scoreDay (FL 7.123
// :2127-2206) with two documented differences:
//   1. lat/lng/date are parameters (app.js reads bannerState);
//   2. windDirectionPenalty(windowWinds.dawn/.dusk, badWinds) is added per
//      window before clamping (diary-only; banner frozen).
// With badWinds empty and identical inputs, dawn/dusk scores equal app.js.
//
// opts: {
//   date        Date        — the day to score
//   lat, lng    number      — stand coordinates
//   wxDay       object|null — { tempMax, tempMin, windMax, gustMax, precip,
//                              pressure, prevPressure } (km/h, °C, mm, hPa)
//   windowWinds object      — { dawn: [{speedKmh,dirDeg}], dusk: [...] } (optional)
//   badWinds    string[]    — stand's bad 8-wind labels (optional)
//   species     string[]    — user's deer (full diary names); empty/omitted = all (optional)
// }
// Returns null when the sun never rises/sets cleanly (polar guard), else
// { dawnScore, duskScore, bestScore, bestWindow, dawnTime, duskTime, moon,
//   windPenalty: { dawn, dusk }, wxDay }.

// Full diary species name → rut-calendar index (Muntjac has no rut → absent).
// SPEC pair: app.js keeps a byte-identical copy of these two helpers + the map.
export var RUT_INDEX_BY_SPECIES = { 'Red Deer': 0, 'Fallow': 1, 'Sika': 2, 'Roe Deer': 3, 'CWD': 4 };

/** Boolean[5] over [Red,Fallow,Sika,Roe,CWD] for the user's deer. Empty/omitted ⇒ all true (pre-v7.143 behaviour: rut counts every species, so scores are unchanged until a user picks their ground's deer). */
export function rutMaskForSpecies(present) {
  if (!present || !present.length) return [true, true, true, true, true];
  var m = [false, false, false, false, false];
  for (var i = 0; i < present.length; i++) {
    var idx = RUT_INDEX_BY_SPECIES[present[i]];
    if (idx != null) m[idx] = true;
  }
  return m;
}

/** Peak rut intensity this month over the masked (present) species only. */
export function maxRutMasked(rutMonths, mask) {
  var x = 0;
  for (var i = 0; i < 5; i++) if (mask[i] && rutMonths[i] > x) x = rutMonths[i];
  return x;
}

export function scoreStandDay(opts) {
  var date = opts.date, lat = opts.lat, lng = opts.lng;
  var wxDay = opts.wxDay || null;
  var windowWinds = opts.windowWinds || {};
  var badWinds = opts.badWinds || [];

  var sr, ss;
  try { sr = calcSunTime(date, lat, lng, true);  } catch (e) { sr = null; }
  try { ss = calcSunTime(date, lat, lng, false); } catch (e) { ss = null; }
  if (!sr || !ss) return null;

  var srMin = toMinutes(sr);
  var ssMin = toMinutes(ss);
  var dawnStart = srMin - 60;
  var duskStart = ssMin - 90;

  var moon = getMoonPhase(date);
  var month = date.getMonth() + 1;

  // Moon boost — reduced from 15/11/8/4/1 (phase effect on daytime movement overstated)
  var mb = moon.illumination < 15 ? 8
         : moon.illumination < 40 ? 6
         : moon.illumination < 60 ? 4
         : moon.illumination < 85 ? 2 : 1;

  // Rut — species-aware: only the user's deer count (opts.species; empty = all).
  var rutMonths = RUT_CALENDAR[month] || [0,0,0,0,0];
  var maxRut = maxRutMasked(rutMonths, rutMaskForSpecies(opts.species));
  var rutScore = maxRut >= 25 ? 15 : maxRut >= 10 ? 8 : maxRut > 0 ? 3 : 0;

  // Seasonal
  var sb = month === 2 ? 5 : month === 3 ? 3
         : (month === 9 || month === 10) ? 4
         : month === 11 ? 2
         : (month >= 6 && month <= 8) ? -3 : 0;

  // Weather for this day
  var wxScore = 0;
  if (wxDay) {
    var avgTemp = (wxDay.tempMax + wxDay.tempMin) / 2;
    var baseTemp = avgTemp <= 0 ? 4 : avgTemp <= 8 ? 6 : avgTemp <= 14 ? 3 : avgTemp <= 18 ? 0 : -3;
    // Frost bonus: overnight low below zero = deer must feed hard next dawn
    var frostBonusD = wxDay.tempMin < -1 ? 4 : wxDay.tempMin <= 0 ? 2 : 0;
    wxScore += baseTemp + frostBonusD;
    var windMaxMph1 = wxDay.windMax * 0.621;
    wxScore += windMaxMph1 < 8 ? 6 : windMaxMph1 < 20 ? 3 : windMaxMph1 < 35 ? -2 : -5;
    // Gust consistency: daily gust max vs wind max ratio
    if (wxDay.gustMax && wxDay.windMax > 2) {
      var dailyGustRatio = (wxDay.gustMax - wxDay.windMax) / wxDay.windMax;
      wxScore += dailyGustRatio > 0.8 ? -4
              : dailyGustRatio > 0.5  ? -2
              : dailyGustRatio > 0.3  ? -1
              : dailyGustRatio <= 0.15 ? 1 : 0;
    }
    wxScore += wxDay.precip > 5 ? -4 : wxDay.precip > 0.5 ? 2 : 1;
    // Pressure proxy: day-over-day delta from surface_pressure_mean
    // (falling pressure = pre-front feeding surge; rising = settled, less urgency)
    if (wxDay.pressure !== null && wxDay.pressure !== undefined) {
      var prevPressure = (wxDay.prevPressure !== undefined) ? wxDay.prevPressure : wxDay.pressure;
      var pressureDelta = wxDay.pressure - prevPressure;
      wxScore += pressureDelta < -1 ? 4 : pressureDelta < 0 ? 2 : pressureDelta > 1 ? 0 : 1;
    }
  }

  // Wind-direction penalty per window (diary-only divergence)
  var dawnPen = windDirectionPenalty(windowWinds.dawn, badWinds);
  var duskPen = windDirectionPenalty(windowWinds.dusk, badWinds);

  var dawnScore = Math.min(100, Math.max(0, 40 + mb + rutScore + sb + wxScore + dawnPen));
  var duskScore = Math.min(100, Math.max(0, 40 + mb + rutScore + sb + wxScore + duskPen));
  // Dusk variance: calmer evenings boost dusk slightly
  duskScore = Math.min(100, Math.max(0, duskScore + (wxDay && (wxDay.windMax * 0.621) > 20 ? -3 : 2)));

  return {
    dawnScore: dawnScore,
    duskScore: duskScore,
    bestScore: Math.max(dawnScore, duskScore),
    bestWindow: dawnScore >= duskScore ? 'Dawn' : 'Dusk',
    dawnTime: fmtMins(dawnStart),
    duskTime: fmtMins(duskStart),
    moon: moon,
    windPenalty: { dawn: dawnPen, dusk: duskPen },
    wxDay: wxDay
  };
}
