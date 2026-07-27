// First Light — lib/fl-geo.mjs
// =============================================================================
// PURE geometry for Grounds boundaries (GROUNDS-PLAN.md, G1). No DOM, no
// window, no network, no `new Date()`. Testable in Node with zero dependencies
// (tests/fl-geo.test.mjs).
//
// A boundary is a RING: [[lat, lng], …] — Leaflet's own coordinate order, so a
// stored ring feeds `L.polygon(ring)` verbatim. Rings are stored OPEN (first
// point NOT repeated at the end); normalizeRing() collapses an accidental
// closing duplicate, and every ring function also tolerates a closed ring (the
// duplicate edge contributes zero). All maths is spherical (R = 6371000,
// matching fl-forecast's distMeters) — at UK ground sizes the model error is
// far below the error of the drawing hand. Not antimeridian-safe (irrelevant
// for GB/IE).
//
// DB blob (ground_features.geometry — scripts/migrate-ground-features.sql):
//   { "v": 1, "ring": [[lat, lng], …] }
// Versioned like the score log: a future v2 can add holes / multi-ring without
// ambiguity. parseGeometry() is the ONLY reader — unknown versions return
// null and callers skip the row rather than guess.
// =============================================================================

import { distMeters } from './fl-forecast.mjs';

/** Client-side vertex cap per boundary (UI-enforced; not a security property). */
export var MAX_BOUNDARY_VERTICES = 500;

/** Feature kinds the client understands (mirrors the DB CHECK). */
export var GROUND_FEATURE_KINDS = Object.freeze(['boundary', 'no_shoot', 'line', 'marker']); // G9 + G10

/** G10: marker palette (mirrors HuntStand's, minus what stands already are).
 *  G10b adds the UK-stalking set the owner picked: Larder (every cull ends
 *  there) and Wallow (sika/red rut sign). Footpath was dropped from the marker
 *  set (2026-07-20) — a right-of-way is a route, not a point, so it lives only
 *  as a LINE subtype (see LINE_SUBTYPES), never a flag. Existing footpath
 *  markers normalise to 'other' on read (markerFromGeometry), so nothing breaks.
 *  Order = menu order. 'other' stays last — the honest catch-all flag.
 *
 *  Finding E (2026-07-26): TWO names, not one. `label` is what the thing is
 *  called when it stands ALONE — a GPX <sym>, a "Marker saved" toast, the name
 *  a nameless marker falls back to. `chip` is what the little pill beside a
 *  name says, where the parent noun is already on screen. One field could not
 *  serve both: a row reading "Water trough  Marker" is a stutter, and a type
 *  picker listing "Trail cam / Parking / … / Marker" reads as though the last
 *  one were a different kind of thing entirely. Only the catch-all needs both
 *  words, so `chip` is absent everywhere else and the readers fall back to
 *  `label` — which means a new type added without thinking about this is still
 *  correct in both places. */
export var GROUND_MARKER_TYPES = Object.freeze([
  { id: 'trail_cam', label: 'Trail cam' },
  { id: 'parking',   label: 'Parking' },
  { id: 'structure', label: 'Structure' },
  { id: 'gate',      label: 'Gate' },
  { id: 'larder',    label: 'Larder' },
  { id: 'wallow',    label: 'Wallow' },
  { id: 'other',     label: 'Marker', chip: 'Other' }
]);

/** G15: line subtypes — a "line" is not one thing. On a UK stalking ground the
 *  useful distinctions are: a RIDE (cut lane through woodland — the classic
 *  deer highway you sit over), a TRACK (vehicle/argo route — how the beast gets
 *  to the larder), a FOOTPATH (public right of way — legal access + the
 *  first-light hazard), and a COMPARTMENT edge (forestry block boundary). Order
 *  = menu order; 'other' stays last as the honest catch-all. The subtype rides
 *  INSIDE the geometry blob as `lt` (mirrors marker `mt`) — no DB migration,
 *  the kind column already says 'line'. `label`/`chip` split as per
 *  GROUND_MARKER_TYPES above — "Line" when it stands alone, "Other" in the pill
 *  beside a line's name, so a ground never shows two rows both labelled Line. */
export var LINE_SUBTYPES = Object.freeze([
  { id: 'ride',        label: 'Ride' },
  { id: 'track',       label: 'Track' },
  { id: 'footpath',    label: 'Footpath' },
  { id: 'compartment', label: 'Compartment' },
  { id: 'other',       label: 'Line', chip: 'Other' }
]);

export var M2_PER_HECTARE = 10000;
export var M2_PER_ACRE = 4046.8564224;

var EARTH_R = 6371000;            // metres — SPEC: same constant as fl-forecast
var RAD = Math.PI / 180;

// ── Ring maths ──────────────────────────────────────────────────────────────

/**
 * Spherical polygon area in m² (Chamberlain–Duquette, the Turf.js formula).
 * Winding direction is irrelevant (absolute value). Degenerate input → 0.
 */
export function ringAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  var n = ring.length;
  var total = 0;
  for (var i = 0; i < n; i++) {
    var p = ring[i], q = ring[(i + 1) % n];
    var lng1 = p[1] * RAD, lat1 = p[0] * RAD;
    var lng2 = q[1] * RAD, lat2 = q[0] * RAD;
    total += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  var area = Math.abs(total * EARTH_R * EARTH_R / 2);
  return isFinite(area) ? area : 0;
}

/** Open-path length in metres (consecutive legs only — NO closing leg).
 *  The measure tool's distance readout (G5); < 2 points → 0. */
export function pathLengthM(ring) {
  if (!Array.isArray(ring) || ring.length < 2) return 0;
  var total = 0;
  for (var i = 0; i < ring.length - 1; i++) {
    var d = distMeters(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
    if (d != null && isFinite(d)) total += d;
  }
  return total;
}

/** Ring perimeter in metres (haversine legs, including the closing leg). */
export function ringPerimeterM(ring) {
  if (!Array.isArray(ring) || ring.length < 2) return 0;
  var total = 0;
  for (var i = 0; i < ring.length; i++) {
    var a = ring[i], b = ring[(i + 1) % ring.length];
    var d = distMeters(a[0], a[1], b[0], b[1]);
    if (d != null && isFinite(d)) total += d;
  }
  return total;
}

/**
 * Polygon centroid as {lat, lng} — the label anchor. Computed with the
 * shoelace centroid in a local equirectangular frame (x = lng·cosφ̄, y = lat),
 * so it sits correctly inside long/thin and offset shapes; collinear or
 * near-zero-area rings fall back to the vertex mean. Empty input → null.
 */
export function ringCentroid(ring) {
  if (!Array.isArray(ring) || ring.length === 0) return null;
  var meanLat = 0, meanLng = 0, i;
  for (i = 0; i < ring.length; i++) { meanLat += ring[i][0]; meanLng += ring[i][1]; }
  meanLat /= ring.length; meanLng /= ring.length;
  if (ring.length < 3) return { lat: meanLat, lng: meanLng };
  var k = Math.cos(meanLat * RAD);
  if (!isFinite(k) || k === 0) return { lat: meanLat, lng: meanLng };
  var a2 = 0, cx = 0, cy = 0;
  var n = ring.length;
  for (i = 0; i < n; i++) {
    var p = ring[i], q = ring[(i + 1) % n];
    var x1 = p[1] * k, y1 = p[0];
    var x2 = q[1] * k, y2 = q[0];
    var cross = (x1 * y2) - (x2 * y1);
    a2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a2) < 1e-12) return { lat: meanLat, lng: meanLng };
  return { lat: cy / (3 * a2), lng: (cx / (3 * a2)) / k };
}

/**
 * Ray-casting point-in-polygon. Treats lat/lng as planar (fine at ground
 * scale). Points exactly ON an edge may return either — callers treat the
 * result as advisory (auto-fill suggestions), never as enforcement.
 */
