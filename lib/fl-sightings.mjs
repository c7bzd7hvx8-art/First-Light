// First Light — lib/fl-sightings.mjs
// =============================================================================
// PURE helpers for the Sightings log (live deer SEEN, not shot) — SIGHTINGS-PLAN.md
// S2. No DOM, no window, no network, no `new Date()` without input. Testable in
// Node with zero dependencies (tests/fl-sightings.test.mjs).
//
// A sighting is one species with a structured composition: n_male / n_female /
// n_young / n_unknown (the DB columns from migrate-sightings.sql). These helpers
// turn that into headcounts, species-appropriate labels (Stag/Hind/Calf vs
// Buck/Doe/Kid), composition text, validation, and trend rollups.
// =============================================================================

import { quarryMeta } from './fl-pure.mjs';

export const SIGHTING_BEHAVIOURS = Object.freeze(['feeding', 'moving', 'rutting', 'bedded', 'alarmed', 'other']);

// The four composition counters (DB columns), in display order.
export const SIGHTING_COUNT_KEYS = Object.freeze(['n_male', 'n_female', 'n_young', 'n_unknown']);

/** Total animals in one sighting (sum of the four counters; missing = 0). */
export function sightingHeadcount(s) {
  if (!s) return 0;
  return (s.n_male | 0) + (s.n_female | 0) + (s.n_young | 0) + (s.n_unknown | 0);
}

/**
 * Species-appropriate labels for the three sexed counters + a fixed 'Unknown'.
 * Buck/Doe/Kid for roe, Stag/Hind/Calf for red & sika, etc. (from QUARRY_SPECIES).
 * An unrecognised species falls back to generic Male / Female / Young.
 */
export function sightingSexLabels(species) {
  var m = quarryMeta(species);
  return {
    male:    m ? m.mLbl   : 'Male',
    female:  m ? m.fLbl   : 'Female',
    young:   m ? m.juvLbl : 'Young',
    unknown: 'Unknown'
  };
}

function pluralise(label) {
  if (label === 'Calf') return 'Calves';
  if (label === 'Unknown' || label === 'Young') return label; // read as uncountable here
  return label + 's';
}

/**
 * Lower-case, plural-aware sex + young nouns for PROSE, species-aware.
 *
 * Finding 3. The app knew the right vocabulary everywhere it mattered - the
 * targets sheet says "Stag / buck total", the syndicate grid says
 * "Stags/Bucks", `sexLabel` is species-aware, and the sighting steppers
 * relabel themselves per species - and then the Sightings Trends screen and
 * the sightings PDF hard-coded "bucks" and "does" in seven places. A red-deer
 * row read "2 bucks / 1 doe" and a red-deer ratio read "200 bucks/100 does".
 * Those are not the words for red deer, and a stalker reads them as evidence
 * the app does not know what it is holding.
 *
 * Pass a species for the exact words. Pass null for a MIXED scope, where the
 * neutral pair is returned instead: no single species noun is true of a scope
 * holding both red and roe, and this is the same call the Stats sex chart
 * already makes when it aggregates across species as "Male / Female". The
 * dual form ("stags/bucks") is right for a table header with room for it, not
 * for a four-across hero label.
 */
export function sightingSexWords(species) {
  if (!species) {
    return { m: 'male', mPl: 'males', f: 'female', fPl: 'females', y: 'young', yPl: 'young' };
  }
  var l = sightingSexLabels(species);
  return {
    m:   l.male.toLowerCase(),        mPl: pluralise(l.male).toLowerCase(),
    f:   l.female.toLowerCase(),      fPl: pluralise(l.female).toLowerCase(),
    y:   l.young.toLowerCase(),       yPl: pluralise(l.young).toLowerCase()
  };
}

function pushCount(parts, n, label) {
  n = n | 0;
  if (n <= 0) return;
  parts.push(n + ' ' + (n === 1 ? label : pluralise(label)));
}

/**
 * Compact composition text, e.g. "1 Stag, 2 Hinds, 1 Calf" (plural-aware,
 * zero counters omitted). Empty string when no animals.
 */
export function sightingCompositionText(s) {
  if (!s) return '';
  var lbl = sightingSexLabels(s.species);
  var parts = [];
  pushCount(parts, s.n_male, lbl.male);
  pushCount(parts, s.n_female, lbl.female);
  pushCount(parts, s.n_young, lbl.young);
  pushCount(parts, s.n_unknown, lbl.unknown);
  return parts.join(', ');
}

/** {ok, error} — every counter a non-negative integer, and ≥ 1 animal total. */
export function validateSightingCounts(s) {
  for (var i = 0; i < SIGHTING_COUNT_KEYS.length; i++) {
    var v = s ? s[SIGHTING_COUNT_KEYS[i]] : 0;
    if (v == null) continue;
    if (typeof v !== 'number' || v < 0 || v > 999 || v !== Math.floor(v)) {
      return { ok: false, error: 'Counts must be whole numbers between 0 and 999.' };
    }
  }
  var total = sightingHeadcount(s);
  if (total < 1) return { ok: false, error: 'Record at least one animal.' };
  // The DB caps a single sighting's TOTAL at 999 (migrate-sightings.sql: the
  // sum CHECK). The +/- steppers clamp each counter at 999 individually, so a
  // multi-counter total could reach ~3996 and be rejected by the DB with a raw
  // constraint error — validate the total here for a clear message instead.
  if (total > 999) return { ok: false, error: 'That is over 999 animals — split it into more than one sighting.' };
  return { ok: true, error: null };
}

