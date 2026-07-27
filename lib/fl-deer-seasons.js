// =============================================================================
// First Light — UK deer close seasons: the single statutory source
//
// Sibling to lib/fl-deer-law.js, which holds the firearms and ammunition
// thresholds. This module holds the other half of the legal question a stalker
// asks before a shot: not "may I use this rifle on this animal" but "may I
// shoot this animal today, here".
//
// Why this file exists
// ────────────────────
// Until it did, the statutory close seasons lived in two places and in two
// different shapes: day-exact `inSeason(m, d, 10, 21, 2, 15)` literals inside
// app.js, and month-granular `data-open="1,2,10,11,12"` attributes on the
// calendar cards in index.html. Two encodings of one fact, neither generated
// from the other, and no test over either. They disagreed. On 5 October a
// Scottish red hind card read OPEN off the month list while the status row on
// the same page, about the same animal, read closed off the day-exact literal;
// 16-28 February inverted it. This module is the one place the dates live, and
// both surfaces now derive from it.
//
// Source verification (read at primary source on 26 July 2026)
// ────────────────────────────────────────────────────────────
//
//   * England & Wales — Deer Act 1991 c. 54, Schedule 1 ("Close Seasons"),
//     as substituted with effect from 1 October 2007 by the Regulatory Reform
//     (Deer) (England and Wales) Order 2007 (SI 2007/2183). Muntjac appear in
//     no row of Schedule 1 and therefore have no statutory close season.
//     legislation.gov.uk records no known outstanding effects on Schedule 1.
//     https://www.legislation.gov.uk/ukpga/1991/54/schedule/1
//
//   * Scotland — Deer (Close Seasons) (Scotland) Order 2011 (SSI 2011/417),
//     as amended by the Deer (Close Seasons) (Scotland) Amendment Order 2023
//     (SSI 2023/184), in force 21 October 2023. The 2023 amendment abolished
//     the close season for male deer of every species. Female seasons were
//     retained and are the dates below.
//     https://www.legislation.gov.uk/ssi/2011/417
//     https://www.legislation.gov.uk/ssi/2023/184
//
//   * Northern Ireland — Wildlife (Northern Ireland) Order 1985
//     (SI 1985/171 (NI 2)), Schedule 10 ("Close seasons for deer"). Only
//     fallow, red and sika appear. Roe, muntjac and Chinese water deer have
//     no row, and this module reports that as 'not-listed' rather than
//     inventing either an open season or a closed one for them.
//     https://www.legislation.gov.uk/nisi/1985/171/schedule/10
//
// Dates below are OPEN seasons — the window in which the animal may lawfully
// be taken. The statutes are written the other way round, as close seasons;
// the conversion is done once, here, and the closing date of each open window
// is the day before the close season begins.
//
// Pure data and pure functions. No DOM, no network, no globals.
// =============================================================================

/**
 * True once every date in this module has been read at primary source. The
 * calendar surfaces a pre-release caveat while this is false; it is the same
 * contract lib/fl-deer-law.js uses for flUkDeerLawVerified.
 */
export const flUkDeerSeasonsVerified = true;

/** ISO date on which the statutory text behind every entry was last read. */
export const SEASONS_VERIFIED_ON = '2026-07-26';

export const SEASON_JURISDICTIONS = Object.freeze([
  Object.freeze({ code: 'england-wales',    label: 'England & Wales',   short: 'E&W',      domSuffix: 'en', cardClass: 'cal-species-card' }),
  Object.freeze({ code: 'scotland',         label: 'Scotland',          short: 'Scotland', domSuffix: 'sc', cardClass: 'cal-species-card-sc' }),
  Object.freeze({ code: 'northern-ireland', label: 'Northern Ireland',  short: 'NI',       domSuffix: 'ni', cardClass: 'cal-species-card-ni' }),
]);

/**
 * The twelve species-and-sex keys the calendar cards are built from. These are
 * the same strings the markup carries in data-venison-key, deliberately, so
 * that a card and a season cannot drift apart without a test noticing.
 */
