// First Light — lib/fl-mapexport.mjs
//
// Pure web-Mercator maths for the "Export ground as PDF satellite map" feature
// (2026-08, owner request: "export a ground in PDF ... a satellite map to
// share with people"). No DOM, no network — everything here is a plain
// function of numbers so tests/map-export.test.mjs can pin it in Node. The
// diary.js glue calls these to lay out the tile grid, fit a zoom to the page,
// project geometry onto the canvas, and size the scale bar.
//
// Tile scheme: standard 256-px slippy tiles (z/x/y), Web Mercator (EPSG:3857).
// World pixel size at zoom z is 256 * 2^z.

const TILE = 256;
const MAX_LAT = 85.05112878; // Mercator clamp

export function worldSize(z) {
  return TILE * Math.pow(2, z);
}

/** Longitude → world-pixel X at integer/fractional zoom z. */
export function lngToWorldX(lng, z) {
  return (lng + 180) / 360 * worldSize(z);
}

/** Latitude → world-pixel Y at zoom z (clamped to the Mercator limit). */
export function latToWorldY(lat, z) {
  const la = Math.max(Math.min(lat, MAX_LAT), -MAX_LAT);
  const s = Math.sin(la * Math.PI / 180);
  const y = 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  return y * worldSize(z);
}

/** Inverse: world-pixel X → longitude. */
export function worldXToLng(x, z) {
  return x / worldSize(z) * 360 - 180;
}

/** Inverse: world-pixel Y → latitude. */
export function worldYToLat(y, z) {
  const n = Math.PI - 2 * Math.PI * y / worldSize(z);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Bounding box of a list of [lat, lng] points, or null if none valid.
 * Accepts nested arrays (rings) too — anything with numeric [0]/[1] pairs
 * should be flattened by the caller; this only reads flat point lists.
 */
export function boundsOfPoints(points) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity, n = 0;
  (points || []).forEach(function (p) {
    if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
    n++;
    if (p[0] < minLat) minLat = p[0];
    if (p[0] > maxLat) maxLat = p[0];
    if (p[1] < minLng) minLng = p[1];
    if (p[1] > maxLng) maxLng = p[1];
  });
  if (!n) return null;
  return { minLat: minLat, maxLat: maxLat, minLng: minLng, maxLng: maxLng };
}

/** Grow a bounds box by `frac` of its own span on every side (with a tiny
 *  floor so a single-point ground still gets a sane window). */
export function padBounds(b, frac) {
  if (!b) return null;
  const f = (typeof frac === 'number' && frac >= 0) ? frac : 0.08;
  let dLat = (b.maxLat - b.minLat) || 0;
  let dLng = (b.maxLng - b.minLng) || 0;
  // Single point or a straight line in one axis: give it a minimum window
  // (~250 m of latitude) so the fit does not divide by zero.
  if (dLat < 0.0025) { const c = (b.minLat + b.maxLat) / 2; b = { minLat: c - 0.00125, maxLat: c + 0.00125, minLng: b.minLng, maxLng: b.maxLng }; dLat = 0.0025; }
  if (dLng < 0.0025) { const c = (b.minLng + b.maxLng) / 2; b = { minLat: b.minLat, maxLat: b.maxLat, minLng: c - 0.00125, maxLng: c + 0.00125 }; dLng = 0.0025; }
  return {
    minLat: b.minLat - dLat * f, maxLat: b.maxLat + dLat * f,
    minLng: b.minLng - dLng * f, maxLng: b.maxLng + dLng * f
  };
}

export function boundsCenter(b) {
  return { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
}

/**
 * Pick the page orientation that best fits the ground's shape on A4.
 * Compares the ground's true aspect (longitude corrected by latitude) against
 * the A4 map-area aspect. Square-ish grounds default to landscape.
 */
export function chooseOrientation(b) {
  const midLat = (b.minLat + b.maxLat) / 2;
  const geoW = Math.max((b.maxLng - b.minLng) * Math.cos(midLat * Math.PI / 180), 1e-9);
  const geoH = Math.max(b.maxLat - b.minLat, 1e-9);
  const aspect = geoW / geoH;
  return aspect >= 0.9 ? 'landscape' : 'portrait';
}

/**
 * Largest integer zoom at which `bounds` fits inside a `wpx` × `hpx` pixel box.
 * Iterates down from maxZoom; returns minZoom if even that overflows (a huge
 * estate that cannot fit — the caller still gets a usable, if zoomed-out, map).
 */
export function fitZoom(bounds, wpx, hpx, opts) {
  opts = opts || {};
  const minZoom = opts.minZoom != null ? opts.minZoom : 3;
  const maxZoom = opts.maxZoom != null ? opts.maxZoom : 19;
  for (let z = maxZoom; z >= minZoom; z--) {
    const dx = Math.abs(lngToWorldX(bounds.maxLng, z) - lngToWorldX(bounds.minLng, z));
    const dy = Math.abs(latToWorldY(bounds.maxLat, z) - latToWorldY(bounds.minLat, z));
    if (dx <= wpx && dy <= hpx) return z;
  }
  return minZoom;
}

/**
 * Ground metres per pixel at a given latitude and zoom (256-px tiles).
 * Used to size the scale bar.
 */
export function metresPerPixel(lat, z) {
  return 156543.03392804097 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
}

/**
 * A "nice" round distance no larger than `maxMeters`, from a 1/2/5 × 10ⁿ
 * ladder. Returns metres. The scale bar is drawn this long.
 */
export function niceScaleMeters(maxMeters) {
  const ladder = [10, 20, 25, 50, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000];
  let best = ladder[0];
  for (let i = 0; i < ladder.length; i++) {
    if (ladder[i] <= maxMeters) best = ladder[i];
  }
  return best;
}

/** Human label for a scale distance in metres. */
export function formatScaleLabel(m) {
  return m >= 1000 ? (m / 1000) + ' km' : m + ' m';
}

/**
 * Plan the whole tile grid + projection for a canvas of `cw`×`ch` pixels
 * showing `bounds` at zoom `z`, centred. Returns everything diary.js needs:
 *   originX/originY : world-pixel coordinate of the canvas top-left
 *   tiles           : [{x,y,z,dx,dy}] — tile index + where to draw it (px)
 *   project(lat,lng): → [px, py] on the canvas
 * The tile list is clamped to the valid [0, 2^z) range so poles/date-line
 * never request a negative or out-of-range tile.
 */
export function planTiles(bounds, cw, ch, z) {
  const c = boundsCenter(bounds);
  const cxWorld = lngToWorldX(c.lng, z);
  const cyWorld = latToWorldY(c.lat, z);
  const originX = cxWorld - cw / 2;
  const originY = cyWorld - ch / 2;
  const n = Math.pow(2, z);

  const minTileX = Math.floor(originX / TILE);
  const maxTileX = Math.floor((originX + cw) / TILE);
  const minTileY = Math.floor(originY / TILE);
  const maxTileY = Math.floor((originY + ch) / TILE);

  const tiles = [];
  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const wrappedX = ((tx % n) + n) % n; // wrap longitude
      if (ty < 0 || ty >= n) continue;     // skip beyond the poles
      tiles.push({
        x: wrappedX, y: ty, z: z,
        dx: tx * TILE - originX,
        dy: ty * TILE - originY
      });
    }
  }

  function project(lat, lng) {
    return [lngToWorldX(lng, z) - originX, latToWorldY(lat, z) - originY];
  }

  return { z: z, originX: originX, originY: originY, tiles: tiles, project: project, tileSize: TILE };
}
