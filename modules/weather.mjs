// First Light — modules/weather.mjs
// =============================================================================
// Weather-at-time-of-cull helpers extracted from diary.js during the Phase-1
// modularisation. See MODULARISATION-PLAN.md → Commit F.
//
// Scope of this module (the pure + fetch half of the weather feature):
//   • wxCodeLabel(code)            — WMO integer → { abbrev, label, skySvg, … }
//   • windDirLabel(deg)            — 0-360° → 'N' | 'NE' | … | 'NW' | ''
//   • findOpenMeteoHourlyIndex(…)  — match entry date+hour against the API's
//                                    hourly `time` array (handles 'YYYY-MM-DDTHH'
//                                    and ':00' / ':00:00' variants)
//   • diaryLondonWallMs(date,time) — treat 'YYYY-MM-DD' + 'HH:MM' strings as
//                                    Europe/London wall-clock and return UTC
//                                    epoch-ms; survives the user travelling
//                                    abroad and the BST/GMT transition
//   • fetchCullWeather(…)          — Open-Meteo forecast+past_days=7 call,
//                                    returns the shape that gets stored as
//                                    cull_entries.weather_data JSONB
//
// Explicitly *not* in this module (still in diary.js):
//   • attachWeatherToEntry()   — touches `sb`, `currentUser`, `allEntries`
//     (application state — wait for data.mjs)
//   • renderWeatherStrip()     — depends on `esc()` which is still inline
//     (wait until the HTML-escape helper graduates to fl-pure.mjs import)
//
// We import the sky-icon SVG strings from svg-icons.mjs so `wxCodeLabel`
// returns a ready-to-inline markup blob with no further plumbing in the
// caller. All functions below are pure except fetchCullWeather (which talks
// to api.open-meteo.com and reads the trusted UK clock).
// =============================================================================

import { diaryNow } from './clock.mjs';
import {
  SVG_WX_SKY_CLR, SVG_WX_SKY_PTLY, SVG_WX_SKY_OVC, SVG_WX_SKY_FOG,
  SVG_WX_SKY_DZ, SVG_WX_SKY_RAIN, SVG_WX_SKY_SHOWERS, SVG_WX_SKY_SNOW,
  SVG_WX_SKY_SNSH, SVG_WX_SKY_TS, SVG_WX_SKY_UNK
} from './svg-icons.mjs';