export const SEASON_KEYS = Object.freeze([
  'red-stag', 'red-hind',
  'fallow-buck', 'fallow-doe',
  'roe-buck', 'roe-doe',
  'sika-stag', 'sika-hind',
  'muntjac-buck', 'muntjac-doe',
  'cwd-buck', 'cwd-doe',
]);

const MONTH_ABBR = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

// ── Record constructors ───────────────────────────────────────────────────
//
// Three states, and the third one is the point. A species can have an open
// window, or no close season at all, or no row in the statute — and the third
// is not the second. "The order does not mention muntjac" is a gap in what we
// know, not a licence.

/** An open window, inclusive of both endpoints. Wraps the year end freely. */
function win(startMonth, startDay, endMonth, endDay) {
  return Object.freeze({ status: 'window', startMonth, startDay, endMonth, endDay });
}

/** No close season is prescribed: lawful all year. */
function yearRound(note) {
  return Object.freeze({ status: 'year-round', note: note || null });
}

/** The species has no row in this jurisdiction's schedule. */
function notListed(note) {
  return Object.freeze({ status: 'not-listed', note: note || null });
}

const EW_FEMALE = () => win(11, 1, 3, 31);      // 1 Nov – 31 Mar
const EW_ANTLERED = () => win(8, 1, 4, 30);     // 1 Aug – 30 Apr

const SEASONS = Object.freeze({
  // ── England & Wales — Deer Act 1991 Sch. 1 (subst. SI 2007/2183) ────────
  'england-wales': Object.freeze({
    'red-stag':     EW_ANTLERED(),
    'red-hind':     EW_FEMALE(),
    'fallow-buck':  EW_ANTLERED(),
    'fallow-doe':   EW_FEMALE(),
    'roe-buck':     win(4, 1, 10, 31),          // 1 Apr – 31 Oct
    'roe-doe':      EW_FEMALE(),
    'sika-stag':    EW_ANTLERED(),
    'sika-hind':    EW_FEMALE(),
    'muntjac-buck': yearRound('Muntjac appear in no row of Deer Act 1991 Sch. 1, so no close season applies. Muntjac breed year round and a doe may be lactating or heavily pregnant in any month — the Deer Act 1991 s.6(3) dependent-young offence still bites.'),
    'muntjac-doe':  yearRound('Muntjac appear in no row of Deer Act 1991 Sch. 1, so no close season applies. Muntjac breed year round and a doe may be lactating or heavily pregnant in any month — the Deer Act 1991 s.6(3) dependent-young offence still bites.'),
    'cwd-buck':     win(11, 1, 3, 31),          // both sexes share one window
    'cwd-doe':      win(11, 1, 3, 31),
  }),

  // ── Scotland — SSI 2011/417 as amended by SSI 2023/184 (21 Oct 2023) ────
  'scotland': Object.freeze({
    'red-stag':     yearRound('SSI 2023/184 abolished the close season for male deer of all species in Scotland with effect from 21 October 2023.'),
    'red-hind':     win(10, 21, 2, 15),         // 21 Oct – 15 Feb
    'fallow-buck':  yearRound('SSI 2023/184 abolished the close season for male deer of all species in Scotland with effect from 21 October 2023.'),
    'fallow-doe':   win(10, 21, 2, 15),
    'roe-buck':     yearRound('SSI 2023/184 abolished the close season for male deer of all species in Scotland with effect from 21 October 2023.'),
    'roe-doe':      win(10, 21, 3, 31),         // 21 Oct – 31 Mar
    'sika-stag':    yearRound('SSI 2023/184 abolished the close season for male deer of all species in Scotland with effect from 21 October 2023.'),
    'sika-hind':    win(10, 21, 2, 15),
    'muntjac-buck': notListed('The Scottish close-seasons order names red, sika, fallow and roe only. Muntjac are not naturalised in Scotland and no season is prescribed for them.'),
    'muntjac-doe':  notListed('The Scottish close-seasons order names red, sika, fallow and roe only. Muntjac are not naturalised in Scotland and no season is prescribed for them.'),
    'cwd-buck':     notListed('The Scottish close-seasons order names red, sika, fallow and roe only. Chinese water deer are not naturalised in Scotland and no season is prescribed for them.'),
    'cwd-doe':      notListed('The Scottish close-seasons order names red, sika, fallow and roe only. Chinese water deer are not naturalised in Scotland and no season is prescribed for them.'),
  }),

  // ── Northern Ireland — Wildlife (NI) Order 1985 Sch. 10 ─────────────────
  'northern-ireland': Object.freeze({
    'red-stag':     win(8, 1, 4, 30),
    'red-hind':     win(11, 1, 3, 31),
    'fallow-buck':  win(8, 1, 4, 30),
    'fallow-doe':   win(11, 1, 3, 31),
    'roe-buck':     notListed('Schedule 10 lists fallow, red and sika only. Roe deer are not established in Northern Ireland and no close season is prescribed for them.'),
    'roe-doe':      notListed('Schedule 10 lists fallow, red and sika only. Roe deer are not established in Northern Ireland and no close season is prescribed for them.'),
    'sika-stag':    win(8, 1, 4, 30),
    'sika-hind':    win(11, 1, 3, 31),
    'muntjac-buck': notListed('Schedule 10 lists fallow, red and sika only. Muntjac are not established in Northern Ireland and no close season is prescribed for them. Art. 20(8A) does set firearms minimums for muntjac, so the Order contemplates the species without giving it a season.'),
    'muntjac-doe':  notListed('Schedule 10 lists fallow, red and sika only. Muntjac are not established in Northern Ireland and no close season is prescribed for them. Art. 20(8A) does set firearms minimums for muntjac, so the Order contemplates the species without giving it a season.'),
    'cwd-buck':     notListed('Schedule 10 lists fallow, red and sika only. Chinese water deer are not established in Northern Ireland and no close season is prescribed for them.'),
    'cwd-doe':      notListed('Schedule 10 lists fallow, red and sika only. Chinese water deer are not established in Northern Ireland and no close season is prescribed for them.'),
  }),
});

