// First Light — modules/profile.mjs
//
// Pure validators for the two profile-edit flows added to the Cull Diary
// Settings tab (display-name change, password change). No DOM, no Supabase
// calls — those live in diary.js. Keeping validation here makes the rules
// testable without a browser and keeps the imperative save handlers small.
//
// Public API
//   validateDisplayName(raw)
//     Returns { ok, value, error }. Valid names are 2-60 chars after trim.
//     We allow letters, digits, spaces, apostrophes, hyphens, dots, and
//     non-ASCII letters (so O'Brien, José, Anne-Marie all work). We reject
//     strings that are only punctuation once trimmed.
//
//   validatePasswordChange(current, next, confirm)
//     Returns { ok, error }. Enforces:
//       - all three fields non-empty
//       - next >= 8 chars (matches signup rule in diary.js L1660)
//       - next !== current (meaningful change)
//       - confirm === next
//
//   validateSeasonStartMonth(raw)
//     Returns { ok, value, error }. Valid values are whole months 1–12
//     (season-year feature, SEASON-YEAR-PLAN.md §2). Unlike
//     lib/fl-pure.mjs#normalizeSeasonStartMonth — the READ-path helper that
//     silently clamps garbage to the August default — this is the WRITE-path
//     validator: a save with a malformed value must fail loudly rather than
//     quietly storing August.
//
// Both helpers are intentionally permissive about Unicode — stalkers write
// names as they're spelled, and Supabase's user_metadata is just JSON. The
// actual password strength rule is Supabase-side; we only enforce "at least
// as strong as sign-up".

const NAME_MIN = 2;
const NAME_MAX = 60;
const PW_MIN   = 8;
const SEASON_MONTH_MIN = 1;
const SEASON_MONTH_MAX = 12;

// Unicode letter / digit / space / apostrophe / hyphen / dot. We use the
// \p{L} + \p{N} properties so accented characters and non-Latin scripts
// pass through. Also allow a handful of punctuation common to real names.
const NAME_ALLOWED_RE = /^[\p{L}\p{N}\s'\-.]+$/u;

// At least one letter — rules out pathological inputs like "..." or "---"
// that would otherwise pass NAME_ALLOWED_RE.
const NAME_HAS_LETTER_RE = /\p{L}/u;

/**
 * @param {string} raw
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateDisplayName(raw) {
  if (raw == null) return { ok: false, error: 'Please enter your name.' };
  // Collapse internal whitespace to single spaces so "John   Smith" → "John Smith"
  // (users often paste names with tab / multiple spaces).
  const value = String(raw).trim().replace(/\s+/g, ' ');
  if (value.length === 0) {
    return { ok: false, error: 'Please enter your name.' };
  }
  if (value.length < NAME_MIN) {
    return { ok: false, error: 'Name must be at least ' + NAME_MIN + ' characters.' };
  }
  if (value.length > NAME_MAX) {
    return { ok: false, error: 'Name must be ' + NAME_MAX + ' characters or fewer.' };
  }
  if (!NAME_ALLOWED_RE.test(value)) {
    return { ok: false, error: 'Name can only include letters, numbers, spaces, apostrophes, hyphens and dots.' };
  }
  if (!NAME_HAS_LETTER_RE.test(value)) {
    return { ok: false, error: 'Name must contain at least one letter.' };
  }
  return { ok: true, value };
}

/**
 * @param {string} current
 * @param {string} next
 * @param {string} confirm
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validatePasswordChange(current, next, confirm) {
  if (!current) return { ok: false, error: 'Please enter your current password.' };
  if (!next)    return { ok: false, error: 'Please enter a new password.' };
  if (!confirm) return { ok: false, error: 'Please confirm your new password.' };
  if (next.length < PW_MIN) {
    return { ok: false, error: 'New password must be at least ' + PW_MIN + ' characters.' };
  }
  if (next === current) {
    return { ok: false, error: 'New password must be different from the current one.' };
  }
  if (next !== confirm) {
    return { ok: false, error: 'New passwords do not match.' };
  }
  return { ok: true };
}

/**
 * @param {unknown} raw — value from the "Season starts in" <select> (string)
 *   or a pre-parsed number.
 * @returns {{ ok: true, value: number } | { ok: false, error: string }}
 */
export function validateSeasonStartMonth(raw) {
  if (raw == null) return { ok: false, error: 'Please choose a month.' };
  const s = String(raw).trim();
  if (s === '') return { ok: false, error: 'Please choose a month.' };
  // Number() (not parseInt) so '8.5' / '8px' fail instead of truncating to 8.
  const n = typeof raw === 'number' ? raw : Number(s);
  if (!Number.isFinite(n) || Math.trunc(n) !== n) {
    return { ok: false, error: 'Season start must be a whole month number (1–12).' };
  }
  if (n < SEASON_MONTH_MIN || n > SEASON_MONTH_MAX) {
    return { ok: false, error: 'Season start must be between 1 (January) and 12 (December).' };
  }
  return { ok: true, value: n };
}

// Re-exported so call sites and tests can reference the same numbers
// without hard-coding them.
export const PROFILE_LIMITS = Object.freeze({
  NAME_MIN, NAME_MAX, PW_MIN,
  SEASON_MONTH_MIN, SEASON_MONTH_MAX,
});