// ── WMO code → label/icon/bar-gradient ────────────────────────────────────
// Buckets follow Open-Meteo's WMO weather code table. The boundaries are
// inclusive (e.g. `<= 49` covers 45–48 fog codes). Pure — safe to unit-test.
export function wxCodeLabel(code) {
  var c = code;
  // null/undefined = "no code reported" → Unknown, NOT Clear (a null code with
  // 100% cloud + rain must not show a clear-sky icon). Handling it here also avoids
  // the JS coercion `null <= 2` → true that would otherwise fall into "Partly cloudy".
  if (c === null || c === undefined) {
    return { abbrev: '–', label: 'Unknown', wmoTitle: 'No code', skySvg: SVG_WX_SKY_UNK, barBg: '#555' };
  }
  if (c === 0) {
    return { abbrev: 'CLR', label: 'Clear', wmoTitle: 'WMO code 0', skySvg: SVG_WX_SKY_CLR, barBg: 'linear-gradient(90deg,#5a6a4a,#c8a84b)' };
  }
  if (c <= 2) {
    return { abbrev: 'PTLY', label: 'Partly cloudy', wmoTitle: 'WMO 1–2', skySvg: SVG_WX_SKY_PTLY, barBg: 'linear-gradient(90deg,#c8a84b,#6b7280)' };
  }
  if (c === 3) {
    return { abbrev: 'OVC', label: 'Overcast', wmoTitle: 'WMO code 3', skySvg: SVG_WX_SKY_OVC, barBg: 'linear-gradient(90deg,#5c6670,#8a9399)' };
  }
  if (c <= 49) {
    return { abbrev: 'FG', label: 'Fog', wmoTitle: 'WMO ≤49', skySvg: SVG_WX_SKY_FOG, barBg: 'linear-gradient(90deg,#5c5568,#8a8299)' };
  }
  if (c <= 57) {
    return { abbrev: 'DZ', label: 'Drizzle', wmoTitle: 'WMO 51–57', skySvg: SVG_WX_SKY_DZ, barBg: 'linear-gradient(90deg,#4a5a70,#7a8aa0)' };
  }
  if (c <= 65) {
    return { abbrev: 'RA', label: 'Rain', wmoTitle: 'WMO 61–65', skySvg: SVG_WX_SKY_RAIN, barBg: 'linear-gradient(90deg,#3d5a80,#6a8ab0)' };
  }
  if (c <= 77) {
    return { abbrev: 'SN', label: 'Snow', wmoTitle: 'WMO 71–77', skySvg: SVG_WX_SKY_SNOW, barBg: 'linear-gradient(90deg,#4a6070,#8a9eaa)' };
  }
  if (c <= 82) {
    return { abbrev: 'SHRA', label: 'Showers', wmoTitle: 'WMO 80–82', skySvg: SVG_WX_SKY_SHOWERS, barBg: 'linear-gradient(90deg,#3d5a80,#5a7a98)' };
  }
  if (c <= 86) {
    return { abbrev: 'SHSN', label: 'Snow showers', wmoTitle: 'WMO 85–86', skySvg: SVG_WX_SKY_SNSH, barBg: 'linear-gradient(90deg,#5a6a78,#9aa8b0)' };
  }
  if (c <= 99) {
    return { abbrev: 'TS', label: 'Thunderstorm', wmoTitle: 'WMO 95–99', skySvg: SVG_WX_SKY_TS, barBg: 'linear-gradient(90deg,#8a6a30,#4a5560)' };
  }
  return { abbrev: '–', label: 'Unknown', wmoTitle: 'No code', skySvg: SVG_WX_SKY_UNK, barBg: '#555' };
}

// ── Compass-point from bearing ────────────────────────────────────────────
// 8-point rose, 45° buckets centred on the cardinals. null/undefined →
// empty string (caller appends conditionally).
export function windDirLabel(deg) {
  if (deg === null || deg === undefined) return '';
  var dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// ── Open-Meteo hourly index lookup ────────────────────────────────────────
// Open-Meteo has shipped both `YYYY-MM-DDTHH:00` and `YYYY-MM-DDTHH:00:00`
// variants across API versions; matching on the exact string first and then
// the `HH:` prefix handles both without regex cost.
export function findOpenMeteoHourlyIndex(times, date, hour) {
  if (!times || !times.length) return -1;
  var hh = ('0' + hour).slice(-2);
  var exact = date + 'T' + hh + ':00';
  var idx = times.indexOf(exact);
  if (idx !== -1) return idx;
  var prefix = date + 'T' + hh + ':';
  for (var i = 0; i < times.length; i++) {
    var t = times[i];
    if (typeof t === 'string' && t.indexOf(prefix) === 0) return i;
  }
  return -1;
}

/**
 * Interpret `YYYY-MM-DD` + `HH:MM` wall-clock strings as Europe/London time and
 * return a UTC epoch-ms. Needed because `new Date("YYYY-MM-DDTHH:MM:00")` uses
 * the device's local TZ — fine at home in the UK, wrong when the user is
 * abroad (a 6.9-day-old entry logged at UK wall-clock could slip past the
 * 7-day gate by an hour when recomputed in CET/EST).
 *
 * Works across BST/GMT transitions by asking Intl for the London offset at
 * the target UTC moment and subtracting it — then asking a second time, at the
 * answer, because on one Sunday a year those two are not the same offset. See
 * _londonResolve() below.
 */
// Cached formatter (2026-07-17 perf round): standTonightPick calls this for
// every window of every day of every stand — up to 168 times per stands
// render — and Intl.DateTimeFormat construction is ~70× a cached format call.
var _londonOffsetFmt = null;
// And a memo on top of that (2026-07-25): the second probe below asks about an
// instant an hour from the first, and a stands render walks consecutive hours,
// so the same buckets come round again. Keyed by UTC hour, which is finer than
// any transition. Bounded — this runs for the life of the tab.
var _londonOffsetMemo = new Map();

/** London's UTC offset in ms at a given instant, or null if Intl cannot say. */
function _londonOffsetAt(atMs) {
  var key = Math.floor(atMs / 3600000);
  if (_londonOffsetMemo.has(key)) return _londonOffsetMemo.get(key);
  var off = null;
  try {
    if (!_londonOffsetFmt) {
      _londonOffsetFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        timeZoneName: 'longOffset'
      });
    }
    var parts = _londonOffsetFmt.formatToParts(new Date(atMs));
    var tz = parts.find(function (p) { return p.type === 'timeZoneName'; });
    if (tz) {
      // ICU writes 'GMT+01:00' / 'GMT+00:00' here, but a bare 'GMT' is a legal
      // rendering of a zero offset and must not be read as "no answer".
      var m = String(tz.value).match(/GMT(?:([+-])(\d{1,2}):?(\d{2})?)?/);
      if (m) {
        if (!m[1]) off = 0;
        else off = (m[1] === '+' ? 1 : -1) * ((parseInt(m[2], 10) * 3600000) + (parseInt(m[3] || '0', 10) * 60000));
      }
    }
  } catch (_) { off = null; }
  if (_londonOffsetMemo.size > 4096) _londonOffsetMemo.clear();
  _londonOffsetMemo.set(key, off);
  return off;
}