export { SEASONS };

// ── Lookup ────────────────────────────────────────────────────────────────

/** Is this a jurisdiction this module has season data for? */
export function isSeasonJurisdiction(code) {
  return SEASON_JURISDICTIONS.some(j => j.code === code);
}

/** Is this one of the twelve species-and-sex keys? */
export function isSeasonKey(key) {
  return SEASON_KEYS.indexOf(key) !== -1;
}

/**
 * The season record for a (jurisdiction, key) pair, or null if either is
 * unrecognised. Frozen — do not mutate.
 */
export function seasonFor(jurisdictionCode, key) {
  const j = SEASONS[jurisdictionCode];
  if (!j) return null;
  return j[key] || null;
}

/**
 * Build the species-and-sex key the tables are indexed by from the two fields
 * a diary entry actually carries. Returns null when the pair cannot be
 * resolved — an unknown species, or a species whose card is sexed and an entry
 * that did not record a sex.
 *
 * Accepts the sex vocabularies used across the app: 'male'/'female' from the
 * diary form, and the species-specific 'stag'/'hind'/'buck'/'doe' the calendar
 * cards use.
 */
export function seasonKeyFor(speciesCode, sexCode) {
  const sp = String(speciesCode || '').toLowerCase().trim();
  const sx = String(sexCode || '').toLowerCase().trim();
  const antlered = { red: 'stag', sika: 'stag', fallow: 'buck', roe: 'buck', muntjac: 'buck', cwd: 'buck' }[sp];
  const female   = { red: 'hind', sika: 'hind', fallow: 'doe',  roe: 'doe',  muntjac: 'doe',  cwd: 'doe'  }[sp];
  if (!antlered) return null;
  let suffix = null;
  if (sx === 'male' || sx === 'stag' || sx === 'buck') suffix = antlered;
  else if (sx === 'female' || sx === 'hind' || sx === 'doe') suffix = female;
  if (!suffix) return null;
  return sp + '-' + suffix;
}

// ── Date arithmetic ───────────────────────────────────────────────────────

function dayNumber(month, day) { return month * 100 + day; }

/**
 * Is (month, day) inside an inclusive window that may wrap the year end?
 * Kept here rather than in the caller so that every surface in the app answers
 * the boundary days the same way. 21 October is open; 20 October is not.
 */
