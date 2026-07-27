// First Light — modules/grounds.mjs
// =============================================================================
// Grounds boundary data layer (GROUNDS-PLAN.md G2): Supabase CRUD against
// public.ground_features (owner-only RLS — scripts/migrate-ground-features.sql)
// plus the localStorage snapshot that keeps saved boundaries VIEWABLE offline.
//
// Split contract (the stands.mjs precedent): this module owns data; diary.js
// owns the manager sheet, the editor overlay, dispatcher wiring and rendering.
// All geometry semantics live in lib/fl-geo.mjs — this module treats
// `geometry` as an opaque blob and never parses it.
//
// Side effects allowed here (modules/ rule): Supabase via the passed-in `sb`
// client and localStorage (offline snapshot, key 'fl-grounds-cache-v1').
//
// Editing is ONLINE-ONLY (owner decision, stands precedent) — there is no
// offline queue here on purpose. The cache exists so boundaries still PAINT
// on the hill with no signal; the last successful fetch is the snapshot.
// =============================================================================

/** Client-side cap on boundary parcels per user (UI-enforced; the migration
 *  header records it is deliberately NOT a DB constraint — the
 *  DevTools-self-harm precedent, same as STANDS_MAX). */
export var GROUND_FEATURES_MAX = 80; // G10: markers joined the count — furniture is cheap, estates are busy

var CACHE_KEY = 'fl-grounds-cache-v1';

// Pre-migration tolerance (GROUNDS-PLAN §4): if the ground_features table is
// absent (42P01), the feature goes quietly inert for the session instead of
// error-looping — same spirit as stands.mjs OPTIONAL_COLS. The migration IS
// run (SUPABASE-RECORD 2026-07-18), so this is belt-and-braces only.
var _tableMissing = false;

function tableAbsent(err) {
  if (!err) return false;
  if (err.code === '42P01') return true;
  var msg = typeof err.message === 'string' ? err.message : '';
  return msg.indexOf('ground_features') !== -1 && msg.indexOf('does not exist') !== -1;
}

/** True once a fetch/save has proven the table absent — callers hide the feature quietly. */
export function groundFeaturesUnavailable() {
  return _tableMissing;
}

/**
 * All of the user's ground features, ordered by creation. Successful fetches
 * snapshot to localStorage for offline viewing. Throws on network/database
 * errors (callers fall back to cachedGroundFeatures()); an absent table
 * returns [] and flags groundFeaturesUnavailable() instead of throwing.
 */
export async function fetchGroundFeatures(sb, userId) {
  if (_tableMissing) return [];
  var r = await sb.from('ground_features')
    .select('id, ground, kind, name, geometry, color, notes, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (r.error) {
    if (tableAbsent(r.error)) { _tableMissing = true; return []; }
    throw r.error;
  }
  var list = r.data || [];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch (e) { /* quota — cache is best-effort */ }
  return list;
}

/** Last successfully fetched feature list ([] if none). Never hits the network. */
export function cachedGroundFeatures() {
  try {
    var arr = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

/**
 * Insert (no id) or update (id set). `f` = { id?, ground, kind?, name?,
 * geometry, color?, notes? }; geometry must already be the versioned blob
 * from lib/fl-geo makeGeometry(). Returns the saved row.
 */
export async function saveGroundFeature(sb, userId, f) {
  var row = {
    user_id: userId,
    ground: f.ground,
    kind: f.kind || 'boundary',
    name: (f.name && f.name.trim()) ? f.name.trim() : null,
    geometry: f.geometry,
    color: f.color || null,
    notes: (f.notes && f.notes.trim()) ? f.notes.trim() : null
  };
  var r = f.id
    ? await sb.from('ground_features').update(row).eq('id', f.id).select().single()
    : await sb.from('ground_features').insert(row).select().single();
  if (r.error) {
    if (tableAbsent(r.error)) _tableMissing = true;
    throw r.error;
  }
  return r.data;
}

export async function deleteGroundFeature(sb, id) {
  var r = await sb.from('ground_features').delete().eq('id', id);
  if (r.error) throw r.error;
}