export function pointInRing(lat, lng, ring) {
  if (lat == null || lng == null || !Array.isArray(ring) || ring.length < 3) return false;
  var inside = false;
  var n = ring.length;
  for (var i = 0, j = n - 1; i < n; j = i++) {
    var yi = ring[i][0], xi = ring[i][1];
    var yj = ring[j][0], xj = ring[j][1];
    if (((yi > lat) !== (yj > lat))
        && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Orientation sign of (a→b, a→c) in the planar lng/lat frame.
function orient(a, b, c) {
  var v = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
  if (v > 1e-15) return 1;
  if (v < -1e-15) return -1;
  return 0;
}

function onSegment(a, b, p) {
  return Math.min(a[1], b[1]) - 1e-15 <= p[1] && p[1] <= Math.max(a[1], b[1]) + 1e-15
      && Math.min(a[0], b[0]) - 1e-15 <= p[0] && p[0] <= Math.max(a[0], b[0]) + 1e-15;
}

function segmentsCross(a, b, c, d) {
  var o1 = orient(a, b, c);
  var o2 = orient(a, b, d);
  var o3 = orient(c, d, a);
  var o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/**
 * True when any two NON-ADJACENT edges cross (a "bowtie"). O(n²) — only run
 * at save/hint time, cheap at ≤ MAX_BOUNDARY_VERTICES. Advisory: the editor
 * shows a "boundary crosses itself" hint but never blocks the save
 * (ringAreaM2 on a crossed ring returns the net area).
 */
export function ringSelfIntersects(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  var n = ring.length;
  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      // Skip edges that share a vertex: consecutive pairs and the (first, last) wrap.
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

// ── Map label de-collision ─────────────────────────────────────────────────

/**
 * PURE (finding H): greedy label de-collision for a map's text pills.
 *
 * Ground names, feature-marker names and high-seat names are painted by three
 * unrelated code paths onto the same pane, each one blind to the other two.
 * At any zoom where two of them land within a few pixels the result was
 * simply overdrawn text — two names on top of each other, both unreadable,
 * and no clue that a second one was even there.
 *
 * The rule this implements is the one every serious map uses: lay the labels
 * out in priority order, keep a label only if its box is still clear, and
 * drop the ones that would collide. Dropped is the honest outcome — nudging a
 * ground name off its own parcel, or a seat name off its own seat, would move
 * the label onto something it does not describe. Zooming in separates the
 * anchors and every dropped label comes straight back.
 *
 * IMPORTANT: this is for TEXT ONLY. The caller must never feed it a glyph, a
 * pin or a score badge — losing a name costs you a word you can recover by
 * zooming; losing a marker costs you the knowledge that anything is there.
 *
 * @param {Array}  boxes  [{ id, x, y, w, h, rank }] — x/y is the label's
 *   CENTRE in container pixels, w/h its measured size, rank its importance
 *   (LOWER wins). Boxes with a non-finite or non-positive size are ignored
 *   entirely: an element that is not laid out neither hides nor is hidden.
 * @param {number} [pad] breathing room in px added to every side (default 3),
 *   so kept labels are separated rather than merely non-overlapping.
 * @returns {Array} the ids to hide, in the order they were given.
 *
 * O(n²) against the KEPT set, which is what actually fits on a phone screen —
 * a few dozen at worst, so the honest simple loop beats a spatial index.
 */
export function declutterLabels(boxes, pad) {
  var gap = (typeof pad === 'number' && isFinite(pad)) ? pad : 3;
  var items = [];
  (boxes || []).forEach(function(b, i) {
    if (!b || b.id == null) return;
    var x = Number(b.x), y = Number(b.y), w = Number(b.w), h = Number(b.h);
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return;
    if (w <= 0 || h <= 0) return;
    var r = Number(b.rank);
    items.push({
      id: b.id, i: i, rank: isFinite(r) ? r : 0,
      l: x - w / 2 - gap, r: x + w / 2 + gap,
      t: y - h / 2 - gap, b: y + h / 2 + gap
    });
  });
  // Ties break on input order, never on anything derived from the viewport,
  // so the same scene always drops the same labels — a set that reshuffled
  // as you panned would flicker, which is worse than the collision.
  items.sort(function(a, b) { return a.rank - b.rank || a.i - b.i; });
  var kept = [], hide = [];
  items.forEach(function(it) {
    for (var k = 0; k < kept.length; k++) {
      var o = kept[k];
      if (it.l < o.r && it.r > o.l && it.t < o.b && it.b > o.t) { hide.push(it); return; }
    }
    kept.push(it);
  });
  hide.sort(function(a, b) { return a.i - b.i; });
  return hide.map(function(it) { return it.id; });
}

// ── Normalisation, validation, storage blob ────────────────────────────────

/**
 * ONE coordinate rounder for the whole app (finding G). Ground geometry has
 * stored 6 dp from day one — ~0.11 m, finer than any consumer GPS will ever
 * be honest about — but stands arrived through three different doors at three
 * different precisions: a raw fifteen-decimal float from the pin picker, 5 dp
 * from the stands-map seed, 6 dp from a GPS fix. Two seats set on the same
 * spot by different routes then stored as different places, and neither
 * matched the boundary vertex they sat on.
 *
 * Exported so every writer rounds through the same function instead of each
 * one inventing its own toFixed. Non-finite input passes straight through
 * untouched: null and '' must stay null and '' so "no location set" can never
 * quietly become 0, 0 in the Gulf of Guinea.
 */
export function round6(v) {
  if (v == null || v === '') return v;
  var n = Number(v);
  if (!isFinite(n)) return v;
  return Math.round(n * 1e6) / 1e6;
}

function isValidPoint(p) {
  return Array.isArray(p) && p.length >= 2
    && typeof p[0] === 'number' && isFinite(p[0]) && p[0] >= -90 && p[0] <= 90
    && typeof p[1] === 'number' && isFinite(p[1]) && p[1] >= -180 && p[1] <= 180;
}

/**
 * Canonical form of a ring: coords rounded to 6 dp (≈ 0.11 m — below GPS and
 * finger accuracy, keeps the jsonb small and byte-stable), consecutive
 * duplicates collapsed, and a closing duplicate of the first point dropped.
 * Assumes valid points (run validateBoundaryRing first); non-array entries
 * are skipped defensively.
 */
export function normalizeRing(ring) {
  if (!Array.isArray(ring)) return [];
  var out = [];
  for (var i = 0; i < ring.length; i++) {
    var p = ring[i];
    if (!Array.isArray(p) || p.length < 2) continue;
    var pt = [round6(p[0]), round6(p[1])];
    var prev = out[out.length - 1];
    if (prev && prev[0] === pt[0] && prev[1] === pt[1]) continue;
    out.push(pt);
  }
  if (out.length > 1) {
    var first = out[0], last = out[out.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) out.pop();
  }
  return out;
}

/**
 * Save-time validation → { ok, reason }. reason ∈ 'not-a-ring' |
 * 'bad-coordinate' | 'too-few-points' | 'too-many-points' | null.
 * Self-intersection is deliberately NOT here (advisory only — see
 * ringSelfIntersects).
 */
export function validateBoundaryRing(ring) {
  if (!Array.isArray(ring)) return { ok: false, reason: 'not-a-ring' };
  for (var i = 0; i < ring.length; i++) {
    if (!isValidPoint(ring[i])) return { ok: false, reason: 'bad-coordinate' };
  }
  var norm = normalizeRing(ring);
  if (norm.length < 3) return { ok: false, reason: 'too-few-points' };
  if (norm.length > MAX_BOUNDARY_VERTICES) return { ok: false, reason: 'too-many-points' };
  return { ok: true, reason: null };
}

/** G9: a LINE is an open path — same point rules and vertex cap as a ring,
 *  but ≥2 points suffice and self-intersection is nobody's business (a ride
 *  may legitimately double back). Same {v:1, ring} blob; the feature's KIND
 *  carries the open/closed semantics. */
export function validateLinePath(path) {
  if (!Array.isArray(path)) return { ok: false, reason: 'not-a-ring' };
  for (var i = 0; i < path.length; i++) {
    if (!isValidPoint(path[i])) return { ok: false, reason: 'bad-coordinate' };
  }
  var norm = normalizeRing(path);
  if (norm.length < 2) return { ok: false, reason: 'too-few-points' };
  if (norm.length > MAX_BOUNDARY_VERTICES) return { ok: false, reason: 'too-many-points' };
  return { ok: true, reason: null };
}

/** Build the v1 storage blob from a (valid) ring. */
export function makeGeometry(ring) {
  return { v: 1, ring: normalizeRing(ring) };
}

/** G10: marker blob — the SAME v1 ring shape with exactly one point, plus
 *  `mt` (marker type id from GROUND_MARKER_TYPES). Keeping the ring shape
 *  means any generic reader tolerates the row; the kind column says 'marker'
 *  so nothing mistakes it for a parcel. */
export function makeMarkerGeometry(lat, lng, mtype) {
  var ring = normalizeRing([[lat, lng]]);
  var known = GROUND_MARKER_TYPES.some(function(t) { return t.id === mtype; });
  return { v: 1, ring: ring, mt: known ? mtype : 'other' };
}

/** G15: line blob — the SAME v1 ring shape as a boundary (an OPEN path of ≥2
 *  points), plus `lt` (line subtype id from LINE_SUBTYPES). Like the marker
 *  `mt`, the subtype rides in the blob so no DB migration is needed; the kind
 *  column already says 'line'. Unknown/absent subtypes normalise to 'other'. */
export function makeLineGeometry(ring, ltype) {
  var known = LINE_SUBTYPES.some(function(t) { return t.id === ltype; });
  return { v: 1, ring: normalizeRing(ring), lt: known ? ltype : 'other' };
}

/** G15: the subtype of a line geometry blob → a known LINE_SUBTYPES id, or
 *  'other' when absent/unknown. Every legacy line (saved before G15, no `lt`)
 *  reads as 'other', so nothing breaks. */
export function lineSubtypeOf(geom) {
  var lt = (geom && typeof geom === 'object' && !Array.isArray(geom)) ? geom.lt : null;
  var known = LINE_SUBTYPES.some(function(t) { return t.id === lt; });
  return known ? lt : 'other';
}

/** G15: the definition row for a line subtype id — always something, because
 *  an unknown id is the catch-all by definition. Exported so no caller has to
 *  hand-roll the same forEach lookup again (there were four of them). */
export function lineSubtypeDef(ltype) {
  var def = null;
  LINE_SUBTYPES.forEach(function(t) { if (t.id === ltype) def = t; });
  return def || LINE_SUBTYPES[LINE_SUBTYPES.length - 1];
}

/** G15: label for a line subtype id (falls back to the 'other' label). This is
 *  the STANDALONE name — 'Line' for the catch-all. See LINE_SUBTYPES. */
export function lineSubtypeLabel(ltype) {
  return lineSubtypeDef(ltype).label;
}

/** Finding E: the PILL text beside a line's own name — 'Other', not 'Line'.
 *  Identical to the label for every real subtype. */
export function lineSubtypeChip(ltype) {
  var d = lineSubtypeDef(ltype);
  return d.chip || d.label;
}

/** G10: the definition row for a marker type id — always something. */
export function markerTypeDef(mtype) {
  var def = null;
  GROUND_MARKER_TYPES.forEach(function(t) { if (t.id === mtype) def = t; });
  return def || GROUND_MARKER_TYPES[GROUND_MARKER_TYPES.length - 1];
}

/** G10: the STANDALONE name for a marker type — 'Marker' for the catch-all. */
export function markerTypeLabel(mtype) {
  return markerTypeDef(mtype).label;
}

/** Finding E: the PILL text beside a marker's own name — 'Other' for the
 *  catch-all, so a row never reads "Water trough  Marker". */
export function markerTypeChip(mtype) {
  var d = markerTypeDef(mtype);
  return d.chip || d.label;
}

/** G10: the ONLY reader of marker blobs → {lat, lng, type} or null. */
export function markerFromGeometry(geom) {
  if (!geom || typeof geom !== 'object' || Array.isArray(geom)) return null;
  if (geom.v !== 1 || !Array.isArray(geom.ring) || geom.ring.length < 1) return null;
  var p = geom.ring[0];
  if (!isValidPoint(p)) return null;
  var mt = geom.mt;
  var known = GROUND_MARKER_TYPES.some(function(t) { return t.id === mt; });
  return { lat: round6(p[0]), lng: round6(p[1]), type: known ? mt : 'other' };
}

/**
 * The ONLY reader of ground_features.geometry blobs. Returns the normalised
 * ring, or null for anything unknown/invalid (wrong version, junk, too few
 * points) — callers skip the row rather than guess.
 * G9: `minPts` (default 3) lets LINE readers accept 2-point paths without
 * loosening anything for polygon callers — a 2-point blob on a boundary row
 * still parses to null exactly as before.
 */
export function parseGeometry(geom, minPts) {
  if (!geom || typeof geom !== 'object' || Array.isArray(geom)) return null;
  if (geom.v !== 1) return null;
  var v = (minPts === 2) ? validateLinePath(geom.ring) : validateBoundaryRing(geom.ring);
  if (!v.ok) return null;
  return normalizeRing(geom.ring);
}

/** Area of a stored geometry blob (0 for invalid/unknown blobs). */
export function geometryAreaM2(geom) {
  var ring = parseGeometry(geom);
  return ring ? ringAreaM2(ring) : 0;
}

// ── Display formatting (deterministic; no Intl, no locale drift) ───────────

/**
 * AC (2026-07-26): the NUMBER a reader will actually see for one land value.
 * Under 10 that is one decimal; at 10 and over it is a whole number. Kept
 * separate from the string so totals can add the shown numbers rather than
 * re-rounding a hidden sum — a sheet that prints 25, 13 and 71 above a total
 * of 108 is doing arithmetic in front of the reader and failing it.
 */
function roundLandNumber(v) {
  if (typeof v !== 'number' || !isFinite(v) || v < 0) v = 0;
  if (v > 0 && v < 10) {
    var s = Math.round(v * 10) / 10;
    if (s < 10) return s;
    // fell through: 9.96+ rounds up to 10 — show it as an integer
  }
  return Math.round(v);
}

/** String form of an already-rounded land number, with thousands commas. */
function fmtLandNumber(v) {
  var r = (typeof v === 'number' && isFinite(v) && v > 0) ? Math.round(v * 10) / 10 : 0;
  if (r > 0 && r < 10) return r.toFixed(1);
  var whole = Math.round(r);
  // A SUM of shown parts can land on a decimal above 10 (8.5 + 4.2 = 12.7).
  // Keeping that decimal is the point: the column has to add up on screen.
  var body = (Math.abs(r - whole) < 0.05) ? String(whole) : r.toFixed(1);
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The shown value of an area in BOTH units, as numbers. Feed these to
 * sumLandParts() to add areas the way the reader adds them, then to
 * formatAreaParts() to print the result.
 */
export function landParts(m2) {
  var m = (typeof m2 === 'number' && isFinite(m2) && m2 > 0) ? m2 : 0;
  return { ha: roundLandNumber(m / M2_PER_HECTARE), ac: roundLandNumber(m / M2_PER_ACRE) };
}

/** Add shown areas. Takes landParts() objects, returns one of the same shape. */
export function sumLandParts(list) {
  var ha = 0, ac = 0;
  (list || []).forEach(function(p) {
    if (!p) return;
    if (typeof p.ha === 'number' && isFinite(p.ha)) ha += p.ha;
    if (typeof p.ac === 'number' && isFinite(p.ac)) ac += p.ac;
  });
  return { ha: Math.round(ha * 10) / 10, ac: Math.round(ac * 10) / 10 };
}

/**
 * Both land units, UK habit order: "86 ha · 213 acres". < 10 shows one
 * decimal ("1.4 ha · 3.5 acres"); ≥ 10 rounds to whole with thousands
 * commas. Singular "acre" when the formatted value is exactly 1 / 1.0.
 */
export function formatAreaParts(p) {
  var ha = fmtLandNumber(p ? p.ha : 0);
  var ac = fmtLandNumber(p ? p.ac : 0);
  var acUnit = (ac === '1' || ac === '1.0') ? 'acre' : 'acres';
  return ha + ' ha · ' + ac + ' ' + acUnit;
}

/** One area, formatted. Identical output to adding a single part. */
export function formatAreaBoth(m2) {
  return formatAreaParts(landParts(m2));
}

/** Perimeter-style distance: "850 m", "1.2 km", "12 km". */
export function formatDistM(m) {
  var v = (typeof m === 'number' && isFinite(m) && m > 0) ? m : 0;
  var rm = Math.round(v);
  if (rm < 1000) return rm + ' m';
  var km = v / 1000;
  var s = km < 10 ? km.toFixed(1) : String(Math.round(km));
  if (s.slice(-2) === '.0') s = s.slice(0, -2);
  return s + ' km';
}

// ── Import / export (G4 — GROUNDS-PLAN §6) ─────────────────────────────────
// Serializers + tolerant text parsers, all PURE (regex, no DOMParser — so
// they run in the Node suite). Import validation happens at save time via
// validateBoundaryRing; the parsers only extract candidate rings.

/**
 * Shared by both serialisers: drop keys whose value the app does not actually
 * have. A properties bag where `notes` is present means this feature HAS a
 * note — not that the table once had a column for one. Empty strings and empty
 * arrays count as absent; `false` and `0` do not.
 */
function withExtras(base, extras) {
  Object.keys(extras).forEach(function(k) {
    var v = extras[k];
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v) && !v.length) return;
    base[k] = v;
  });
  return base;
}

/** Human label for a shape kind — what a generic GeoJSON viewer puts in the
 *  balloon when it knows nothing about First Light. Finding M: this is the
 *  difference between "no_shoot" and something a keeper can read. */
export function groundKindLabel(kind) {
  if (kind === 'no_shoot') return 'No-shoot zone';
  if (kind === 'line') return 'Line';
  if (kind === 'marker') return 'Marker';
  return 'Boundary';
}

/**
 * The one name for a whole export: the ground itself when everything in the
 * file belongs to one, otherwise an honest count. Rides in the GPX <metadata>
 * and as the GeoJSON collection's `name`, so re-importing knows where it came
 * from without having to guess from the first track's title (which used to
 * produce grounds called "Home Farm — Main parcel").
 */
function exportDocName(features, stands) {
  var seen = [];
  function note(g) { if (g && seen.indexOf(g) === -1) seen.push(g); }
  (features || []).forEach(function(f) { if (f) note(f.ground); });
  (stands || []).forEach(function(x) { if (x) note(x.ground); });
  if (seen.length === 1) return seen[0];
  if (!seen.length) return 'First Light grounds';
  return 'First Light — ' + seen.length + ' grounds';
}

/**
 * GeoJSON FeatureCollection of every valid feature. RFC 7946 shapes: lon-lat
 * order, rings CLOSED (first position repeated last). Invalid/unknown geometry
 * blobs are skipped.
 * G8: optional `stands` ([{name, ground, lat, lng, …}]) ride along as Point
 * features (kind:'stand') — the export is the whole ground, not just its
 * outline. Legacy single-arg calls are unchanged.
 *
 * Finding L (2026-07-26): the properties bag used to be {ground, kind, name}
 * and nothing else, which threw away every fact a person actually writes down.
 * It now carries `notes` on everything that has one, `kind_label` so a viewer
 * that has never heard of this app still says "No-shoot zone" out loud,
 * `marker_type_label` beside `marker_type` (there was already a
 * `line_type_label` and no reason for the asymmetry), and — for the high seats
 * — `facing` and `bad_winds`, which are the two things a stalker checks before
 * walking to a seat and the two things this file was silently dropping.
 */
export function featuresToGeoJson(features, stands) {
  var out = { type: 'FeatureCollection', name: exportDocName(features, stands), features: [] };
  (features || []).forEach(function(f) {
    if (!f) return;
    if (f.kind === 'marker') { // G10: point feature with its type carried
      var mk = markerFromGeometry(f.geometry);
      if (!mk) return;
      out.features.push({
        type: 'Feature',
        properties: withExtras(
          { ground: f.ground || null, kind: 'marker', marker_type: mk.type, name: f.name || null },
          { marker_type_label: markerTypeLabel(mk.type), notes: f.notes || null }
        ),
        geometry: { type: 'Point', coordinates: [mk.lng, mk.lat] }
      });
      return;
    }
    var isLine = f.kind === 'line'; // G9: open path, not a polygon
    var ring = parseGeometry(f.geometry, isLine ? 2 : undefined);
    if (!ring) return;
    var coords = ring.map(function(p) { return [p[1], p[0]]; });
    if (isLine) {
      var lsub = lineSubtypeOf(f.geometry); // G15: typed route (ride/track/footpath/…)
      out.features.push({
        type: 'Feature',
        properties: withExtras({
          ground: f.ground || null, kind: 'line',
          line_type: lsub, line_type_label: lineSubtypeLabel(lsub),
          name: f.name || null
        }, { notes: f.notes || null }),
        geometry: { type: 'LineString', coordinates: coords }
      });
      return;
    }
    coords.push([ring[0][1], ring[0][0]]);
    var kind = f.kind || 'boundary';
    out.features.push({
      type: 'Feature',
      properties: withExtras(
        { ground: f.ground || null, kind: kind, kind_label: groundKindLabel(kind), name: f.name || null },
        { notes: f.notes || null }
      ),
      geometry: { type: 'Polygon', coordinates: [coords] }
    });
  });
  (stands || []).forEach(function(s) {
    if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
    out.features.push({
      type: 'Feature',
      properties: withExtras(
        { ground: s.ground || null, kind: 'stand', name: s.name || null },
        {
          facing: Number.isFinite(s.facing) ? s.facing : null,
          facing_label: s.facingLabel || null,
          bad_winds: Array.isArray(s.badWinds) ? s.badWinds.slice() : null,
          notes: s.notes || null
        }
      ),
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] }
    });
  });
  return out;
}

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Finding N: our own namespace inside the GPX. GPX 1.1 has an <extensions>
 * element in exactly this spot for exactly this purpose — every handheld and
 * every mapping app ignores what it does not recognise, and our importer reads
 * it back exactly, so export → import is lossless instead of collapsing every
 * shape into a boundary. Nothing here is load-bearing for other software.
 */
var FL_GPX_NS = 'https://first-light.app/xmlns/gpx/1';

/** Serialise the fl: extension block, skipping anything we do not know. Six
 *  spaces of indent because the parent element sits at four. */
function flExtBlock(pairs) {
  var body = '';
  Object.keys(pairs).forEach(function(k) {
    var v = pairs[k];
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) { if (!v.length) return; v = v.join(','); }
    body += '      <fl:' + k + '>' + xmlEsc(v) + '</fl:' + k + '>\n';
  });
  return body ? '    <extensions>\n' + body + '    </extensions>\n' : '';
}

/** Join the parts of a <desc> with the separator used everywhere else in the
 *  app, dropping the blanks so a seat with nothing but a ground still reads
 *  "Home Farm" rather than "Home Farm ·  · ". */
function descLine(parts) {
  return parts.filter(function(x) { return x !== null && x !== undefined && x !== ''; }).join(' · ');
}

/**
 * GPX 1.1 text: one CLOSED <trk> per feature (GPX has no polygon type — a
 * closed track is the interchange convention every mapping app understands).
 * G8: optional `stands` become <wpt> WAYPOINTS — schema order puts wpt before
 * trk, and a Garmin/handheld imports them as named waypoints, so the high
 * seats load straight onto a GPS unit. Legacy single-arg calls unchanged.
 *
 * Finding M (2026-07-26): a no-shoot zone used to leave here as a plain <trk>
 * with nothing to tell it apart from a ride or a footpath — and only if it was
 * UNNAMED did the name carry the words "no-shoot zone" at all, so the one shape
 * in this app where mislabelling has a safety consequence was the one shape
 * most likely to be mislabelled. Three things fix it, deliberately belt and
 * braces because a handheld in a wood is not a place to be clever: the name now
 * LEADS with "NO-SHOOT — " (visible even where a device truncates a track list
 * to fifteen characters, and it sorts every zone to the top), <type> says
 * "No-shoot zone", and <desc> spells out what that means in a sentence.
 *
 * Finding L: <desc> also carries the notes, and a seat's facing and bad winds.
 */
export function featuresToGpx(features, stands) {
  var wpts = '';
  (stands || []).forEach(function(s) {
    if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
    var facingTxt = s.facingLabel ? 'looks ' + s.facingLabel
      : (Number.isFinite(s.facing) ? 'looks ' + Math.round(s.facing) + '°' : '');
    var badTxt = (Array.isArray(s.badWinds) && s.badWinds.length)
      ? 'bad winds: ' + s.badWinds.join(', ') : '';
    var desc = descLine([s.ground || '', facingTxt, badTxt, s.notes || '']);
    wpts += '  <wpt lat="' + s.lat + '" lon="' + s.lng + '">\n'
      + '    <name>' + xmlEsc(s.name || 'Stand') + '</name>\n'
      + (desc ? '    <desc>' + xmlEsc(desc) + '</desc>\n' : '')
      + '    <sym>Hunting Stand</sym>\n'
      + flExtBlock({
          ground: s.ground || '', kind: 'stand', name: s.name || '',
          facing: Number.isFinite(s.facing) ? String(Math.round(s.facing)) : '',
          bad_winds: Array.isArray(s.badWinds) ? s.badWinds : null,
          notes: s.notes || ''
        })
      + '  </wpt>\n';
  });
  var trks = '';
  (features || []).forEach(function(f) {
    if (!f) return;
    if (f.kind === 'marker') { // G10: markers are waypoints, like the seats
      var mk = markerFromGeometry(f.geometry);
      if (!mk) return;
      var tlabel = markerTypeLabel(mk.type);
      var mdesc = descLine([(f.ground || '') + (f.ground ? ' — ' : '') + tlabel, f.notes || '']);
      wpts += '  <wpt lat="' + mk.lat + '" lon="' + mk.lng + '">\n'
        + '    <name>' + xmlEsc(f.name || tlabel) + '</name>\n'
        + (mdesc ? '    <desc>' + xmlEsc(mdesc) + '</desc>\n' : '')
        + '    <sym>' + xmlEsc(tlabel) + '</sym>\n'
        + flExtBlock({
            ground: f.ground || '', kind: 'marker', marker_type: mk.type,
            name: f.name || '', notes: f.notes || ''
          })
        + '  </wpt>\n';
      return;
    }
    var isLine = f.kind === 'line'; // G9: open track — no closing point
    var isZone = f.kind === 'no_shoot';
    var ring = parseGeometry(f.geometry, isLine ? 2 : undefined);
    if (!ring) return;
    var lineLabel = isLine ? lineSubtypeLabel(lineSubtypeOf(f.geometry)) : null; // G15
    var name = isZone
      ? ('NO-SHOOT — ' + (f.ground || 'Ground') + (f.name ? ' — ' + f.name : ''))
      : ((f.ground || 'Ground')
         + (f.name ? ' — ' + f.name : (isLine ? ' — ' + lineLabel : '')));
    var typeTxt = isLine ? lineLabel : groundKindLabel(f.kind || 'boundary');
    var desc = descLine([
      isZone ? 'No-shoot zone — do not shoot into or across this area.' : '',
      f.notes || ''
    ]);
    var seq = isLine ? ring : ring.concat([ring[0]]);
    var pts = seq.map(function(p) {
      return '      <trkpt lat="' + p[0] + '" lon="' + p[1] + '"></trkpt>';
    }).join('\n');
    // GPX 1.1 element order inside <trk>: name, cmt, desc, src, link, number,
    // type, extensions, trkseg. Out of order and strict validators reject the
    // whole file, so this sequence is not cosmetic.
    trks += '  <trk>\n    <name>' + xmlEsc(name) + '</name>\n'
      + (desc ? '    <desc>' + xmlEsc(desc) + '</desc>\n' : '')
      + '    <type>' + xmlEsc(typeTxt) + '</type>\n'
      + flExtBlock({
          ground: f.ground || '', kind: f.kind || 'boundary',
          line_type: isLine ? lineSubtypeOf(f.geometry) : '',
          name: f.name || '', notes: f.notes || ''
        })
      + '    <trkseg>\n'
      + pts + '\n    </trkseg>\n  </trk>\n';
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<gpx version="1.1" creator="First Light Cull Diary"'
    + ' xmlns="http://www.topografix.com/GPX/1/1" xmlns:fl="' + FL_GPX_NS + '">\n'
    + '  <metadata>\n    <name>' + xmlEsc(exportDocName(features, stands)) + '</name>\n  </metadata>\n'
    + wpts + trks + '</gpx>\n';
}

// ── KML EXPORT (finding AM) ────────────────────────────────────────────────
// AM (2026-07-26): the app exported GeoJSON and GPX and nothing else, and GPX
// has no polygon type — so a boundary, the single most important thing on a
// stalking ground, left this app as an open <trk> and arrived in Google Earth
// as a piece of string. KML is the format the rest of the world hands a keeper
// or an agent: Google Earth opens it, OS Maps opens it, HuntStand and onX read
// it, every GIS on earth reads it, and it has real polygons with real fill. It
// also carries our own <ExtendedData>, which the importer above already knows
// how to read, so a KML round-trip is lossless in a way the GPX one cannot be.

/** #rrggbb → KML's aabbggrr. Yes, backwards; that is the format. */
function kmlColor(hex, alpha) {
  var h = String(hex || '').replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(h)) h = 'd8b054';
  return (alpha || 'ff') + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
}

/** The line colours the app itself paints with, so the file looks like the app. */
var KML_LINE_COLORS = {
  ride: '#6e9a34', track: '#a9762f', footpath: '#4f7fc0',
  compartment: '#8a5fb0', other: '#8a8a8a'
};
var KML_BOUNDARY = '#d8b054', KML_ZONE = '#c62828', KML_STAND = '#6fbfb0';

/** One <Style>. width in pixels; fill only for the shapes that enclose land. */
function kmlStyle(id, color, width, fillAlpha, icon) {
  return '  <Style id="' + id + '">\n'
    + '    <LineStyle><color>' + kmlColor(color) + '</color><width>' + width + '</width></LineStyle>\n'
    + (fillAlpha
        ? '    <PolyStyle><color>' + kmlColor(color, fillAlpha) + '</color><fill>1</fill><outline>1</outline></PolyStyle>\n'
        : '    <PolyStyle><fill>0</fill><outline>1</outline></PolyStyle>\n')
    + (icon ? '    <IconStyle><color>' + kmlColor(color) + '</color><scale>1.1</scale>'
        + '<Icon><href>https://maps.google.com/mapfiles/kml/shapes/' + icon + '.png</href></Icon></IconStyle>\n' : '')
    + '  </Style>\n';
}

/** Our own fields as <ExtendedData>, whitelisted exactly like the GPX block. */
function kmlExtBlock(pairs) {
  var body = '';
  Object.keys(pairs).forEach(function(k) {
    var v = pairs[k];
    if (v === null || v === undefined || v === '') return;
    if (Array.isArray(v)) { if (!v.length) return; v = v.join(','); }
    body += '        <Data name="' + k + '"><value>' + xmlEsc(v) + '</value></Data>\n';
  });
  return body ? '      <ExtendedData>\n' + body + '      </ExtendedData>\n' : '';
}

/** "lat,lng" pairs → KML's lng,lat,0 whitespace-separated coordinate string. */
function kmlCoordText(ring) {
  return ring.map(function(p) { return p[1] + ',' + p[0] + ',0'; }).join(' ');
}

function kmlPlacemark(name, desc, styleId, ext, geom) {
  return '      <Placemark>\n'
    + '        <name>' + xmlEsc(name) + '</name>\n'
    + (desc ? '        <description>' + xmlEsc(desc) + '</description>\n' : '')
    + '        <styleUrl>#' + styleId + '</styleUrl>\n'
    + kmlExtBlock(ext).replace(/^ {6}/gm, '        ')
    + geom
    + '      </Placemark>\n';
}

/**
 * KML 2.2 text. One <Folder> per ground, because that is how Google Earth's
 * sidebar becomes a usable index of your land rather than a flat list of forty
 * shapes. Boundaries and no-shoot zones are real <Polygon>s with fill;
 * lines are <LineString>s in their own subtype's colour; markers and high
 * seats are <Point>s.
 *
 * Finding M's reasoning carries over verbatim: a no-shoot zone leads its name
 * with "NO-SHOOT — " and says in its description what that means, because a
 * mislabelled zone is the one mistake in this file with a safety consequence,
 * and the person reading it in Google Earth has never seen this app.
 */
export function featuresToKml(features, stands) {
  var folders = {}, order = [];
  function bucket(g) {
    var key = g || '(unassigned)';
    if (!folders[key]) { folders[key] = ''; order.push(key); }
    return key;
  }

  (features || []).forEach(function(f) {
    if (!f) return;
    if (f.kind === 'marker') {
      var mk = markerFromGeometry(f.geometry);
      if (!mk) return;
      var tlabel = markerTypeLabel(mk.type);
      folders[bucket(f.ground)] += kmlPlacemark(
        f.name || tlabel,
        descLine([tlabel, f.notes || '']),
        'fl-marker',
        { ground: f.ground || '', kind: 'marker', marker_type: mk.type, name: f.name || '', notes: f.notes || '' },
        '        <Point><coordinates>' + mk.lng + ',' + mk.lat + ',0</coordinates></Point>\n'
      );
      return;
    }
    var isLine = f.kind === 'line';
    var isZone = f.kind === 'no_shoot';
    var ring = parseGeometry(f.geometry, isLine ? 2 : undefined);
    if (!ring) return;
    if (isLine) {
      var lsub = lineSubtypeOf(f.geometry);
      folders[bucket(f.ground)] += kmlPlacemark(
        f.name || lineSubtypeLabel(lsub),
        descLine([lineSubtypeLabel(lsub), f.notes || '']),
        'fl-line-' + (KML_LINE_COLORS[lsub] ? lsub : 'other'),
        { ground: f.ground || '', kind: 'line', line_type: lsub, name: f.name || '', notes: f.notes || '' },
        '        <LineString><tessellate>1</tessellate><coordinates>'
          + kmlCoordText(ring) + '</coordinates></LineString>\n'
      );
      return;
    }
    var closed = ring.concat([ring[0]]);
    folders[bucket(f.ground)] += kmlPlacemark(
      isZone ? ('NO-SHOOT — ' + (f.name || f.ground || 'zone')) : (f.name || groundKindLabel(f.kind || 'boundary')),
      descLine([
        isZone ? 'No-shoot zone — do not shoot into or across this area.' : groundKindLabel(f.kind || 'boundary'),
        f.notes || ''
      ]),
      isZone ? 'fl-zone' : 'fl-boundary',
      { ground: f.ground || '', kind: f.kind || 'boundary', name: f.name || '', notes: f.notes || '' },
      '        <Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>'
        + kmlCoordText(closed) + '</coordinates></LinearRing></outerBoundaryIs></Polygon>\n'
    );
  });

  (stands || []).forEach(function(s) {
    if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
    var facingTxt = s.facingLabel ? 'looks ' + s.facingLabel
      : (Number.isFinite(s.facing) ? 'looks ' + Math.round(s.facing) + '°' : '');
    var badTxt = (Array.isArray(s.badWinds) && s.badWinds.length)
      ? 'bad winds: ' + s.badWinds.join(', ') : '';
    folders[bucket(s.ground)] += kmlPlacemark(
      s.name || 'High seat',
      descLine(['High seat', facingTxt, badTxt, s.notes || '']),
      'fl-stand',
      {
        ground: s.ground || '', kind: 'stand', name: s.name || '',
        facing: Number.isFinite(s.facing) ? String(Math.round(s.facing)) : '',
        bad_winds: Array.isArray(s.badWinds) ? s.badWinds : null,
        notes: s.notes || ''
      },
      '        <Point><coordinates>' + s.lng + ',' + s.lat + ',0</coordinates></Point>\n'
    );
  });

  var styles = kmlStyle('fl-boundary', KML_BOUNDARY, 3, '33')
    + kmlStyle('fl-zone', KML_ZONE, 3, '4d')
    + kmlStyle('fl-marker', '#8a8a8a', 2, '', 'placemark_circle')
    + kmlStyle('fl-stand', KML_STAND, 2, '', 'ranger_station');
  Object.keys(KML_LINE_COLORS).forEach(function(id) {
    styles += kmlStyle('fl-line-' + id, KML_LINE_COLORS[id], 4, '');
  });

  var body = '';
  order.forEach(function(g) {
    body += '    <Folder>\n      <name>' + xmlEsc(g) + '</name>\n' + folders[g] + '    </Folder>\n';
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n'
    + '    <name>' + xmlEsc(exportDocName(features, stands)) + '</name>\n'
    + styles + body
    + '  </Document>\n</kml>\n';
}

// ── KMZ (finding AG) ───────────────────────────────────────────────────────
// AG (2026-07-26): Google Earth's own Save Place As writes .kmz by default, and
// a KMZ is nothing more than a zip with a .kml inside it. The file picker
// refused the extension outright, so the commonest way a person actually has
// their ground on disk was the one way this app would not take it — and the
// error they got was the silent one where the file simply cannot be selected.
// A zip's central directory is forty-six bytes of header per entry and the
// payload is raw deflate, which every browser has had in DecompressionStream
// since 2023. No library, no dependency, ninety lines.

function zipU16(dv, o) { return dv.getUint16(o, true); }
function zipU32(dv, o) { return dv.getUint32(o, true); }

/** True when these bytes begin with a local file header — i.e. are a zip. */
export function looksLikeZip(buf) {
  var b = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf || []);
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);
}

/**
 * The KML document inside a KMZ, as text. Prefers doc.kml (the convention),
 * then any .kml at the archive root, then the first .kml anywhere; __MACOSX
 * resource forks are ignored because a Mac-zipped archive is full of them.
 * Throws with a plain-English message the caller can show verbatim.
 */
export async function kmzToKmlText(buf) {
  var bytes = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
  if (!looksLikeZip(bytes)) throw new Error('That .kmz is not a zip archive');
  var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var eocd = -1;
  var floor = Math.max(0, bytes.length - 22 - 65535);
  for (var i = bytes.length - 22; i >= floor; i--) {
    if (zipU32(dv, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That .kmz looks damaged — no zip index in it');
  var count = zipU16(dv, eocd + 10);
  var cdOff = zipU32(dv, eocd + 16);
  var dec = new TextDecoder('utf-8');
  var best = null, p = cdOff;
  for (var k = 0; k < count && p + 46 <= bytes.length; k++) {
    if (zipU32(dv, p) !== 0x02014b50) break;
    var nameLen = zipU16(dv, p + 28), extraLen = zipU16(dv, p + 30), cmtLen = zipU16(dv, p + 32);
    var name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    var lc = name.toLowerCase();
    if (/\.kml$/.test(lc) && lc.indexOf('__macosx/') !== 0) {
      var rank = (lc === 'doc.kml' ? 0 : (lc.indexOf('/') === -1 ? 1 : 2));
      if (!best || rank < best.rank) {
        best = { rank: rank, method: zipU16(dv, p + 10), csize: zipU32(dv, p + 20), lho: zipU32(dv, p + 42) };
      }
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  if (!best) throw new Error('No map inside that .kmz — it holds no .kml file');
  var lp = best.lho;
  if (zipU32(dv, lp) !== 0x04034b50) throw new Error('That .kmz looks damaged — bad entry header');
  var dataAt = lp + 30 + zipU16(dv, lp + 26) + zipU16(dv, lp + 28);
  // A zip64 or streamed entry writes 0xFFFFFFFF / 0 for the size in the index;
  // the payload still ends where the central directory starts.
  var size = (best.csize && best.csize !== 0xFFFFFFFF) ? best.csize : Math.max(0, cdOff - dataAt);
  var payload = bytes.subarray(dataAt, dataAt + size);
  if (best.method === 0) return dec.decode(payload);
  if (best.method !== 8) throw new Error('That .kmz uses a compression this app cannot read');
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot unzip a .kmz — try the .kml instead');
  var ds = new DecompressionStream('deflate-raw');
  var w = ds.writable.getWriter();
  w.write(payload); w.close();
  return await new Response(ds.readable).text();
}

// ── IMPORT PARSERS (finding N) ─────────────────────────────────────────────
// Export then import used to be lossy in the one way that mattered: every
// track in the file came back as `kind:'boundary'`, so a ride, a footpath and
// a no-shoot zone all landed as land you own. An app that cannot read its own
// file is not exporting, it is discarding with extra steps.
//
// Evidence is read in three ranks, most trustworthy first:
//   1. Our own writing — `<fl:*>` GPX extensions, KML <ExtendedData>, GeoJSON
//      `properties.kind`. Exact, no guessing, and this is what makes a
//      round-trip through First Light lossless.
//   2. The file's own semantics — GPX <type>, GeoJSON geometry type.
//   3. Nothing at all. An anonymous <trk>, <rte> or KML LineString with no
//      type and no extensions is STILL imported as a boundary, exactly as it
//      always was. That is not really a fallback, it is the original feature:
//      "trace the wood on OS Maps, export it, import it here" is the flow the
//      importer was built for and it must keep behaving to the letter.
//
// Rank 3 is deliberately conservative — nothing is ever reclassified AWAY
// from boundary on a guess. KML and GPX cannot tell a traced boundary from a
// traced path, so where the file is silent the historical reading wins, and
// the importer's toast reports what it made so nothing changes silently.
// GeoJSON is the exception: it has no legacy here and it is a precise format,
// so a LineString with no `kind` is read as a line.
//
// Points are purely additive. A <wpt> or KML <Point> used to be dropped on
// the floor; now it becomes a marker (or, if it carries Garmin's "Hunting
// Stand" symbol, is recognised as a seat). Nothing that used to import one
// way now imports another.

var FL_EXT_KEYS = ['ground', 'kind', 'name', 'notes', 'line_type', 'marker_type',
                   'facing', 'bad_winds'];
var IMPORT_KIND_SET = { boundary: 1, no_shoot: 1, line: 1, marker: 1, stand: 1 };

/** Free text → one of our kind ids, or '' when the text means nothing to us. */
function normKind(v) {
  var k = String(v == null ? '' : v).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (k === 'noshoot' || k === 'no_shoot_zone') k = 'no_shoot';
  return IMPORT_KIND_SET[k] ? k : '';
}

/**
 * Unwrap CDATA, then decode entities in ONE pass. One pass is the whole point:
 * decoding &amp; before &lt; would turn the literal text "&lt;" into "<" and
 * silently corrupt any note a user wrote about a measurement.
 */
var XML_ENTS = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
function decodeXmlText(v) {
  return String(v == null ? '' : v)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, function(whole, body) {
      if (body.charAt(0) === '#') {
        var n = body.charAt(1) === 'x' || body.charAt(1) === 'X'
          ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return isFinite(n) && n > 0 ? String.fromCharCode(n) : whole;
      }
      var hit = XML_ENTS[body.toLowerCase()];
      return hit === undefined ? whole : hit;
    })
    .trim();
}

/**
 * Walk every `<tag …>…</tag>` in a string, calling cb(innerText, attrString).
 * A SELF-CLOSING `<tag …/>` yields an empty inner string — which is the whole
 * reason this exists rather than a one-line regex. The obvious
 * `<tag[^>]*>([\s\S]*?)<\/tag>` pairs a self-closing waypoint with the NEXT
 * waypoint's closing tag and swallows it whole, so a file whose first wpt is
 * self-closing loses its second wpt. Not nested-safe, which is fine: none of
 * the tags scanned here can contain another of the same name.
 */
function eachElem(s, tag, cb) {
  var open = new RegExp('<' + tag + '\\b([^>]*?)(\\/?)>', 'gi');
  var close = new RegExp('<\\/' + tag + '\\s*>', 'gi');
  var m;
  while ((m = open.exec(s))) {
    var attrs = m[1] || '';
    if (m[2] === '/') { cb('', attrs); continue; }
    close.lastIndex = open.lastIndex;
    var c = close.exec(s);
    if (!c) { cb(s.slice(open.lastIndex), attrs); break; }
    cb(s.slice(open.lastIndex, c.index), attrs);
    open.lastIndex = c.index;
  }
}

/** Decoded text of the first `<tag>` inside a block; '' when absent. */
function tagText(block, tag) {
  var m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '\\s*>', 'i')
    .exec(String(block || ''));
  return m ? decodeXmlText(m[1]) : '';
}

/**
 * Read our own fields back out of a GPX <extensions> block. Whitelisted by
 * name and prefix-agnostic: some tools rewrite or drop namespace prefixes on
 * the way through, and a foreign extension that happens to be called
 * "bad_winds" is not a thing that exists.
 */
function flExtOf(block) {
  var out = {};
  var ex = /<extensions\b[^>]*>([\s\S]*?)<\/extensions\s*>/i.exec(String(block || ''));
  if (!ex) return out;
  FL_EXT_KEYS.forEach(function(k) {
    var m = new RegExp('<(?:[A-Za-z_][\\w.-]*:)?' + k + '\\s*>([\\s\\S]*?)'
      + '<\\/(?:[A-Za-z_][\\w.-]*:)?' + k + '\\s*>', 'i').exec(ex[1]);
    if (m) out[k] = decodeXmlText(m[1]);
  });
  return out;
}

/** The same fields out of a KML <ExtendedData> block (Data or SimpleData). */
function kmlExtOf(block) {
  var out = {};
  var ed = /<ExtendedData\b[^>]*>([\s\S]*?)<\/ExtendedData\s*>/i.exec(String(block || ''));
  if (!ed) return out;
  var re = /<(?:[A-Za-z_][\w.-]*:)?(?:Simple)?Data\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?(?:Simple)?Data\s*>/gi;
  var m;
  while ((m = re.exec(ed[1]))) {
    var k = m[1].trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (FL_EXT_KEYS.indexOf(k) === -1) continue;
    var vm = /<(?:[A-Za-z_][\w.-]*:)?value\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?value\s*>/i.exec(m[2]);
    out[k] = decodeXmlText(vm ? vm[1] : m[2]);
  }
  return out;
}

function flNum(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
function flList(v) {
  if (Array.isArray(v)) v = v.join(',');
  return String(v == null ? '' : v).split(',')
    .map(function(x) { return String(x).trim(); })
    .filter(function(x) { return !!x; });
}
function optsWith(base, extra) {
  var o = {};
  Object.keys(base || {}).forEach(function(k) { o[k] = base[k]; });
  Object.keys(extra || {}).forEach(function(k) { o[k] = extra[k]; });
  return o;
}

/** An id, a standalone label or a chip → a marker type id, or '' if unknown. */
// ── NAME EVIDENCE (findings AH / AJ) ───────────────────────────────────────
// AH/AJ (2026-07-26): rank 2½. The ladder went "our own metadata, then the
// file's own semantics, then boundary", and everything in between fell through
// the gap — so a KML <LineString> a keeper had named "Access track" arrived as
// a 0.9 ha boundary, and a <Point> called "Gate off the lane" arrived as marker
// type Other. Both files HAD said what the thing was. They had just said it in
// the <name>, which is where a person writes it, rather than in a <type> or an
// <ExtendedData>, which is where a machine does. Reading only the machine's
// half of the file and then calling the result "nothing said" was the mistake.
//
// The rule is deliberately narrow, because the cost of guessing wrong used to
// be permanent. Only whole words count, so "Broad" is not a road and "Rider" is
// not a ride. A name that describes ENCLOSED LAND vetoes the pass outright, so
// "Boundary path" and "Wood" stay boundaries. And to change a KIND rather than
// merely a subtype the path must also be geometrically OPEN — a ring written as
// a LineString, which plenty of tools emit, is still a ring whatever it is
// called. Only a name that survives all three filters gets to speak.

/** Names that mean "this encloses ground" — they outrank any path word in them. */
var ENCLOSING_WORDS = /\b(boundar(?:y|ies)|perimeter|parcel|block|field|fields|wood|woods|copse|coppice|plantation|estate|beat|paddock|enclosure|zone|area|march|holding|permission)\b/i;

/** Whole-word path vocabulary → LINE_SUBTYPES id. Listed in priority order. */
var LINE_WORDS = [
  ['ride', /\b(ride|rides)\b/i],
  ['track', /\b(track|trackway|argo|argocat)\b/i],
  ['footpath', /\b(footpath|foot path|bridleway|bridle path|right of way|path|trail)\b/i],
  ['compartment', /\b(compartment|cpt|coupe)\b/i],
  ['other', /\b(route|access|lane|drive|driveway|road|ditch|dyke|hedge|hedgerow|fence|stream|beck|burn|walk)\b/i]
];

/** Whole-word marker vocabulary → GROUND_MARKER_TYPES id. Priority order. */
var MARKER_WORDS = [
  ['trail_cam', /\b(trail ?cam|trailcam|camera|cam)\b/i],
  ['larder', /\b(larder|chiller)\b/i],
  ['gate', /\b(gate|gateway)\b/i],
  ['wallow', /\b(wallow|wallows)\b/i],
  // Bare "park" is left out on purpose: "Deer park corner" is a place, not a
  // place to leave the truck.
  ['parking', /\b(parking|car ?park|park up|lay-?by)\b/i],
  ['structure', /\b(structure|barn|shed|hide|bothy|building|tower|byre|steading)\b/i]
];

/** First table entry whose pattern appears in `s` as a whole word, else ''. */
function wordHit(table, s) {
  var t = String(s || '');
  if (!t) return '';
  for (var i = 0; i < table.length; i++) if (table[i][1].test(t)) return table[i][0];
  return '';
}

/** AJ: a marker type from an exact id/label, else from words in a human name. */
export function markerTypeFromName(nm) { return normMarkerType(nm) || wordHit(MARKER_WORDS, nm); }

/** AH: a line subtype from an exact id/label, else from words in a human name. */
export function lineTypeFromName(nm) { return normLineType(nm) || wordHit(LINE_WORDS, nm); }

/**
 * AH: does this NAME, on this OPEN path, say "route, not parcel"? Returns a
 * LINE_SUBTYPES id, or '' to leave the legacy boundary reading exactly alone.
 */
function lineKindFromName(nm, isClosed) {
  var t = String(nm || '');
  if (!t || isClosed || ENCLOSING_WORDS.test(t)) return '';
  return wordHit(LINE_WORDS, t);
}

/** AH: same point at both ends → a ring, whichever element it was wrapped in. */
function ringIsClosed(raw) {
  if (!raw || raw.length < 4) return false;
  var a = raw[0], b = raw[raw.length - 1];
  return round6(a[0]) === round6(b[0]) && round6(a[1]) === round6(b[1]);
}

function normMarkerType(v) {
  var lc = String(v == null ? '' : v).trim().toLowerCase();
  if (!lc) return '';
  var hit = '';
  GROUND_MARKER_TYPES.forEach(function(t) {
    if (hit) return;
    if (t.id === lc || String(t.label).toLowerCase() === lc
      || String(t.chip || '').toLowerCase() === lc) hit = t.id;
  });
  return hit;
}
/** Same, for line subtypes. */
function normLineType(v) {
  var lc = String(v == null ? '' : v).trim().toLowerCase();
  if (!lc) return '';
  var hit = '';
  LINE_SUBTYPES.forEach(function(t) {
    if (hit) return;
    if (t.id === lc || String(t.label).toLowerCase() === lc
      || String(t.chip || '').toLowerCase() === lc) hit = t.id;
  });
  return hit;
}

/**
 * Rank 2 for GPX: what a <trk>/<rte> <type> (or a shouting name) tells us.
 * Returns null when the file said nothing we recognise — the caller then
 * falls to rank 3 and keeps the legacy boundary reading.
 */
function kindFromGpxType(typ, nm, isClosed) {
  if (/^\s*no[-_ ]?shoot\b/i.test(String(nm || ''))) return { kind: 'no_shoot', lineType: '' };
  var t = String(typ || '').trim();
  if (t) {
    var kt = normKind(t);
    if (kt === 'no_shoot' || kt === 'boundary') return { kind: kt, lineType: '' };
    if (kt === 'line') return { kind: 'line', lineType: '' };
    var lt = normLineType(t);
    if (lt) return { kind: 'line', lineType: lt };
  }
  // Rank 2½ (AH): a <trk> a person named "Access track" is a track, and the
  // only reason it used to arrive as a boundary is that nobody read the name.
  // An untyped, unnamed OS-Maps trace still falls through to rank 3 untouched.
  var named = lineKindFromName(nm, isClosed);
  return named ? { kind: 'line', lineType: named } : null;
}

/** AH: first and last <trkpt>/<rtept> identical → a ring, not a path. */
function gpxIsClosed(s, tag) {
  var re = new RegExp('<' + tag + '\\b[^>]*>', 'gi');
  var pts = [], m;
  while ((m = re.exec(s))) {
    var la = /lat="([^"]+)"|lat='([^']+)'/i.exec(m[0]);
    var lo = /lon="([^"]+)"|lon='([^']+)'/i.exec(m[0]);
    if (la && lo) pts.push([parseFloat(la[1] || la[2]), parseFloat(lo[1] || lo[2])]);
  }
  return ringIsClosed(pts);
}

/**
 * One imported feature — the shape diary.js turns into a row. `ring` is always
 * [[lat,lng],…] in Leaflet order: three or more points for a boundary or zone,
 * two or more for a line, exactly one for a marker or a stand. Everything else
 * is null when the file did not say.
 *
 * `source` records which RANK decided the kind — 'fl' (our own metadata),
 * 'native' (the file's own semantics) or 'default' (nothing said, so
 * boundary). The importer uses it to tell the user honestly how much of the
 * file it actually understood rather than implying it understood all of it.
 */
function importFeature(kind, ring, o) {
  o = o || {};
  return {
    kind: kind,
    ring: ring,
    ground: o.ground || null,
    name: o.name || null,
    notes: o.notes || null,
    lineType: o.lineType || null,
    markerType: o.markerType || null,
    facing: Number.isFinite(o.facing) ? o.facing : null,
    badWinds: (Array.isArray(o.badWinds) && o.badWinds.length) ? o.badWinds.slice() : null,
    source: o.source || 'default'
  };
}

/** KML "lon,lat[,alt] …" → RAW [[lat,lng],…], closing duplicate and all. AH
 *  needs to see that duplicate: it is the only thing separating a ring written
 *  as a LineString from a path, and normalizeRing eats it. */
function kmlCoordPairs(txt) {
  var ring = [];
  String(txt || '').trim().split(/\s+/).forEach(function(tok) {
    var parts = tok.split(',');
    var lng = parseFloat(parts[0]), lat = parseFloat(parts[1]);
    if (isFinite(lat) && isFinite(lng)) ring.push([lat, lng]);
  });
  return ring;
}

/** KML "lon,lat[,alt] lon,lat[,alt] …" → a normalised [[lat,lng],…] ring. */
function kmlCoords(txt) { return normalizeRing(kmlCoordPairs(txt)); }

/** Every <trkpt>/<rtept> in a block → a normalised ring (either attr order). */
function gpxPts(block, tag) {
  var ring = [];
  var re = new RegExp('<' + tag + '\\b[^>]*>', 'gi');
  var mm;
  while ((mm = re.exec(block))) {
    var attrs = mm[0];
    var latM = /lat="([^"]+)"/i.exec(attrs) || /lat='([^']+)'/i.exec(attrs);
    var lonM = /lon="([^"]+)"/i.exec(attrs) || /lon='([^']+)'/i.exec(attrs);
    if (!latM || !lonM) continue;
    var lat = parseFloat(latM[1]), lng = parseFloat(lonM[1]);
    if (isFinite(lat) && isFinite(lng)) ring.push([lat, lng]);
  }
  return normalizeRing(ring);
}