export function withinWindow(month, day, startMonth, startDay, endMonth, endDay) {
  const cur   = dayNumber(month, day);
  const start = dayNumber(startMonth, startDay);
  const end   = dayNumber(endMonth, endDay);
  return start <= end ? (cur >= start && cur <= end) : (cur >= start || cur <= end);
}

/**
 * Is the season open on this date?
 *
 *   true    — inside an open window, or no close season is prescribed
 *   false   — outside the open window
 *   null    — the statute has no row for this species here, so we do not know
 *
 * Null is a real answer and callers must render it as one. Nothing in this app
 * may turn "the order is silent" into a green light.
 */
export function isOpenOn(jurisdictionCode, key, month, day) {
  const s = seasonFor(jurisdictionCode, key);
  if (!s) return null;
  if (s.status === 'year-round') return true;
  if (s.status === 'not-listed') return null;
  return withinWindow(month, day, s.startMonth, s.startDay, s.endMonth, s.endDay);
}

/**
 * The months (1-12) in which the season is open on at least one day. Year
 * round gives all twelve; a species with no row gives none. This is the lossy
 * view the twelve-cell month bar on a calendar card draws, and it is derived
 * here rather than typed into the markup so that the bar and the OPEN/CLOSED
 * verdict above it can never disagree again.
 */
export function openMonthsFor(jurisdictionCode, key) {
  const s = seasonFor(jurisdictionCode, key);
  if (!s) return [];
  if (s.status === 'year-round') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (s.status === 'not-listed') return [];
  const out = [];
  for (let m = 1; m <= 12; m++) {
    // A month counts as open if any day in it is. Checking the 1st and the
    // 28th is not enough for a window that both opens and closes inside one
    // month, so walk to 31 and let withinWindow reject impossible dates by
    // simply never matching them.
    let any = false;
    for (let d = 1; d <= 31 && !any; d++) {
      if (withinWindow(m, d, s.startMonth, s.startDay, s.endMonth, s.endDay)) any = true;
    }
    if (any) out.push(m);
  }
  return out;
}

/** "1 Aug – 30 Apr", "No close season", or "Not listed in the schedule". */
export function seasonLabel(jurisdictionCode, key) {
  const s = seasonFor(jurisdictionCode, key);
  if (!s) return 'Unknown';
  if (s.status === 'year-round') return 'No close season';
  if (s.status === 'not-listed') return 'Not listed in the schedule';
  return s.startDay + ' ' + MONTH_ABBR[s.startMonth - 1] + ' – '
       + s.endDay + ' ' + MONTH_ABBR[s.endMonth - 1];
}

// ── Which jurisdiction is this? ───────────────────────────────────────────
//
// The app holds a latitude and longitude for a ground, a stand and a banner
// location, and until now derived nothing legal from any of them: the stalker
// picked their own jurisdiction from a dropdown on the ballistics page and
// nothing else in the app asked. Deriving it is worth doing and worth doing
// timidly, because the wrong answer here is the wrong law.
//
// The Anglo-Scottish border is approximated by the waypoints below, running
// west to east from the Solway to Berwick. A point is placed by interpolating
// the border latitude at its longitude — the border is monotonic in longitude
// across this span — and comparing. Inside BORDER_BAND_DEG of the line the
// answer is null, not a guess. Roughly six kilometres either side of the line
// this function declines to say, and the caller asks the stalker.

const ANGLO_SCOTTISH_BORDER = Object.freeze([
  Object.freeze([-3.06, 54.98]), Object.freeze([-3.00, 55.05]),
  Object.freeze([-2.83, 55.11]), Object.freeze([-2.69, 55.18]),
  Object.freeze([-2.55, 55.25]), Object.freeze([-2.43, 55.36]),
  Object.freeze([-2.33, 55.44]), Object.freeze([-2.24, 55.56]),
  Object.freeze([-2.17, 55.68]), Object.freeze([-2.09, 55.76]),
  Object.freeze([-2.03, 55.81]),
]);

const BORDER_BAND_DEG = 0.055;   // ~6 km of latitude