function blankRollup() {
  return { sightings: 0, animals: 0, males: 0, females: 0, young: 0, unknown: 0 };
}

function addTo(r, s) {
  r.sightings += 1;
  r.males    += s.n_male | 0;
  r.females  += s.n_female | 0;
  r.young    += s.n_young | 0;
  r.unknown  += s.n_unknown | 0;
  r.animals  += sightingHeadcount(s);
}

/**
 * Roll up a list of sightings for trends.
 * Returns { total: <rollup>, bySpecies: { <species>: <rollup> } } where a
 * rollup = { sightings, animals, males, females, young, unknown }.
 */
export function summariseSightings(list) {
  var total = blankRollup();
  var bySpecies = {};
  (list || []).forEach(function (s) {
    if (!s) return;
    var sp = s.species || 'Unknown';
    if (!bySpecies[sp]) bySpecies[sp] = blankRollup();
    addTo(total, s);
    addTo(bySpecies[sp], s);
  });
  return { total: total, bySpecies: bySpecies };
}

/** Males per 100 females for a rollup (buck:doe index), or null if no females. */
export function buckDoeIndex(rollup) {
  if (!rollup || !rollup.females) return null;
  return Math.round((rollup.males / rollup.females) * 100);
}

/**
 * Young per 100 females for a rollup (SG7) — the recruitment index UK deer
 * managers use alongside the sex ratio (calves:hinds / kids:does). Null when
 * no females were recorded — no denominator, no claim.
 */
export function youngPerHundredFemales(rollup) {
  if (!rollup || !rollup.females) return null;
  return Math.round((rollup.young / rollup.females) * 100);
}

/**
 * Field light band for a sighting time, all inputs minutes-of-day (SG2):
 * dawn = sunrise−60 … sunrise+120 (legal-light start through first movement),
 * dusk = sunset−120 … sunset+60, day = between the bands, night = the rest.
 * Dusk is tested first so it wins if the bands ever meet (deep-winter
 * high-latitude days). Returns 'dawn' | 'day' | 'dusk' | 'night', or null on
 * bad input — callers render nothing rather than a wrong word.
 */
export function sightingLightBand(min, sunriseMin, sunsetMin) {
  if (typeof min !== 'number' || typeof sunriseMin !== 'number' || typeof sunsetMin !== 'number') return null;
  if (!isFinite(min) || !isFinite(sunriseMin) || !isFinite(sunsetMin)) return null;
  if (min < 0 || min > 1439) return null;
  if (min >= sunsetMin - 120 && min <= sunsetMin + 60) return 'dusk';
  if (min >= sunriseMin - 60 && min <= sunriseMin + 120) return 'dawn';
  if (min > sunriseMin + 120 && min < sunsetMin - 120) return 'day';
  return 'night';
}

/**
 * Ground-truth radius (metres) for a sighting's map circle, graded by
 * headcount (SG map round). Metres, not pixels — the blob must mean the same
 * thing at every zoom (the pixel circleMarkers on the stats map read as false
 * precision zoomed in and mud zoomed out). Bands mirror sightingHeatStyle's.
 */
export function sightingHeatRadiusM(n) {
  n = n | 0;
  if (n >= 11) return 150;
  if (n >= 6)  return 120;
  if (n >= 3)  return 90;
  return 60;
}

/**
 * Fill calendar gaps in summariseSightingsByMonth output with zero rollups
 * (SG2): a quiet October must render as an empty bar, not vanish — omitted
 * months made gappy seasons read as contiguous. Input is assumed ascending
 * by ym (the summariser's contract); capped at 600 steps as a runaway guard.
 */
export function fillMonthGaps(months) {
  if (!months || months.length < 2) return months || [];
  var byYm = {};
  months.forEach(function (m) { byYm[m.ym] = m; });
  var first = months[0].ym, last = months[months.length - 1].ym;
  var y = parseInt(first.slice(0, 4), 10), mo = parseInt(first.slice(5, 7), 10);
  var endY = parseInt(last.slice(0, 4), 10), endMo = parseInt(last.slice(5, 7), 10);
  if (!isFinite(y) || !isFinite(mo) || !isFinite(endY) || !isFinite(endMo)) return months;
  var out = [], guard = 0;
  while ((y < endY || (y === endY && mo <= endMo)) && guard++ < 600) {
    var ym = y + '-' + ('0' + mo).slice(-2);
    out.push(byYm[ym] || { ym: ym, sightings: 0, animals: 0, males: 0, females: 0, young: 0, unknown: 0 });
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  return out;
}

/**
 * Chronological per-month rollups for the trends view (SIGHTINGS-PLAN S5).
 * Groups by the YYYY-MM prefix of seen_at; each entry is
 * { ym, sightings, animals, males, females, young, unknown }, ascending by
 * month. Sightings with a missing / malformed seen_at are skipped.
 */
export function summariseSightingsByMonth(list) {
  var map = {};
  (list || []).forEach(function (s) {
    if (!s || !s.seen_at) return;
    var ym = String(s.seen_at).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    if (!map[ym]) map[ym] = { ym: ym, sightings: 0, animals: 0, males: 0, females: 0, young: 0, unknown: 0 };
    var r = map[ym];
    r.sightings += 1;
    r.males    += s.n_male    | 0;
    r.females  += s.n_female  | 0;
    r.young    += s.n_young   | 0;
    r.unknown  += s.n_unknown | 0;
    r.animals  += sightingHeadcount(s);
  });
  return Object.keys(map).sort().map(function (k) { return map[k]; });
}
