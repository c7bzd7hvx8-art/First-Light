// First Light — modules/clock.mjs
//
// Trusted UK clock. The Cull Diary uses British deer-season boundaries, so the
// difference between "local device clock" (untrustworthy — users can set it
// to any date) and "real UK time" matters. This module holds the device-to-UK
// offset (in milliseconds), refreshes it from a consensus of independent
// time sources (see the 13.02 note below), and exposes `diaryNow()` as a
// `new Date()` that's offset to the trusted time.
//
// Public API
//   diaryNow()                            → Date corrected by the offset.
//   syncDiaryTrustedUkClock({ supabaseUrl, supabaseKey } | undefined)
//                                         → Promise<boolean> — true if synced.
//   isDiaryUkClockReady()                 → boolean — offset is "fresh enough"
//                                           (either a persisted <24h offset
//                                           at load time or a just-synced one).
//
// Extracted from diary.js 2026-04-16 as the first Tier 1 module in the
// modularisation plan. diary.js wraps the sync with a zero-arg shim so call
// sites are unchanged.

// ── Time sources ───────────────────────────────────────────────
// 13.02: timeapi.io's own server clock was measured 17.8 minutes slow on
// 2 Aug 2026 while worldtimeapi.org was down — the old first-success-wins
// chain trusted a lying server with no second opinion. Sync now samples
// several independent sources in parallel (this site's own CDN Date header,
// jsdelivr's CDN Date header, timeapi.io, worldtimeapi.org) and takes the
// consensus: the largest cluster agreeing within 90 s wins, and sources are
// probed in trust order so a 1-vs-1 split resolves to the site's own CDN.
// timeapi.io is asked for UTC now — its Europe/London form returned a
// zoneless string that Date.parse read as device-LOCAL time, a latent bug
// whenever the device sat in a non-UK timezone. Each sample keeps the 13.01
// protections: 8 s round-trip guard and NTP-style midpoint anchoring.
const DIARY_UK_CLOCK_TOL_MS = 90 * 1000;

// ── Persistence keys (localStorage) ────────────────────────────
// Unchanged from the classic-script version — a user upgrading will keep
// their cached offset and avoid an unnecessary sync on first module load.
const DIARY_UK_CLOCK_OFFSET_KEY    = 'fl_uk_clock_offset_ms';
const DIARY_UK_CLOCK_SYNCED_AT_KEY = 'fl_uk_clock_synced_at_ms';

// A persisted offset counts as "fresh" for 24 hours. Beyond that we refuse
// to trust it for writes until a live sync succeeds.
const DIARY_UK_CLOCK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// ── Module state ───────────────────────────────────────────────
// All internal to this module; no other file can mutate these.
let offsetMs = 0;
let ready = false;
let syncInFlight = null;

// 13.01: a resumed page re-syncs (throttled to 5 min) — diaryNow() readers
// recompute from the offset continuously, so the fix lands within a tick.
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    try {
      const syncedAt = parseInt(localStorage.getItem(DIARY_UK_CLOCK_SYNCED_AT_KEY) || '0', 10) || 0;
      if (Date.now() - syncedAt > 5 * 60 * 1000) syncDiaryTrustedUkClock();
    } catch (_) { syncDiaryTrustedUkClock(); }
  });
}

// ── Hydrate from localStorage at module init ───────────────────
// Synchronous top-level. Any caller that happens to run before their first
// sync (e.g. opening the diary offline) sees the last-known offset if it's
// less than 24 hours old. Wrapped in try/catch because localStorage can
// throw in private-mode Safari.
(function loadPersistedOffset() {
  try {
    const off = parseInt(localStorage.getItem(DIARY_UK_CLOCK_OFFSET_KEY) || '', 10);
    const syncedAt = parseInt(localStorage.getItem(DIARY_UK_CLOCK_SYNCED_AT_KEY) || '', 10);
    if (Number.isFinite(off) && Number.isFinite(syncedAt) && (Date.now() - syncedAt) < DIARY_UK_CLOCK_MAX_AGE_MS) {
      offsetMs = off;
      ready = true;
    }
  } catch (_) {}
})();

// ── Public API ─────────────────────────────────────────────────

/**
 * Return a Date object representing "trusted UK now".
 * When no sync has ever succeeded, `offsetMs` is 0 and this degrades to
 * `new Date()` — the caller can check `isDiaryUkClockReady()` first if the
 * data being written is season-boundary sensitive.
 */