/** Latitude of the border at a given longitude, or null outside its span. */
function borderLatitudeAt(lng) {
  const pts = ANGLO_SCOTTISH_BORDER;
  if (lng < pts[0][0] || lng > pts[pts.length - 1][0]) return null;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (lng <= x1) {
      const t = x1 === x0 ? 0 : (lng - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

// ── Ireland ───────────────────────────────────────────────────────────────
//
// A bounding box cannot separate Northern Ireland from the Republic: they
// share a 500 km land border and one island. An earlier draft of this file
// tried, and placed Sligo in Northern Ireland and Dublin in England — two
// answers that would have handed a stalker the wrong statute, the wrong close
// season and the wrong minimum calibre in a country the app has no business
// advising in at all.
//
// So the whole island is decided by one polygon and nothing else. Inside it
// and clear of the land border, the answer is Northern Ireland. Anywhere else
// on the island — the Republic, or within about six kilometres of the border
// where a coarse polyline cannot be trusted — the answer is null, and the
// caller asks the stalker.
//
// The land border below is traced west to east from Lough Foyle to Carlingford
// Lough. It is a coarse reading of the line, good to a kilometre or two, which
// is exactly why the band around it is six.

const NI_LAND_BORDER = Object.freeze([
  Object.freeze([-7.25, 55.07]),   // Lough Foyle — the border meets the sea
  Object.freeze([-7.40, 54.93]),
  Object.freeze([-7.48, 54.83]),   // Strabane
  Object.freeze([-7.58, 54.72]),   // Castlederg
  Object.freeze([-7.75, 54.60]),
  Object.freeze([-7.95, 54.52]),
  Object.freeze([-8.17, 54.47]),   // Belleek — the westernmost point of NI
  Object.freeze([-8.10, 54.36]),   // Lough Melvin
  Object.freeze([-7.92, 54.27]),   // Belcoo
  Object.freeze([-7.70, 54.20]),   // Swanlinbar
  Object.freeze([-7.37, 54.16]),   // Newtownbutler
  Object.freeze([-7.24, 54.18]),   // Clones — Monaghan, all but surrounded
  Object.freeze([-7.28, 54.24]),   // the Rosslea salient, where the line doubles back
  Object.freeze([-7.10, 54.28]),   // Scotstown
  Object.freeze([-6.95, 54.30]),   // Glaslough
  Object.freeze([-6.83, 54.28]),   // Middletown
  Object.freeze([-6.70, 54.19]),   // Keady
  Object.freeze([-6.63, 54.03]),   // Crossmaglen
  Object.freeze([-6.35, 54.10]),   // Killeen — the A1 crossing
  Object.freeze([-6.23, 54.07]),   // Carlingford Lough — the border meets the sea
]);

// The coast, continuing clockwise from Carlingford Lough back to Lough Foyle.
// No band is applied to these edges: a ground a few hundred metres from the
// Antrim shore is in Antrim, and saying "ask" there would be a nuisance
// without being any safer.
const NI_COAST = Object.freeze([
  Object.freeze([-5.99, 54.05]),   // Kilkeel
  Object.freeze([-5.87, 54.20]),   // Dundrum Bay
  Object.freeze([-5.55, 54.24]),   // St John's Point
  Object.freeze([-5.53, 54.38]),   // Strangford
  Object.freeze([-5.43, 54.48]),   // Ards peninsula
  Object.freeze([-5.43, 54.60]),
  Object.freeze([-5.52, 54.67]),   // Donaghadee
  Object.freeze([-5.70, 54.83]),   // Islandmagee
  Object.freeze([-5.80, 54.98]),   // Glenarm
  Object.freeze([-6.04, 55.11]),   // Cushendun
  Object.freeze([-6.20, 55.22]),   // Fair Head
  Object.freeze([-6.55, 55.22]),   // the north coast
  Object.freeze([-6.95, 55.17]),   // Magilligan Point
]);

const NI_POLYGON = Object.freeze(NI_LAND_BORDER.concat(NI_COAST));

// A degree of longitude is about 0.58 of a degree of latitude at 54.5 N, so
// distances are measured with longitude scaled before they are compared to a
// band expressed in degrees of latitude.
const LNG_SCALE_NI = 0.581;

/** Shortest distance from a point to a segment, in degrees of latitude. */
function distanceToSegment(lng, lat, x0, y0, x1, y1) {
  const px = (lng - x0) * LNG_SCALE_NI, py = lat - y0;
  const vx = (x1 - x0) * LNG_SCALE_NI, vy = y1 - y0;
  const len2 = vx * vx + vy * vy;
  let t = len2 === 0 ? 0 : (px * vx + py * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - t * vx, dy = py - t * vy;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Ray casting. Points exactly on an edge are not worth arguing about — the
 *  band around the land border catches those that matter. */
function pointInPolygon(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat)
        && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** 'northern-ireland', or null for the Republic, the sea and the border band. */
function irelandVerdict(lat, lng) {
  if (!pointInPolygon(lng, lat, NI_POLYGON)) return null;
  for (let i = 1; i < NI_LAND_BORDER.length; i++) {
    const [x0, y0] = NI_LAND_BORDER[i - 1];
    const [x1, y1] = NI_LAND_BORDER[i];
    if (distanceToSegment(lng, lat, x0, y0, x1, y1) < BORDER_BAND_DEG) return null;
  }
  return 'northern-ireland';
}

// The Isle of Man is a Crown dependency with its own wildlife law, not part of
// England and Wales. It is small enough for a box and important enough not to
// be swept into one by accident.
const ISLE_OF_MAN = Object.freeze({ south: 54.02, north: 54.44, west: -4.86, east: -4.28 });

// The southern tip of Kintyre, with Sanda, lies west of the longitude that
// otherwise marks the Irish Sea. It is Argyll, it holds red deer, and it is
// nowhere near the Antrim coast: Fair Head is -6.20 and Rathlin -6.25, both
// well west of this box. Naming it explicitly keeps it out of the Irish test.
const KINTYRE_TIP = Object.freeze({ south: 55.22, north: 55.46, west: -5.92, east: -5.45 });

/**
 * Which legal regime governs a point?
 *
 * Returns 'england-wales', 'scotland', 'northern-ireland', or null when the
 * point is outside the UK, on a Crown dependency, or close enough to a border
 * that saying would be a guess. Null means ask; it never means assume.
 */
export function jurisdictionForLatLng(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Bishop Rock, 49.873, is the southernmost land in the United Kingdom, so the
  // floor sits just under it. It used to sit at 49.7, which let Alderney and the
  // Casquets in — the Channel Islands are Crown dependencies with their own
  // wildlife law and no wild deer, and answering "England & Wales" for one was
  // simply wrong.
  if (lat < 49.80 || lat > 61.0 || lng < -8.7 || lng > 2.1) return null;

  // The near Continent. A bounding box drawn round Great Britain has its
  // south-east corner in France, so Calais, Boulogne, Dieppe and the whole
  // Opal Coast used to come back as England & Wales, complete with a confident
  // statement of the Deer Act close season. Two cuts separate them, and the
  // margins are tight because the Strait of Dover is tight:
  //   · east of 1.0 E, anything below 51.0 N is French. Sangatte is 50.95 and
  //     Cap Gris-Nez 50.87; the nearest British land is Dungeness at 0.976 E,
  //     which is west of the cut by about a mile.
  //   · east of 1.0 W, anything below 50.4 N is French. Le Tréport, 50.06, is
  //     the northernmost point of that coast; Selsey Bill and Beachy Head, both
  //     50.7, are the southernmost British land in the same strip.
  if (lng >= 1.0 && lat < 51.0) return null;
  if (lng >= -1.0 && lat < 50.4) return null;

  if (lat >= ISLE_OF_MAN.south && lat <= ISLE_OF_MAN.north
      && lng >= ISLE_OF_MAN.west && lng <= ISLE_OF_MAN.east) return null;

  if (lat >= KINTYRE_TIP.south && lat <= KINTYRE_TIP.north
      && lng >= KINTYRE_TIP.west && lng <= KINTYRE_TIP.east) return 'scotland';

  // The island of Ireland and the water around it. Everything here is answered
  // by the polygon or not at all — a point in Donegal must never come back as
  // England, which is exactly what a bare longitude cut used to do.
  if (lng <= -5.45 && lat >= 51.3 && lat <= 55.45) return irelandVerdict(lat, lng);

  const borderLat = borderLatitudeAt(lng);
  if (borderLat == null) {
    // West of the Solway or east of Berwick: the border has met the sea, and
    // the coastline does the separating.
    if (lng < ANGLO_SCOTTISH_BORDER[0][0]) return lat > 54.99 ? 'scotland' : 'england-wales';
    return lat > 55.81 ? 'scotland' : 'england-wales';
  }
  if (lat > borderLat + BORDER_BAND_DEG) return 'scotland';
  if (lat < borderLat - BORDER_BAND_DEG) return 'england-wales';
  return null;   // in the band — ask, do not guess
}

// ── The question a stalker actually asks ──────────────────────────────────

/**
 * Is this animal in season?
 *
 * Advisory, never enforcement. Every branch that cannot answer returns
 * 'unknown' with a reason a person can act on, and no branch refuses to let a
 * cull be recorded. A stalker who has already taken a deer needs the record to
 * be true more than they need the app to have an opinion, and a deer taken
 * under a licence or an authorisation outside the season is a lawful deer that
 * still has to be written down.
 *
 * @param {object} q
 * @param {string} q.jurisdiction  one of the three codes, or null to derive
 * @param {number} [q.lat]         used only when jurisdiction is not given
 * @param {number} [q.lng]
 * @param {string} q.species       'red' | 'fallow' | 'roe' | 'sika' | 'muntjac' | 'cwd'
 * @param {string} q.sex           'male' | 'female' (or stag/hind/buck/doe)
 * @param {number} q.month         1-12
 * @param {number} q.day           1-31
 * @returns {{status:string, jurisdiction:(string|null), key:(string|null),
 *            label:string, headline:string, detail:(string|null)}}
 *   status: 'open' | 'closed' | 'unknown'
 */
export function checkCullSeason(q) {
  const o = q || {};
  const jurisdiction = isSeasonJurisdiction(o.jurisdiction)
    ? o.jurisdiction
    : jurisdictionForLatLng(o.lat, o.lng);

  const key = seasonKeyFor(o.species, o.sex);
  const jur = SEASON_JURISDICTIONS.find(j => j.code === jurisdiction) || null;
  const jurLabel = jur ? jur.label : null;

  if (!jurisdiction) {
    return {
      status: 'unknown', jurisdiction: null, key,
      label: 'Season not checked',
      headline: 'Season not checked',
      detail: 'The close season depends on where the deer was taken, and this entry has no location near enough to one jurisdiction to be sure. Set the jurisdiction to see the season.',
    };
  }
  if (!key) {
    return {
      status: 'unknown', jurisdiction, key: null,
      label: 'Season not checked',
      headline: 'Season not checked',
      detail: 'A close season depends on the sex of the animal as well as the species, and this entry does not record both.',
    };
  }

  const s = seasonFor(jurisdiction, key);
  const window = seasonLabel(jurisdiction, key);
  const open = isOpenOn(jurisdiction, key, o.month, o.day);

  if (open === null) {
    return {
      status: 'unknown', jurisdiction, key,
      label: window,
      headline: 'No close season is prescribed in ' + jurLabel,
      detail: (s && s.note) || null,
    };
  }
  if (s && s.status === 'year-round') {
    return {
      status: 'open', jurisdiction, key,
      label: window,
      headline: 'In season — no close season in ' + jurLabel,
      detail: (s && s.note) || null,
    };
  }
  if (open) {
    return {
      status: 'open', jurisdiction, key,
      label: window,
      headline: 'In season — ' + window + ' in ' + jurLabel,
      detail: null,
    };
  }
  return {
    status: 'closed', jurisdiction, key,
    label: window,
    headline: 'Outside the open season — ' + window + ' in ' + jurLabel,
    detail: 'Recorded anyway. A deer may be taken outside the season under a licence or an authorisation, and the record needs to be true either way — but if this date is a slip, it is worth correcting now.',
  };
}