/**
 * GPX text → import features. Waypoints first (schema order, and it keeps the
 * ring order of the legacy parsers intact), then tracks, then routes.
 */
export function parseGpxFeatures(text) {
  var s = String(text || '');
  var out = [];

  eachElem(s, 'wpt', function(inner, attrs) {
    var latM = /lat="([^"]+)"/i.exec(attrs) || /lat='([^']+)'/i.exec(attrs);
    var lonM = /lon="([^"]+)"/i.exec(attrs) || /lon='([^']+)'/i.exec(attrs);
    if (!latM || !lonM) return;
    var pt = normalizeRing([[parseFloat(latM[1]), parseFloat(lonM[1])]]);
    if (!pt.length || !isValidPoint(pt[0])) return;
    var ext = flExtOf(inner);
    var hasExt = Object.keys(ext).length > 0;
    var sym = tagText(inner, 'sym');
    var nm = tagText(inner, 'name');
    var kind = normKind(ext.kind);
    var source = kind ? 'fl' : '';
    if (kind !== 'stand') kind = kind === 'marker' ? 'marker' : '';
    if (!kind) {
      if (/hunting stand|high seat|^\s*(stand|seat)\s*$/i.test(sym)) { kind = 'stand'; source = 'native'; }
      else { kind = 'marker'; source = normMarkerType(sym) ? 'native' : 'default'; }
    }
    out.push(importFeature(kind, pt, {
      ground: ext.ground || null,
      name: (hasExt ? ext.name : nm) || null,
      notes: (ext.notes || (hasExt ? '' : tagText(inner, 'desc'))) || null,
      markerType: kind === 'marker'
        // AJ: the <sym> first because a device that set one meant it, then the
        // name — a Garmin waypoint called "Gate off the lane" carries sym
        // "Flag, Blue", which tells us the colour of the flag and nothing else.
        ? (normMarkerType(ext.marker_type) || normMarkerType(sym) || markerTypeFromName(nm) || 'other') : null,
      facing: flNum(ext.facing),
      badWinds: flList(ext.bad_winds),
      source: source
    }));
  });

  eachElem(s, 'trk', function(inner) {
    var ext = flExtOf(inner);
    var hasExt = Object.keys(ext).length > 0;
    var nm = tagText(inner, 'name');
    var kind = normKind(ext.kind);
    if (kind === 'marker' || kind === 'stand') kind = '';
    var lineType = normLineType(ext.line_type);
    var source = 'fl';
    if (!kind) {
      var guess = kindFromGpxType(tagText(inner, 'type'), nm, gpxIsClosed(inner, 'trkpt'));
      if (guess) { kind = guess.kind; lineType = lineType || guess.lineType; source = 'native'; }
      else { kind = 'boundary'; source = 'default'; }
    }
    if (kind === 'line' && !lineType) lineType = 'other';
    var base = {
      ground: ext.ground || null,
      name: (hasExt ? ext.name : nm) || null,
      notes: (ext.notes || (hasExt ? '' : tagText(inner, 'desc'))) || null,
      lineType: kind === 'line' ? lineType : null,
      source: source
    };
    eachElem(inner, 'trkseg', function(seg) {
      var ring = gpxPts(seg, 'trkpt');
      if (ring.length >= 2) out.push(importFeature(kind, ring, base));
    });
  });

  eachElem(s, 'rte', function(inner) {
    var ext = flExtOf(inner);
    var hasExt = Object.keys(ext).length > 0;
    var nm = tagText(inner, 'name');
    var kind = normKind(ext.kind);
    if (kind === 'marker' || kind === 'stand') kind = '';
    var lineType = normLineType(ext.line_type);
    var source = 'fl';
    if (!kind) {
      var guess = kindFromGpxType(tagText(inner, 'type'), nm, gpxIsClosed(inner, 'rtept'));
      if (guess) { kind = guess.kind; lineType = lineType || guess.lineType; source = 'native'; }
      else { kind = 'boundary'; source = 'default'; }
    }
    if (kind === 'line' && !lineType) lineType = 'other';
    var ring = gpxPts(inner, 'rtept');
    if (ring.length < 2) return;
    out.push(importFeature(kind, ring, {
      ground: ext.ground || null,
      name: (hasExt ? ext.name : nm) || null,
      notes: (ext.notes || (hasExt ? '' : tagText(inner, 'desc'))) || null,
      lineType: kind === 'line' ? lineType : null,
      source: source
    }));
  });

  return out;
}