/**
 * Resolve a London wall-clock instant, given `utcMs` = that wall clock read as
 * if it were UTC.
 *
 * One probe is not enough. The offset that matters is the one in force at the
 * ANSWER, not the one in force at the wall clock read as UTC, and on the last
 * Sunday in March those differ for a whole hour: 01:30 does not exist, the
 * clocks having gone straight from 01:00 GMT to 02:00 BST. A single probe read
 * BST (+1) at 01:30 UTC and returned 00:30 UTC — so an entry saved at 01:30 read
 * back as 00:30, an hour earlier than it was typed, silently, once a year.
 *
 * Probing again at the answer fixes it: if the offset there disagrees, the wall
 * clock fell in the gap, and the convention (the same one Temporal calls
 * 'compatible') is to shift forward — 01:30 becomes 02:30 BST. When the first
 * probe reads GMT the second cannot disagree, so it is skipped; that is the
 * whole of winter and half of summer's hot path.
 */
function _londonResolve(utcMs) {
  var off = _londonOffsetAt(utcMs);
  if (off === null) return null;
  if (off === 0) return utcMs;
  var off2 = _londonOffsetAt(utcMs - off);
  if (off2 === null || off2 === off) return utcMs - off;
  return utcMs - off2;
}

export function diaryLondonWallMs(dateStr, timeStr) {
  var y  = parseInt(dateStr.slice(0, 4), 10);
  var mo = parseInt(dateStr.slice(5, 7), 10) - 1;
  var d  = parseInt(dateStr.slice(8, 10), 10);
  var t  = (timeStr || '12:00').split(':');
  var h  = parseInt(t[0], 10) || 0;
  var mn = parseInt(t[1], 10) || 0;
  var utcMs = Date.UTC(y, mo, d, h, mn);
  var resolved = _londonResolve(utcMs);
  if (resolved !== null) return resolved;
  // Fallback: assume device TZ is UK (the overwhelmingly common case).
  return new Date(dateStr + 'T' + (timeStr || '12:00') + ':00').getTime();
}

/**
 * Read one Open-Meteo hourly sample. Arrays can exist while `arr[idx]` is
 * `null` (missing sample); coercing `null` with math yields 0 — wrong for temp.
 */
export function openMeteoHourlyValue(arr, idx) {
  if (!arr || idx < 0 || idx >= arr.length) return null;
  var v = arr[idx];
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}

// ── Weather at time of cull ───────────────────────────────────────────────
// Fetches from Open-Meteo forecast API with past_days=7. The "last 7 days"
// gate is enforced client-side because the forecast endpoint will happily
// quote yesterday's weather but refuses anything older than past_days allows.
// Returns null (not throws) on *any* failure — the caller is a fire-and-forget
// background job after save and must never disturb the UI.

