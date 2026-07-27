// First Light — lib/fl-exif.mjs
// =============================================================================
// Pure EXIF reader for the Cull Diary's "photo details" offer: when a stalker
// attaches a smartphone photo, the ORIGINAL file (before the canvas pipeline
// in modules/photos.mjs strips every byte of metadata) is scanned for the two
// facts a cull record wants — where and when the photo was taken.
//
//   parseExif(buf) → { lat, lng, date, time } | null
//
//     lat/lng — WGS84 decimal degrees (6 dp), or null when the photo carries
//               no usable GPS block. Phones only embed GPS when the camera
//               app has location tagging on, and both iOS and newer Android
//               photo pickers can strip it for privacy — callers MUST treat
//               coordinates as use-when-present, never required.
//     date    — 'YYYY-MM-DD' from DateTimeOriginal (capture time, camera
//               local clock — i.e. UK wall time for UK stalking), or null.
//     time    — 'HH:MM' from the same tag, or null.
//
//   Returns null when the buffer is not a JPEG, has no EXIF APP1 segment, or
//   the segment is unreadable. Never throws.
//
// Scope: JPEG (SOI/APP1/TIFF) only. iOS transcodes HEIC library picks to
// JPEG on upload via <input type=file accept="image/*">, so JPEG covers the
// overwhelming majority of real uploads; a HEIC/PNG/etc. buffer simply
// returns null and the diary behaves exactly as it did before this feature.
//
// lib/ purity rules apply: no DOM, no window, no network, no Date. Runs
// unchanged in Node ≥ 20 — behavioural spec lives in tests/fl-exif.test.mjs.
// =============================================================================

// TIFF field type byte-widths (index = type id). Only ASCII (2), SHORT (3),
// LONG (4) and RATIONAL (5) are read; everything else is skipped.
var TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

/** Coerce ArrayBuffer / typed array / DataView input to a DataView. */
function toDataView(input) {
  if (input instanceof DataView) return input;
  if (input instanceof ArrayBuffer) return new DataView(input);
  if (input && input.buffer instanceof ArrayBuffer) {
    return new DataView(input.buffer, input.byteOffset || 0, input.byteLength);
  }
  return null;
}

/**
 * Locate the TIFF payload of the JPEG's EXIF APP1 segment.
 * Returns { start, length } (offsets into the view) or null.
 * Walks SOI → markers until SOS/EOI; APP1 must begin "Exif\0\0".
 */
function findExifTiff(view) {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null; // not JPEG
  var off = 2;
  while (off + 4 <= view.byteLength) {
    if (view.getUint8(off) !== 0xFF) return null; // lost sync — bail out
    var marker = view.getUint8(off + 1);
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
      off += 2; // standalone markers have no length word
      continue;
    }
    if (marker === 0xDA || marker === 0xD9) return null; // image data / EOI — no EXIF
    var len = view.getUint16(off + 2);
    if (len < 2) return null; // malformed segment length
    if (marker === 0xE1 && off + 4 + 6 <= view.byteLength &&
        view.getUint32(off + 4) === 0x45786966 /* 'Exif' */ &&
        view.getUint16(off + 8) === 0x0000) {
      var start = off + 10; // past marker, length, "Exif\0\0"
      var length = len - 2 - 6;
      if (length <= 8 || start + length > view.byteLength) {
        // Truncated capture (callers may hand us only the head of the file):
        // clamp to what we actually have and let bounds checks do the rest.
        length = Math.max(0, view.byteLength - start);
        if (length <= 8) return null;
      }
      return { start: start, length: length };
    }
    off += 2 + len;
  }
  return null;
}

/**
 * Read one IFD and return a map of tag → { type, count, valueOffset } with
 * valueOffset already resolved (absolute within the TIFF block) whether the
 * value is inlined in the entry or stored out-of-line.
 */
function readIfd(view, tiffStart, little, ifdOffset) {
  var abs = tiffStart + ifdOffset;
  var n = view.getUint16(abs, little);
  var out = {};
  for (var i = 0; i < n; i++) {
    var e = abs + 2 + i * 12;
    var tag = view.getUint16(e, little);
    var type = view.getUint16(e + 2, little);
    var count = view.getUint32(e + 4, little);
    var size = (TYPE_SIZE[type] || 0) * count;
    var valueOffset = (size > 4)
      ? tiffStart + view.getUint32(e + 8, little)
      : e + 8;
    out[tag] = { type: type, count: count, valueOffset: valueOffset };
  }
  return out;
}