/**
 * KML text → import features, one pass per <Placemark>. Hole rings are never
 * imported as land: where a Polygon has an <outerBoundaryIs> only that ring is
 * taken. A Placemark that yielded a shape does not also yield its label Point,
 * which is what Google Earth writes alongside an area and what would otherwise
 * litter the ground with phantom markers.
 *
 * A file with no Placemarks at all falls back to sweeping every bare
 * <coordinates> block, exactly as this parser always has.
 */
export function parseKmlFeatures(text) {
  var s = String(text || '');
  var out = [];
  var sawPlacemark = false;

  eachElem(s, 'Placemark', function(pm) {
    sawPlacemark = true;
    var ext = kmlExtOf(pm);
    var hasExt = Object.keys(ext).length > 0;
    var nm = tagText(pm, 'name');
    var extKind = normKind(ext.kind);
    var shouts = /^\s*no[-_ ]?shoot\b/i.test(nm);
    var base = {
      ground: ext.ground || null,
      name: (hasExt ? (ext.name || nm) : nm) || null,
      // AM (2026-07-26): when the file carries our own ExtendedData, believe it
      // and stop — the same rule `name` on the line above has always used. Our
      // KML writer puts a human sentence in <description> ("No-shoot zone — do
      // not shoot into or across this area."), which is for the stranger opening
      // it in Google Earth, not for us; without this a zone with no notes came
      // back from a round trip with the safety warning saved as its note.
      notes: (ext.notes || (hasExt ? '' : tagText(pm, 'description'))) || null,
      source: extKind ? 'fl' : 'default'
    };
    var shaped = 0;

    function shapeKind(fallback) {
      if (extKind === 'boundary' || extKind === 'no_shoot' || extKind === 'line') return extKind;
      if (shouts) return 'no_shoot';
      return fallback;
    }

    eachElem(pm, 'Polygon', function(poly) {
      var rings = [];
      eachElem(poly, 'outerBoundaryIs', function(ob) {
        var r = kmlCoords(tagText(ob, 'coordinates'));
        if (r.length >= 3) rings.push(r);
      });
      if (!rings.length) {
        var r2 = kmlCoords(tagText(poly, 'coordinates'));
        if (r2.length >= 3) rings.push(r2);
      }
      rings.forEach(function(r) {
        var k = shapeKind('boundary');
        if (k === 'line') k = 'boundary';        // a polygon is not a path
        out.push(importFeature(k, r, optsWith(base, {
          source: extKind ? 'fl' : (shouts ? 'native' : 'default')
        })));
        shaped++;
      });
    });

    eachElem(pm, 'LineString', function(ls) {
      var raw = kmlCoordPairs(tagText(ls, 'coordinates'));
      var r = normalizeRing(raw);
      if (r.length < 2) return;
      // Rank 2½ (AH): when neither our metadata nor a shouting name has spoken,
      // an OPEN path whose name is a path word is a line. Rank 3 still catches
      // everything else, so a silent or a land-shaped name is still a boundary.
      var named = (extKind || shouts) ? '' : lineKindFromName(nm, ringIsClosed(raw));
      var k = named ? 'line' : shapeKind('boundary');
      out.push(importFeature(k, r, optsWith(base, {
        lineType: k === 'line'
          ? (normLineType(ext.line_type) || named || lineTypeFromName(nm) || 'other') : null,
        source: extKind ? 'fl' : ((shouts || named) ? 'native' : 'default')
      })));
      shaped++;
    });

    if (shaped) return;
    eachElem(pm, 'Point', function(ptEl) {
      var r = kmlCoords(tagText(ptEl, 'coordinates'));
      if (!r.length) return;
      var k = extKind === 'stand' ? 'stand' : 'marker';
      out.push(importFeature(k, [r[0]], optsWith(base, {
        markerType: k === 'marker'
          // AJ: "Gate off the lane" is a gate. The old exact match wanted the
          // name to BE the word "Gate" and nothing else, which no real file
          // ever is, so every imported point landed on Other.
          ? (normMarkerType(ext.marker_type) || markerTypeFromName(nm) || 'other') : null,
        facing: flNum(ext.facing),
        badWinds: flList(ext.bad_winds),
        source: extKind ? 'fl' : 'native'
      })));
    });
  });

  if (!sawPlacemark) {
    eachElem(s, 'coordinates', function(txt) {
      var r = kmlCoords(txt);
      if (r.length >= 2) out.push(importFeature('boundary', r, { source: 'default' }));
    });
  }
  return out;
}