/** Shared hourly-sample extraction → the cull_entries.weather_data shape. */
function wxRecordAt(hourlyObj, idx) {
  var t = openMeteoHourlyValue(hourlyObj.temperature_2m, idx);
  var windKmh = openMeteoHourlyValue(hourlyObj.wind_speed_10m, idx);
  var gustKmh = openMeteoHourlyValue(hourlyObj.wind_gusts_10m, idx);
  var wd = openMeteoHourlyValue(hourlyObj.wind_direction_10m, idx);
  var p = openMeteoHourlyValue(hourlyObj.surface_pressure, idx);
  var c = openMeteoHourlyValue(hourlyObj.cloud_cover, idx);
  var wc = openMeteoHourlyValue(hourlyObj.weather_code, idx);
  var pr = openMeteoHourlyValue(hourlyObj.precipitation, idx);
  return {
    temp:       t != null ? Math.round(t * 10) / 10 : null,
    wind_mph:   windKmh != null ? Math.round(windKmh * 0.621) : null,
    gust_mph:   gustKmh != null ? Math.round(gustKmh * 0.621) : null,
    wind_dir:   wd,
    pressure:   p != null ? Math.round(p) : null,
    cloud:      c,
    code:       wc,
    precip_mm:  pr,
    fetched_at: diaryNow().toISOString()
  };
}

export async function fetchCullWeather(date, time, lat, lng) {
  if (!date || !lat || !lng) return null;

  // Interpret the entry's wall-clock as Europe/London so the 7-day gate doesn't
  // drift when the user's device is on holiday in a different TZ.
  var entryMs = diaryLondonWallMs(date, time);
  var nowMs = diaryNow().getTime();
  var ageDays = (nowMs - entryMs) / 86400000;

  // Skip if older than 7 days or in the future.
  if (ageDays > 7 || ageDays < 0) return null;

  var hour = time ? parseInt(time.split(':')[0]) : 12;

  try {
    // past_days=7 → 168 hourly samples back. forecast_days=1 keeps the URL
    // minimal; we only ever index into the past part of the array.
    var url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + lat + '&longitude=' + lng
      + '&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover,weather_code,precipitation'
      + '&past_days=7&forecast_days=1&timezone=auto';

    var r = await fetch(url);
    if (!r.ok) return null;
    var d = await r.json();

    var times = d.hourly && d.hourly.time ? d.hourly.time : [];
    var idx = findOpenMeteoHourlyIndex(times, date, hour);
    if (idx === -1) return null;

    return wxRecordAt(d.hourly, idx);
  } catch (e) {
    console.warn('Weather fetch failed:', e);
    return null;
  }
}

// ── Historical weather backfill (round 13 — stand wind evidence) ────────────
// The forecast endpoint stops 7 days back; older culls saved before the
// weather feature existed have weather_data NULL. The archive endpoint
// serves the same hourly variables for any past date (it lags real time by
// a few days, which is fine — callers only use it for entries >7 days old).
// Same record shape as fetchCullWeather plus source:'archive', so a
// backfilled row renders in the entry-detail weather strip exactly like a
// live-attached one. Same contract: null on any failure, never throws.

export function archiveWeatherUrl(date, lat, lng) {
  return 'https://archive-api.open-meteo.com/v1/archive'
    + '?latitude=' + lat + '&longitude=' + lng
    + '&start_date=' + date + '&end_date=' + date
    + '&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover,weather_code,precipitation'
    + '&timezone=auto';
}

export async function fetchCullWeatherArchive(date, time, lat, lng) {
  if (!date || !lat || !lng) return null;
  var hour = time ? parseInt(time.split(':')[0]) : 12;
  try {
    var r = await fetch(archiveWeatherUrl(date, lat, lng));
    if (!r.ok) return null;
    var d = await r.json();
    var times = d.hourly && d.hourly.time ? d.hourly.time : [];
    var idx = findOpenMeteoHourlyIndex(times, date, hour);
    if (idx === -1) return null;
    var wx = wxRecordAt(d.hourly, idx);
    wx.source = 'archive';
    return wx;
  } catch (e) {
    console.warn('Archive weather fetch failed:', e);
    return null;
  }
}