/** Read an ASCII field, trimming the trailing NUL and whitespace. */
function readAscii(view, field) {
  if (!field || field.type !== 2 || field.count < 1) return null;
  var s = '';
  for (var i = 0; i < field.count; i++) {
    var c = view.getUint8(field.valueOffset + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim() || null;
}

/** Read `n` unsigned rationals as numbers; null on den=0 / wrong type. */
function readRationals(view, field, little, n) {
  if (!field || field.type !== 5 || field.count < n) return null;
  var out = [];
  for (var i = 0; i < n; i++) {
    var num = view.getUint32(field.valueOffset + i * 8, little);
    var den = view.getUint32(field.valueOffset + i * 8 + 4, little);
    if (!den) return null;
    out.push(num / den);
  }
  return out;
}

/** Read a LONG/SHORT scalar (IFD pointers are LONGs). */
function readUint(view, field, little) {
  if (!field) return null;
  if (field.type === 4) return view.getUint32(field.valueOffset, little);
  if (field.type === 3) return view.getUint16(field.valueOffset, little);
  return null;
}

/**
 * [deg, min, sec] + hemisphere ref → signed decimal degrees (6 dp).
 * Exported for the unit tests. Returns null on missing/invalid input.
 */
export function exifGpsToDecimal(dms, ref) {
  if (!dms || dms.length < 3 || !ref) return null;
  var d = dms[0], m = dms[1], s = dms[2];
  if (!isFinite(d) || !isFinite(m) || !isFinite(s)) return null;
  var dec = d + m / 60 + s / 3600;
  var r = ref.charAt(0).toUpperCase();
  if (r === 'S' || r === 'W') dec = -dec;
  else if (r !== 'N' && r !== 'E') return null;
  return Math.round(dec * 1e6) / 1e6;
}

/**
 * 'YYYY:MM:DD HH:MM:SS' (EXIF ASCII form) → { date: 'YYYY-MM-DD',
 * time: 'HH:MM' } with basic range validation, or null. Exported for tests.
 * Cameras with an unset clock write blanks/zeros — those must not pre-fill
 * a cull record, hence the year floor.
 */
export function parseExifDateString(s) {
  if (!s) return null;
  var m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  var y = +m[1], mo = +m[2], d = +m[3], hh = +m[4], mi = +m[5];
  if (y < 1990 || y > 2099) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (hh > 23 || mi > 59) return null;
  return { date: m[1] + '-' + m[2] + '-' + m[3], time: m[4] + ':' + m[5] };
}

// EXIF/TIFF tag ids used below.
var TAG_EXIF_IFD = 0x8769;   // IFD0 → pointer to the Exif sub-IFD
var TAG_GPS_IFD  = 0x8825;   // IFD0 → pointer to the GPS sub-IFD
var TAG_DATETIME = 0x0132;   // IFD0 DateTime (file-modified — fallback only)
var TAG_DTO      = 0x9003;   // Exif DateTimeOriginal (capture time)
var TAG_DTD      = 0x9004;   // Exif DateTimeDigitized (fallback)
var TAG_LAT_REF  = 0x0001;
var TAG_LAT      = 0x0002;
var TAG_LNG_REF  = 0x0003;
var TAG_LNG      = 0x0004;

/**
 * Parse a JPEG buffer's EXIF and return { lat, lng, date, time } — members
 * null when absent — or null when there is nothing usable at all.
 * @param {ArrayBuffer|Uint8Array|DataView} input
 */
export function parseExif(input) {
  try {
    var view = toDataView(input);
    if (!view) return null;
    var seg = findExifTiff(view);
    if (!seg) return null;
    var t0 = seg.start;

    var bom = view.getUint16(t0);
    var little;
    if (bom === 0x4949) little = true;        // 'II'
    else if (bom === 0x4D4D) little = false;  // 'MM'
    else return null;
    if (view.getUint16(t0 + 2, little) !== 42) return null;

    var ifd0Offset = view.getUint32(t0 + 4, little);
    var ifd0 = readIfd(view, t0, little, ifd0Offset);

    // ── when ──
    var dt = null;
    var exifPtr = readUint(view, ifd0[TAG_EXIF_IFD], little);
    if (exifPtr != null) {
      var exifIfd = readIfd(view, t0, little, exifPtr);
      dt = parseExifDateString(readAscii(view, exifIfd[TAG_DTO])) ||
           parseExifDateString(readAscii(view, exifIfd[TAG_DTD]));
    }
    if (!dt) dt = parseExifDateString(readAscii(view, ifd0[TAG_DATETIME]));

    // ── where ──
    var lat = null, lng = null;
    var gpsPtr = readUint(view, ifd0[TAG_GPS_IFD], little);
    if (gpsPtr != null) {
      var gps = readIfd(view, t0, little, gpsPtr);
      var la = exifGpsToDecimal(readRationals(view, gps[TAG_LAT], little, 3),
                                readAscii(view, gps[TAG_LAT_REF]));
      var ln = exifGpsToDecimal(readRationals(view, gps[TAG_LNG], little, 3),
                                readAscii(view, gps[TAG_LNG_REF]));
      // Both halves must be present, in range, and not the (0,0) "null
      // island" a mis-firing GPS chip writes — otherwise offer nothing.
      if (la != null && ln != null &&
          Math.abs(la) <= 90 && Math.abs(ln) <= 180 &&
          !(la === 0 && ln === 0)) {
        lat = la; lng = ln;
      }
    }

    if (lat == null && !dt) return null;
    return {
      lat: lat,
      lng: lng,
      date: dt ? dt.date : null,
      time: dt ? dt.time : null
    };
  } catch (e) {
    // Malformed/truncated metadata must never break photo attach.
    return null;
  }
}