/**
 * GeoJSON → import features. Accepts a FeatureCollection, a bare Feature, a
 * bare geometry or an array of any of those. Unlike KML and GPX this format
 * says what it means, and there is no legacy reading to protect, so a
 * LineString with no `properties.kind` is honestly read as a line.
 */
export function parseGeoJsonFeatures(text) {
  var obj;
  if (text && typeof text === 'object') obj = text;
  else { try { obj = JSON.parse(String(text || '')); } catch (e) { return []; } }
  if (!obj || typeof obj !== 'object') return [];
  var list = Array.isArray(obj) ? obj
    : (Array.isArray(obj.features) ? obj.features : [obj]);
  var out = [];

  function ll(c) {
    if (!Array.isArray(c) || c.length < 2) return null;
    var lng = parseFloat(c[0]), lat = parseFloat(c[1]);
    return (isFinite(lat) && isFinite(lng)) ? [lat, lng] : null;
  }
  function ringOf(arr) {
    var r = [];
    (Array.isArray(arr) ? arr : []).forEach(function(c) { var p = ll(c); if (p) r.push(p); });
    return normalizeRing(r);
  }

  list.forEach(function(f) {
    if (!f || typeof f !== 'object') return;
    var geom = f.geometry && typeof f.geometry === 'object' ? f.geometry
      : (f.type && f.coordinates ? f : null);
    if (!geom || !geom.type) return;
    var pr = (f.properties && typeof f.properties === 'object') ? f.properties : {};
    var extKind = normKind(pr.kind);
    var base = {
      ground: pr.ground || null,
      name: pr.name || null,
      notes: pr.notes || null,
      source: extKind ? 'fl' : 'native'
    };
    var gt = String(geom.type);

    if (gt === 'Polygon' || gt === 'MultiPolygon') {
      var polys = gt === 'Polygon' ? [geom.coordinates] : (geom.coordinates || []);
      (Array.isArray(polys) ? polys : []).forEach(function(poly) {
        var r = ringOf(poly && poly[0]);
        if (r.length < 3) return;
        out.push(importFeature(extKind === 'no_shoot' ? 'no_shoot' : 'boundary', r, base));
      });
    } else if (gt === 'LineString' || gt === 'MultiLineString') {
      var segs = gt === 'LineString' ? [geom.coordinates] : (geom.coordinates || []);
      (Array.isArray(segs) ? segs : []).forEach(function(seg) {
        var r = ringOf(seg);
        if (r.length < 2) return;
        var k = (extKind === 'boundary' || extKind === 'no_shoot') ? extKind : 'line';
        out.push(importFeature(k, r, optsWith(base, {
          lineType: k === 'line'
            ? (normLineType(pr.line_type) || normLineType(pr.line_type_label) || 'other') : null
        })));
      });
    } else if (gt === 'Point' || gt === 'MultiPoint') {
      var pts = gt === 'Point' ? [geom.coordinates] : (geom.coordinates || []);
      (Array.isArray(pts) ? pts : []).forEach(function(c) {
        var p = ll(c);
        if (!p) return;
        var r = normalizeRing([p]);
        if (!r.length || !isValidPoint(r[0])) return;
        var k = extKind === 'stand' ? 'stand' : 'marker';
        out.push(importFeature(k, r, optsWith(base, {
          markerType: k === 'marker'
            ? (normMarkerType(pr.marker_type) || normMarkerType(pr.marker_type_label) || 'other') : null,
          facing: flNum(pr.facing),
          badWinds: flList(pr.bad_winds)
        })));
      });
    }
  });
  return out;
}