export function diaryNow() {
  return new Date(Date.now() + offsetMs);
}

/** True if we have a trusted offset (persisted <24h or just-synced). */
export function isDiaryUkClockReady() {
  return ready;
}

// One JSON time-API sample → offset vs the request midpoint, or null.
async function diaryClockSampleJson(url) {
  const t0 = Date.now();
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return null;
  const d = await r.json();
  const t1 = Date.now();
  if (t1 - t0 > 8000) return null; // 13.01: a suspension hid inside this sample
  let iso = String((d && (d.utc_datetime || d.datetime || d.dateTime)) || '');
  // Zoneless strings (timeapi.io) are UTC because we request UTC.
  if (iso && !/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso)) iso += 'Z';
  const serverMs = Date.parse(iso);
  if (!Number.isFinite(serverMs)) return null;
  return serverMs - Math.round((t0 + t1) / 2); // 13.01: NTP midpoint
}

// One response-Date-header sample. Any response carries a Date header (even
// a 404), so no r.ok check. Headers are whole-second; +500 ms centres the
// truncation error.
async function diaryClockSampleDateHeader(url, opts) {
  const t0 = Date.now();
  const r = await fetch(url, opts);
  const t1 = Date.now();
  if (t1 - t0 > 8000) return null; // 13.01
  const h = r && r.headers && r.headers.get ? r.headers.get('date') : '';
  const serverMs = Date.parse(String(h || ''));
  if (!Number.isFinite(serverMs)) return null;
  return serverMs + 500 - Math.round((t0 + t1) / 2);
}

// Race a probe against a 7 s timer (just under the 8 s per-sample guard) so
// one hung endpoint cannot stall the whole consensus. Errors become null.
function diaryClockProbe(p) {
  let tid = null;
  return Promise.race([
    p.then(v => v, () => null),
    new Promise(res => { tid = setTimeout(() => res(null), 7000); })
  ]).then(v => { if (tid !== null) clearTimeout(tid); return v; });
}

/**
 * Refresh the offset from a consensus of remote sources (see header note).
 *
 * Takes no arguments. (The pre-13.02 signature accepted a Supabase config
 * for a Date-header fallback — removed because Supabase does not CORS-expose
 * its Date header, so that source could never actually work in a browser;
 * jsdelivr, which exposes Date, replaced it. Legacy callers passing the old
 * argument are harmless.)
 *
 * @returns {Promise<boolean>} `true` if any source succeeded, otherwise the
 *     previous `ready` flag (a persisted offset still counts as success).
 *
 * Concurrent callers share one in-flight promise so a spike of simultaneous
 * "do I need to sync?" checks in the UI only issues one round of fetches.
 */
export async function syncDiaryTrustedUkClock() {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async function() {
    try {
      // All probes launch in parallel. Trust order matters: on a 1-vs-1
      // split the earlier source's cluster wins.
      const probes = [
        diaryClockProbe(diaryClockSampleDateHeader('sw.js', { method: 'HEAD', cache: 'no-store' })),
        diaryClockProbe(diaryClockSampleDateHeader('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/package.json', { method: 'HEAD', cache: 'no-store' })),
        diaryClockProbe(diaryClockSampleJson('https://timeapi.io/api/Time/current/zone?timeZone=UTC')),
        diaryClockProbe(diaryClockSampleJson('https://worldtimeapi.org/api/timezone/Etc/UTC'))
      ];
      const samples = [];
      for (let i = 0; i < probes.length; i++) {
        const v = await probes[i];
        if (v !== null && Number.isFinite(v)) samples.push(v);
      }
      if (!samples.length) return !!ready;
      // Largest cluster of samples agreeing within the tolerance wins.
      let best = null;
      for (let j = 0; j < samples.length; j++) {
        const anchor = samples[j];
        const mates = samples.filter(x => Math.abs(x - anchor) <= DIARY_UK_CLOCK_TOL_MS);
        if (!best || mates.length > best.length) best = mates;
      }
      let sum = 0;
      for (let k = 0; k < best.length; k++) sum += best[k];
      offsetMs = Math.round(sum / best.length);
      ready = true;
      try {
        localStorage.setItem(DIARY_UK_CLOCK_OFFSET_KEY, String(offsetMs));
        localStorage.setItem(DIARY_UK_CLOCK_SYNCED_AT_KEY, String(Date.now()));
      } catch (_) {}
      return true;
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}