/**
 * The one entry point the app uses: sniff the format from the CONTENT first
 * and the filename only as a tiebreak, because a .txt full of GPX is still
 * GPX and a .json that is actually KML is not worth failing over.
 * → { format: 'gpx'|'kml'|'geojson', features: […], docName: string|null }
 */
export function parseImportFeatures(text, filename) {
  var raw = String(text || '').replace(/^﻿/, '');
  var head = raw.slice(0, 4096).trim();
  var ext = String(filename || '').toLowerCase().split('.').pop();
  var fmt;
  if (head.charAt(0) === '{' || head.charAt(0) === '[') fmt = 'geojson';
  else if (/<kml\b|<Placemark\b/i.test(head)) fmt = 'kml';
  else if (/<gpx\b|<trk\b|<wpt\b|<rte\b/i.test(head)) fmt = 'gpx';
  else if (ext === 'geojson' || ext === 'json') fmt = 'geojson';
  else if (ext === 'kml' || ext === 'kmz') fmt = 'kml';
  else if (ext === 'gpx') fmt = 'gpx';
  else fmt = /<coordinates\b/i.test(raw) ? 'kml' : 'gpx';

  var features = fmt === 'geojson' ? parseGeoJsonFeatures(raw)
    : (fmt === 'kml' ? parseKmlFeatures(raw) : parseGpxFeatures(raw));

  var docName = null;
  if (fmt === 'geojson') {
    try {
      var o = JSON.parse(raw);
      if (o && typeof o.name === 'string' && o.name.trim()) docName = o.name.trim();
    } catch (e) { docName = null; }
  } else {
    docName = parseImportName(raw);
  }
  return { format: fmt, features: features, docName: docName };
}

function ringsOf(features) {
  var rings = [];
  features.forEach(function(f) {
    if (f && f.ring && f.ring.length >= 3) rings.push(f.ring);
  });
  return rings;
}

/**
 * Candidate boundary rings from KML text — now a thin view over
 * parseKmlFeatures so there is one parser in this file, not two that drift.
 * Returns [[lat,lng],…] rings, normalised, three points or more.
 */
export function parseKmlRings(text) { return ringsOf(parseKmlFeatures(text)); }

/** The same view over parseGpxFeatures: every trkseg and rte of ≥3 points. */
export function parseGpxRings(text) { return ringsOf(parseGpxFeatures(text)); }

/**
 * The name of a CONTAINER — <Document> or <Folder> — taken only from the head
 * of it, before the first child container or Placemark. A plain search for
 * <name> after <Document> finds the first Placemark's name instead, which is
 * exactly the bug AI is about.
 */
function containerHeadName(s, tag) {
  var m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)(?=<Folder\\b|<Placemark\\b|<Document\\b|$)', 'i').exec(s);
  return m ? (tagText(m[1], 'name') || '') : '';
}

/**
 * Best-effort display name for an imported file — the name the app offers as
 * the ground for anything the file did not place itself.
 *
 * AI (2026-07-26): this used to read the first Placemark and stop. A perfectly
 * ordinary Google Earth export of one estate — <Document><name>, one
 * <Folder><name>Hollybush Farm</name>, four shapes inside it — therefore
 * imported as a ground called "Main block", which is the name of the first
 * PARCEL. The file had the answer twice over at the top and the parser walked
 * past both. Containers first now, outside in, because a container is a
 * statement about the whole file and a Placemark is a statement about one
 * shape; a lone <Folder> beats <Document> because when there is exactly one it
 * is the more specific of the two, and when there are several the document
 * title is the only thing that describes all of them. The Placemark fallback
 * stays last so a bare list of shapes still gets a name rather than none.
 */
export function parseImportName(text) {
  var s = String(text || '');
  var folders = (s.match(/<Folder\b/gi) || []).length;
  if (folders === 1) { var fo = containerHeadName(s, 'Folder'); if (fo) return fo; }
  var doc = containerHeadName(s, 'Document');
  // Exporters that use the file name as the document title should not saddle a
  // ground with ".kml" on the end of it.
  if (doc) return doc.replace(/\.(kml|kmz|gpx|geojson|json)$/i, '').trim() || doc;
  if (folders > 1) { var fo2 = containerHeadName(s, 'Folder'); if (fo2) return fo2; }
  var md = /<metadata\b[^>]*>([\s\S]*?)<\/metadata\s*>/i.exec(s);
  if (md) { var b = tagText(md[1], 'name'); if (b) return b; }
  var pm = /<Placemark\b[\s\S]*?<name[^>]*>([\s\S]*?)<\/name\s*>/i.exec(s);
  if (pm) { var a = decodeXmlText(pm[1]); if (a) return a; }
  var tk = /<trk\b[\s\S]*?<name[^>]*>([\s\S]*?)<\/name\s*>/i.exec(s);
  if (tk) { var c = decodeXmlText(tk[1]); if (c) return c; }
  var an = /<name[^>]*>([\s\S]*?)<\/name\s*>/i.exec(s);
  if (an) { var d = decodeXmlText(an[1]); if (d) return d; }
  return null;
}

// ── OS NATIONAL GRID (finding 7) ───────────────────────────────────
// Decimal degrees are a storage format, not a place. "52.717, 0.641" is two
// numbers a stalker cannot carry to a paper map, read out over a radio, or
// give to a keeper, a vet or a police wildlife officer. An OS grid reference
// is the shared vocabulary of British field sport and land management, so
// wherever the app has no better name for somewhere it now says "TF 784 165".
//
// Maths per Ordnance Survey, "A guide to coordinate systems in Great Britain":
// WGS84 lat/lng → OSGB36 by Helmert transform through geocentric cartesian
// coordinates, then OSGB36 → eastings/northings by the National Grid transverse
// Mercator projection on the Airy 1830 ellipsoid. Height is taken as zero,
// which costs a metre or two — nothing beside the several metres a phone GPS is
// already wrong by, and far inside the precision this app ever displays.
//
// The Helmert step is good to ~5 m across GB. That is why nothing here offers a
// 10-figure (1 m) reference: it would claim a precision the input never had.
// 4 figures = 1 km, 6 = 100 m (a field), 8 = 10 m (a high seat). Those are the
// only three the app will produce.

/** Airy 1830 — the ellipsoid the National Grid is projected on. */
var OSGB_A = 6377563.396, OSGB_B = 6356256.909;
/** WGS84 — the ellipsoid every GPS receiver and every stored lat/lng uses. */
var WGS84_A = 6378137.0, WGS84_INVF = 298.257223563;
/** National Grid true origin (49°N, 2°W), false origin offsets, scale factor. */
var NG_F0 = 0.9996012717, NG_PHI0 = 49 * Math.PI / 180, NG_LAM0 = -2 * Math.PI / 180;
var NG_E0 = 400000, NG_N0 = -100000;

/**
 * WGS84 geodetic → OSGB36 geodetic (radians in, radians out). Helmert
 * seven-parameter transform. The datum shift is around 100 m in GB, so skipping
 * it would put every reference a whole 100 m square out — the step that matters
 * most and the one naive implementations leave off.
 */
function wgs84ToOsgb36Rad(phiW, lamW) {
  var f = 1 / WGS84_INVF, e2 = 2 * f - f * f;
  var sinP = Math.sin(phiW), cosP = Math.cos(phiW);
  var nu = WGS84_A / Math.sqrt(1 - e2 * sinP * sinP);
  var x1 = nu * cosP * Math.cos(lamW);
  var y1 = nu * cosP * Math.sin(lamW);
  var z1 = (1 - e2) * nu * sinP;

  var tx = -446.448, ty = 125.157, tz = -542.060;
  var s = 20.4894e-6;                     // scale, parts per million
  var SEC = Math.PI / 180 / 3600;         // arc-seconds → radians
  var rx = -0.1502 * SEC, ry = -0.2470 * SEC, rz = -0.8421 * SEC;

  var x2 = tx + x1 * (1 + s) - y1 * rz + z1 * ry;
  var y2 = ty + x1 * rz + y1 * (1 + s) - z1 * rx;
  var z2 = tz - x1 * ry + y1 * rx + z1 * (1 + s);

  // Cartesian → geodetic on Airy 1830 (iterative; converges in about 4 rounds).
  var a = OSGB_A, b = OSGB_B;
  var eA2 = (a * a - b * b) / (a * a);
  var p = Math.sqrt(x2 * x2 + y2 * y2);
  var phi = Math.atan2(z2, p * (1 - eA2)), prev = Infinity, guard = 0;
  while (Math.abs(phi - prev) > 1e-12 && guard++ < 30) {
    var nuA = a / Math.sqrt(1 - eA2 * Math.sin(phi) * Math.sin(phi));
    prev = phi;
    phi = Math.atan2(z2 + eA2 * nuA * Math.sin(phi), p);
  }
  return [phi, Math.atan2(y2, x2)];
}

/**
 * OSGB36 geodetic (radians) → National Grid eastings/northings (metres).
 * Exported so the projection can be checked in isolation against OS's own
 * published worked example, which is the only absolute ground truth available
 * without a network call.
 */
export function osgb36ToEastNorth(phi, lam) {
  var a = OSGB_A, b = OSGB_B, F0 = NG_F0, phi0 = NG_PHI0, lam0 = NG_LAM0;
  var e2 = 1 - (b * b) / (a * a);
  var n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n;

  var sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);
  var w = 1 - e2 * sinPhi * sinPhi;
  var nu = a * F0 / Math.sqrt(w);
  var rho = a * F0 * (1 - e2) / (w * Math.sqrt(w));
  var eta2 = nu / rho - 1;

  var dPhi = phi - phi0, sPhi = phi + phi0;
  var M = b * F0 * (
      (1 + n + 1.25 * n2 + 1.25 * n3) * dPhi
    - (3 * n + 3 * n2 + 2.625 * n3) * Math.sin(dPhi) * Math.cos(sPhi)
    + (1.875 * n2 + 1.875 * n3) * Math.sin(2 * dPhi) * Math.cos(2 * sPhi)
    - (35 / 24) * n3 * Math.sin(3 * dPhi) * Math.cos(3 * sPhi)
  );

  var c3 = cosPhi * cosPhi * cosPhi, c5 = c3 * cosPhi * cosPhi;
  var t2 = tanPhi * tanPhi, t4 = t2 * t2;

  var I = M + NG_N0;
  var II = (nu / 2) * sinPhi * cosPhi;
  var III = (nu / 24) * sinPhi * c3 * (5 - t2 + 9 * eta2);
  var IIIA = (nu / 720) * sinPhi * c5 * (61 - 58 * t2 + t4);
  var IV = nu * cosPhi;
  var V = (nu / 6) * c3 * (nu / rho - t2);
  var VI = (nu / 120) * c5 * (5 - 18 * t2 + t4 + 14 * eta2 - 58 * t2 * eta2);

  var d = lam - lam0, d2 = d * d, d3 = d2 * d, d4 = d3 * d, d5 = d4 * d, d6 = d5 * d;
  return [
    NG_E0 + IV * d + V * d3 + VI * d5,
    I + II * d2 + III * d4 + IIIA * d6
  ];
}

/**
 * Eastings/northings → the two-letter 100 km square, or null off the lettered
 * grid. 5×5 blocks of 5×5 squares, with "I" skipped on both axes.
 */
function gridSquareLetters(e, n) {
  var e100 = Math.floor(e / 100000), n100 = Math.floor(n / 100000);
  if (!(e100 >= 0 && e100 <= 6 && n100 >= 0 && n100 <= 12)) return null;
  var i1 = (19 - n100) - (19 - n100) % 5 + Math.floor((e100 + 10) / 5);
  var i2 = (19 - n100) * 5 % 25 + e100 % 5;
  return String.fromCharCode(i1 + (i1 > 7 ? 1 : 0) + 65)
       + String.fromCharCode(i2 + (i2 > 7 ? 1 : 0) + 65);
}

/**
 * Coarse outline of the island of Ireland, [lat, lng] like every other ring in
 * this file, with a seaward buffer. Deliberately blunt — it exists only to
 * answer "is this Irish rather than British". Where the two coasts crowd each
 * other (the Antrim shore and Rathlin against the Mull of Kintyre, 20 km apart)
 * it resolves in Ireland's favour, because a confidently wrong grid reference
 * is worse than no grid reference.
 */
var IRELAND_OUTLINE = Object.freeze([
  [55.42, -7.60], [55.30, -6.10], [54.70, -5.35], [54.05, -5.90],
  [53.30, -5.95], [52.15, -6.00], [51.85, -6.30], [51.40, -8.20],
  [51.55, -10.10], [52.30, -10.65], [53.50, -10.60], [54.30, -10.20],
  [55.40, -8.60]
]);

/**
 * WGS84 lat/lng → an OS grid reference, e.g. "TF 784 165". `digits` is the OS
 * convention for total digit count and is clamped to 4, 6 or 8.
 *
 * Returns null for non-finite input and for anywhere off the National Grid, so
 * callers treat "no reference" as an ordinary case rather than an error.
 */
export function latLngToOsGrid(lat, lng, digits) {
  var la = coordNum(lat), lo = coordNum(lng);
  if (la === null || lo === null) return null;
  // Fast reject on the GB bounding box. The low latitude bound sits between the
  // Isles of Scilly and Alderney, so the Channel Islands — which have their own
  // grid — never get a National Grid reference.
  if (la < 49.8 || la > 61.5 || lo < -9 || lo > 2.5) return null;
  // Ireland sits inside that box and the projection would happily emit a
  // reference for Belfast, but the OSGB36 datum shift is defined for Great
  // Britain and no map printed in Ireland carries these squares — north and
  // south, Ireland uses the Irish Grid. The honest answer there is "none", and
  // the caller falls back to degrees. The Isle of Man IS on the National Grid
  // (square SC) and stays in.
  if (pointInRing(la, lo, IRELAND_OUTLINE)) return null;

  var d = (digits === 4 || digits === 6 || digits === 8) ? digits : 6;
  var os = wgs84ToOsgb36Rad(la * Math.PI / 180, lo * Math.PI / 180);
  var en = osgb36ToEastNorth(os[0], os[1]);
  var e = en[0], n = en[1];
  if (!isFinite(e) || !isFinite(n)) return null;

  var sq = gridSquareLetters(e, n);
  if (!sq) return null;

  var half = d / 2, unit = Math.pow(10, 5 - half);
  return sq + ' ' + padLeft(Math.floor((e % 100000) / unit), half)
            + ' ' + padLeft(Math.floor((n % 100000) / unit), half);
}

/**
 * Coordinate coercion that refuses to invent a position. Number(null) and
 * Number('') are both 0, so a plain isFinite() guard would quietly render a
 * missing location as Null Island off the coast of Ghana — which is precisely
 * the sort of confident wrong answer this whole section exists to avoid.
 */
function coordNum(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function padLeft(v, len) {
  var s = String(v);
  while (s.length < len) s = '0' + s;
  return s;
}

/**
 * Signed decimal degrees with hemisphere letters — the fallback wherever the
 * National Grid does not reach. Still a coordinate, but it reads as one rather
 * than as two bare numbers.
 */
export function formatLatLngDegrees(lat, lng, dp) {
  var la = coordNum(lat), lo = coordNum(lng);
  if (la === null || lo === null) return '';
  var p = (typeof dp === 'number' && dp >= 0 && dp <= 6) ? dp : 4;
  return Math.abs(la).toFixed(p) + '°' + (la >= 0 ? 'N' : 'S')
    + ' · ' + Math.abs(lo).toFixed(p) + '°' + (lo >= 0 ? 'E' : 'W');
}

/**
 * The one label the UI should use when it has coordinates and nothing better:
 * a grid reference in GB, degrees everywhere else. The degree fallback matches
 * the requested precision (8-figure ≈ 4 dp, 6-figure ≈ 3 dp, 4-figure ≈ 2 dp)
 * so the two forms never imply different accuracy. Empty string for bad input,
 * which is what the callers already treat as "no location".
 */
export function formatPlaceRef(lat, lng, digits) {
  var d = (digits === 4 || digits === 6 || digits === 8) ? digits : 6;
  return latLngToOsGrid(lat, lng, d)
    || formatLatLngDegrees(lat, lng, d === 8 ? 4 : d === 4 ? 2 : 3);
}
