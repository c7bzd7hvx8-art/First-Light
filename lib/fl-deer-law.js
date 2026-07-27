// =============================================================================
// First Light — UK deer law: statutory minimum energy thresholds
//
// Sibling to lib/fl-pure.mjs and lib/fl-ballistics.mjs. Pure data + lookup
// helpers — no DOM, no network, no globals.
//
// Source verification (current as of April 2026)
// ──────────────────────────────────────────────
// All numeric values below have been cross-checked against the primary
// statutory texts on legislation.gov.uk:
//
//   * Deer Act 1991 (E&W) — c. 54, Schedule 2 ("Prohibited Firearms and
//     Ammunition"), as amended by The Regulatory Reform (Deer) (England
//     and Wales) Order 2007 (SI 2007/2183). The 2007 Order added the
//     muntjac/CWD-specific minimums in section 6(6) (inserted by art.
//     3(5) of SI 2007/2183).
//     https://www.legislation.gov.uk/ukpga/1991/54
//
//   * Deer (Firearms etc.) (Scotland) Order 1985 (SI 1985/1168), as
//     amended by SSI 2023/332 (in force 3 November 2023). The 2023
//     amendment reduced the bullet-weight minimum for red/sika/fallow
//     from 100gr to 80gr; muzzle velocity (2,450 fps) and muzzle energy
//     (1,750 ft-lb) requirements were unchanged. Roe rule in art. 3(b)
//     was unchanged by SSI 2023/332.
//     https://www.legislation.gov.uk/ssi/2023/332/made
//     https://www.nature.scot/professional-advice/protected-areas-and-
//       species/licensing/species-licensing-z-guide/deer/deer-authorisations
//
//   * Wildlife (Northern Ireland) Order 1985 (SI 1985/171 (NI 2)),
//     Schedule 11 ("Prohibited firearms and ammunition"), referenced by
//     Article 19(3)(a). NI law sets a statutory minimum calibre of .236
//     inches (6mm) in Schedule 11 paragraph 2, plus minimum bullet
//     weight 100 grains and minimum muzzle energy 1,700 ft-lb in
//     paragraphs 7 and 8, and requires "an expanding bullet designed to
//     deform in a predictable manner". Schedule 6 by contrast lists
//     animals (badger, deer, otter, etc.) that may not be killed or
//     taken by certain methods — it does NOT contain firearms specs.
//     CORRECTION 2026-04-29: NI Article 20(8A) (inserted by the
//     Wildlife and Natural Environment Act (NI) 2011 s.17) DOES
//     provide a muntjac/CWD-specific exemption: .220" min calibre,
//     1,000 ft-lb min muzzle energy, 50gr min bullet weight, soft-
//     or hollow-nosed. This mirrors the E&W s.6(6) reduction.
//     Earlier versions of this file incorrectly claimed no such
//     exemption existed.
//     https://www.legislation.gov.uk/nisi/1985/171
//
// Republic of Ireland is OUT OF SCOPE for this UK app. Irish stalkers
// should consult SI 239/1977 and NPWS guidance — different rules.
//
// What this module is for
// ───────────────────────
// The ballistic calculator (ballistics.html) uses these thresholds to
// flag when a shot would deliver insufficient energy to be lawful. A
// red/amber/green badge in the calculator UI is computed by comparing
// solveShot()'s energy output against minMuzzleEnergyFor().
//
// IMPORTANT NUANCES
// ─────────────────
// 1. Statutory minimums in all three jurisdictions are MUZZLE energy
//    minimums, not impact-energy minimums. The law concerns the
//    rifle/cartridge combination, not the shot taken. So the
//    calculator's red/amber/green at the muzzle reflects legality;
//    red/amber/green at impact reflects ethics-of-shot, which is a
//    separate (and stricter) concern. checkLegalCompliance() applies the
//    statutory threshold to MUZZLE energy (the legal test); retained
//    (impact) energy is shown separately, labelled "not the legal figure",
//    and the retained-vs-threshold comparison is surfaced only as the
//    ethical-max-range guide.
//
// 2. Scotland additionally requires minimum muzzle VELOCITY (2,450 fps
//    for all species). Encoded in the threshold object as
//    minMuzzleVelocityFps and is checked at the muzzle by
//    checkLegalCompliance() (surfaced in the compliance card).
//
// 3. All jurisdictions require an EXPANDING bullet (soft-nosed or
//    hollow-nosed in E&W; "expanding bullet designed to deform in a
//    predictable manner" in NI; "expanding type designed to deform in
//    a predictable manner" in Scotland). FMJ ammunition is illegal
//    for deer everywhere in the UK. Encoded per-load in
//    data/ammo-loads.json via the `construction` field.
//
// 4. Minimum bullet weight rules:
//      E&W: 50gr for muntjac/CWD; NO weight restriction for the larger
//           species (only calibre + energy).
//      Scotland: 50gr for roe; 80gr for red/sika/fallow (since Nov 2023).
//           No separate provisions for muntjac/CWD.
//      NI: 100gr for the larger species (Schedule 11 paragraph 8(a)).
//           50gr for muntjac/CWD under Article 20(8A) (added 2011).
//
// 5. Minimum CALIBRE rules:
//      E&W: .220" for muntjac/CWD; .240" for the larger species.
//      Scotland: NO statutory calibre minimum.
//      NI: .236" for the larger species (Schedule 11 paragraph 2).
//          .220" for muntjac/CWD under Article 20(8A) (added 2011).
//
// 6. UK REACH lead ammunition restriction (SI 2026/195) restricts the
//    sale and use of lead-projectile ammunition for live quarry
//    shooting in E&W and Scotland from 1 April 2029. Encoded as a
//    future-dated informational flag, surfaced as advisory only — not
//    as red/amber/green.
// =============================================================================

/** Pre-release banner gating flag. The UI surfaces a "thresholds not yet
 *  verified" banner whenever this is false.
 *
 *  Flipped to true on 2026-04-29 by Sohaib Mengal during the pre-release
 *  audit. All previously deferred items were subsequently verified against
 *  legislation.gov.uk primary text on 2026-04-29.
 *
 *  AUDIT TRAIL — what was checked, what was found:
 *    1. E&W muntjac/CWD section reference confirmed as s.6(6) of the Deer
 *       Act 1991, inserted by SI 2007/2183 art. 3 — VERIFIED.
 *    2. Scotland SSI confirmed as 2023/332 (Deer (Firearms etc.) (Scotland)
 *       Amendment Order 2023), in force from 3 November 2023, reducing
 *       larger-species min bullet weight from 100gr to 80gr — VERIFIED.
 *    3. NI prohibited firearms/ammunition is Schedule 11 of the Wildlife
 *       (NI) Order 1985 — VERIFIED. (Schedule 6 is the trapping/methods
 *       schedule, not firearms.)
 *    4. NI larger-species minimum calibre is .236" (Sch. 11 para 2),
 *       minimum bullet weight is 100 grains (para 8(a)), minimum muzzle
 *       energy is 1,700 ft-lb (para 7), expanding bullet required (para
 *       8(b)) — VERIFIED.
 *    5. NI muntjac/CWD Article 20(8A) exemption — CORRECTED. The previous
 *       file version (and the comment block above) wrongly claimed no such
 *       exemption existed. Article 20(8A), inserted by Wildlife and Natural
 *       Environment Act (NI) 2011 s.17 effective 17 August 2011, in fact
 *       provides a muntjac/CWD-specific exemption with .220" min calibre,
 *       1,000 ft-lb min energy, 50gr min bullet weight, soft- or hollow-
 *       nosed. The encoded NI muntjac and cwd thresholds in this file
 *       have been corrected. The IMPORTANT NUANCES section at the top of
 *       this file has been updated to match. */
export const flUkDeerLawVerified = true;

/** ISO date on which the statutory text behind every threshold in this file
 *  was last read at primary source. Sibling to SEASONS_VERIFIED_ON in
 *  lib/fl-deer-seasons.js. Every surface that states the law is expected to
 *  state this date beside it: the law-reference publishers this app competes
 *  with all date their pages, and an app that encodes the same statutes and
 *  shows no date is asking to be trusted further than it has earned. */
export const LAW_VERIFIED_ON = '2026-04-29';

/** '2026-04-29' -> '29 April 2026'. Kept here so the law page, the calendar
 *  and the ballistic calculator cannot drift into three different formats. */
export function verifiedOnLabel(iso) {
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso));
  if (!m) return '';
  const mon = MONTHS[Number(m[2]) - 1];
  if (!mon) return '';
  return String(Number(m[3])) + ' ' + mon + ' ' + m[1];
}

// ── Species ───────────────────────────────────────────────────────────────

/** Canonical UK deer species codes. Match the cull diary's species list. */
export const DEER_SPECIES = Object.freeze([
  { code: 'roe',     label: 'Roe' },
  { code: 'red',     label: 'Red' },
  { code: 'fallow',  label: 'Fallow' },
  { code: 'sika',    label: 'Sika' },
  { code: 'muntjac', label: 'Muntjac' },
  { code: 'cwd',     label: 'Chinese water deer' },
]);

// ── Jurisdictions ─────────────────────────────────────────────────────────

/** UK jurisdictions with materially different statutory rules. */
export const JURISDICTIONS = Object.freeze([
  { code: 'england-wales',    label: 'England & Wales' },
  { code: 'scotland',         label: 'Scotland' },
  { code: 'northern-ireland', label: 'Northern Ireland' },
]);

// ── Statutory thresholds (verified 2026-04-29) ───────────────────────────
//
// Schema for each entry:
//   minMuzzleEnergyFtLb     — statutory minimum muzzle energy (ft-lb)
//   minMuzzleVelocityFps    — statutory minimum muzzle velocity (fps),
//                              null where not specified
//   minBulletWeightGrains   — statutory minimum bullet weight (grains),
//                              null where not specified
//   minCalibreInches        — statutory minimum calibre (inches),
//                              null where not specified
//   expandingBulletRequired — true everywhere in the UK
//   bulletWeightAlternative — 'expanding' where the statute offers the bullet
//                              weight and the expanding construction as
//                              alternative limbs rather than as cumulative
//                              requirements (Northern Ireland only); absent
//                              everywhere the two are cumulative
//   citation                — human-readable statutory reference
//   citationUrl             — primary source link
//   notes                   — UI-displayable detail

const THRESHOLDS = Object.freeze({
  'england-wales': {
    'roe':     { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: 0.240,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991, Sch. 2 (E&W)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/schedule/2',
                 notes: 'Min calibre .240"; min muzzle energy 1,700 ft-lb (2,305 J). No bullet-weight minimum.' },
    'red':     { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: 0.240,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991, Sch. 2 (E&W)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/schedule/2',
                 notes: 'Min calibre .240"; min muzzle energy 1,700 ft-lb (2,305 J). No bullet-weight minimum.' },
    'fallow':  { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: 0.240,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991, Sch. 2 (E&W)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/schedule/2',
                 notes: 'Min calibre .240"; min muzzle energy 1,700 ft-lb (2,305 J). No bullet-weight minimum.' },
    'sika':    { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: 0.240,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991, Sch. 2 (E&W)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/schedule/2',
                 notes: 'Min calibre .240"; min muzzle energy 1,700 ft-lb (2,305 J). No bullet-weight minimum.' },
    'muntjac': { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 50, minCalibreInches: 0.220,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991 s.6(6) (E&W), as inserted by SI 2007/2183 art. 3(5)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/section/6',
                 notes: 'Min calibre .220"; min muzzle energy 1,000 ft-lb (1,356 J); min bullet 50 grains; soft- or hollow-nosed.' },
    'cwd':     { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 50, minCalibreInches: 0.220,
                 expandingBulletRequired: true,
                 citation: 'Deer Act 1991 s.6(6) (E&W), as inserted by SI 2007/2183 art. 3(5)',
                 citationUrl: 'https://www.legislation.gov.uk/ukpga/1991/54/section/6',
                 notes: 'Min calibre .220"; min muzzle energy 1,000 ft-lb (1,356 J); min bullet 50 grains; soft- or hollow-nosed.' },
  },
  'scotland': {
    'roe':     { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: 2450,
                 minBulletWeightGrains: 50, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Deer (Firearms etc.) (Scotland) Order 1985, as amended by SSI 2023/332 (in force 3 Nov 2023)',
                 citationUrl: 'https://www.legislation.gov.uk/ssi/2023/332/made',
                 notes: 'Roe-specific: min bullet 50gr; min muzzle velocity 2,450 fps; min muzzle energy 1,000 ft-lb. No statutory calibre minimum.' },
    'red':     { minMuzzleEnergyFtLb: 1750, minMuzzleVelocityFps: 2450,
                 minBulletWeightGrains: 80, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Deer (Firearms etc.) (Scotland) Order 1985, as amended by SSI 2023/332 (in force 3 Nov 2023)',
                 citationUrl: 'https://www.legislation.gov.uk/ssi/2023/332/made',
                 notes: 'Min bullet 80gr (reduced from 100gr in Nov 2023); min muzzle velocity 2,450 fps; min muzzle energy 1,750 ft-lb. No statutory calibre minimum.' },
    'fallow':  { minMuzzleEnergyFtLb: 1750, minMuzzleVelocityFps: 2450,
                 minBulletWeightGrains: 80, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Deer (Firearms etc.) (Scotland) Order 1985, as amended by SSI 2023/332 (in force 3 Nov 2023)',
                 citationUrl: 'https://www.legislation.gov.uk/ssi/2023/332/made',
                 notes: 'Min bullet 80gr (reduced from 100gr in Nov 2023); min muzzle velocity 2,450 fps; min muzzle energy 1,750 ft-lb. No statutory calibre minimum.' },
    'sika':    { minMuzzleEnergyFtLb: 1750, minMuzzleVelocityFps: 2450,
                 minBulletWeightGrains: 80, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Deer (Firearms etc.) (Scotland) Order 1985, as amended by SSI 2023/332 (in force 3 Nov 2023)',
                 citationUrl: 'https://www.legislation.gov.uk/ssi/2023/332/made',
                 notes: 'Min bullet 80gr (reduced from 100gr in Nov 2023); min muzzle velocity 2,450 fps; min muzzle energy 1,750 ft-lb. No statutory calibre minimum.' },
    'muntjac': { minMuzzleEnergyFtLb: null, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Not specified — species not naturalised in Scotland',
                 citationUrl: null,
                 notes: 'Muntjac are not naturalised in Scotland. The Deer (Firearms etc.) (Scotland) Order 1985 does not list specific thresholds. The larger-species regime (80gr / 2,450 fps / 1,750 ft-lb) would apply if encountered.' },
    'cwd':     { minMuzzleEnergyFtLb: null, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: null, minCalibreInches: null,
                 expandingBulletRequired: true,
                 citation: 'Not specified — species not naturalised in Scotland',
                 citationUrl: null,
                 notes: 'Chinese water deer are not naturalised in Scotland. The Deer (Firearms etc.) (Scotland) Order 1985 does not list specific thresholds. The larger-species regime (80gr / 2,450 fps / 1,750 ft-lb) would apply if encountered.' },
  },
  'northern-ireland': {
    'roe':     { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 100, minCalibreInches: 0.236,
                 bulletWeightAlternative: 'expanding',
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Schedule 11 paras. 2, 7 and 8 (read with Art. 19(3)(a))',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171/schedule/11',
                 notes: 'Min calibre .236" (6 mm); min muzzle energy 1,700 ft-lb (2,305 J). Sch. 11 para. 8 prohibits any rifle bullet "other than\u2014(a) a bullet weighing not less than 100 grains (6.48 grammes); (b) an expanding bullet designed to deform in a predictable manner and thereby increase its effective diameter upon entering tissue." The two limbs are printed as alternatives with no "and" between them, so an expanding bullet under 100 grains satisfies para. 8 on limb (b). Expanding construction is still required here because the permissive reading of limb (a) alone \u2014 a heavy non-expanding bullet \u2014 is contested and is not the reading this app will hand a stalker.' },
    'red':     { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 100, minCalibreInches: 0.236,
                 bulletWeightAlternative: 'expanding',
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Schedule 11 paras. 2, 7 and 8 (read with Art. 19(3)(a))',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171/schedule/11',
                 notes: 'Min calibre .236" (6 mm); min muzzle energy 1,700 ft-lb (2,305 J). Sch. 11 para. 8 prohibits any rifle bullet "other than\u2014(a) a bullet weighing not less than 100 grains (6.48 grammes); (b) an expanding bullet designed to deform in a predictable manner and thereby increase its effective diameter upon entering tissue." The two limbs are printed as alternatives with no "and" between them, so an expanding bullet under 100 grains satisfies para. 8 on limb (b). Expanding construction is still required here because the permissive reading of limb (a) alone \u2014 a heavy non-expanding bullet \u2014 is contested and is not the reading this app will hand a stalker.' },
    'fallow':  { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 100, minCalibreInches: 0.236,
                 bulletWeightAlternative: 'expanding',
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Schedule 11 paras. 2, 7 and 8 (read with Art. 19(3)(a))',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171/schedule/11',
                 notes: 'Min calibre .236" (6 mm); min muzzle energy 1,700 ft-lb (2,305 J). Sch. 11 para. 8 prohibits any rifle bullet "other than\u2014(a) a bullet weighing not less than 100 grains (6.48 grammes); (b) an expanding bullet designed to deform in a predictable manner and thereby increase its effective diameter upon entering tissue." The two limbs are printed as alternatives with no "and" between them, so an expanding bullet under 100 grains satisfies para. 8 on limb (b). Expanding construction is still required here because the permissive reading of limb (a) alone \u2014 a heavy non-expanding bullet \u2014 is contested and is not the reading this app will hand a stalker.' },
    'sika':    { minMuzzleEnergyFtLb: 1700, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 100, minCalibreInches: 0.236,
                 bulletWeightAlternative: 'expanding',
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Schedule 11 paras. 2, 7 and 8 (read with Art. 19(3)(a))',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171/schedule/11',
                 notes: 'Min calibre .236" (6 mm); min muzzle energy 1,700 ft-lb (2,305 J). Sch. 11 para. 8 prohibits any rifle bullet "other than\u2014(a) a bullet weighing not less than 100 grains (6.48 grammes); (b) an expanding bullet designed to deform in a predictable manner and thereby increase its effective diameter upon entering tissue." The two limbs are printed as alternatives with no "and" between them, so an expanding bullet under 100 grains satisfies para. 8 on limb (b). Expanding construction is still required here because the permissive reading of limb (a) alone \u2014 a heavy non-expanding bullet \u2014 is contested and is not the reading this app will hand a stalker.' },
    'muntjac': { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 50, minCalibreInches: 0.220,
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Article 20(8A) (inserted by Wildlife and Natural Environment Act (NI) 2011 s.17)',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171/article/20',
                 notes: 'NI Article 20(8A) provides a muntjac/CWD-specific exemption: min calibre .220" (instead of .236"), min muzzle energy 1,000 ft-lb (1,356 J), soft-nosed or hollow-nosed bullet weighing not less than 50 grains. Muntjac are not naturalised in NI but the legal threshold permits .22 centrefire if encountered.' },
    'cwd':     { minMuzzleEnergyFtLb: 1000, minMuzzleVelocityFps: null,
                 minBulletWeightGrains: 50, minCalibreInches: 0.220,
                 expandingBulletRequired: true,
                 citation: 'Wildlife (NI) Order 1985, Article 20(8A) (inserted by Wildlife and Natural Environment Act (NI) 2011 s.17)',
                 citationUrl: 'https://www.legislation.gov.uk/nisi/1985/171/article/20',
                 notes: 'NI Article 20(8A) provides a muntjac/CWD-specific exemption: min calibre .220" (instead of .236"), min muzzle energy 1,000 ft-lb (1,356 J), soft-nosed or hollow-nosed bullet weighing not less than 50 grains. Chinese water deer are not naturalised in NI but the legal threshold permits .22 centrefire if encountered.' },
  },
});

// ── Lead-ammunition restriction (REACH SI 2026/195) ─────────────────────

export const LEAD_AMMO_RESTRICTION = Object.freeze({
  inForceFromIso: '2029-04-01',
  appliesToJurisdictions: ['england-wales', 'scotland'],
  citation: 'The REACH (Amendment) Regulations 2026 (SI 2026/195)',
  citationUrl: 'https://www.gov.uk/government/publications/uk-reach-restriction-for-lead-in-ammunition-27-june-2025',
  description: 'Lead-projectile ammunition for live quarry shooting is restricted in Great Britain from 1 April 2029.',
});

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Look up the statutory thresholds for a (jurisdiction, species) pair.
 * Returns null if unknown. The returned object is frozen — do not mutate.
 */
export function thresholdFor(jurisdictionCode, speciesCode) {
  const j = THRESHOLDS[jurisdictionCode];
  if (!j) return null;
  const t = j[speciesCode];
  return t || null;
}

/**
 * Convenience: minimum muzzle energy in ft-lb. Returns null if unknown
 * OR if the jurisdiction does not specify a minimum for that species
 * (e.g. muntjac in Scotland).
 */
export function minMuzzleEnergyFor(jurisdictionCode, speciesCode) {
  const t = thresholdFor(jurisdictionCode, speciesCode);
  return t ? t.minMuzzleEnergyFtLb : null;
}

/** Statutory citation string for a (jurisdiction, species) pair. */
export function citationFor(jurisdictionCode, speciesCode) {
  const t = thresholdFor(jurisdictionCode, speciesCode);
  return t ? t.citation : null;
}

/**
 * Classify an energy value against the statutory threshold:
 *   'green'   — comfortably above (>= threshold + 10%)
 *   'amber'   — at or just above threshold (within +10%)
 *   'red'     — below threshold
 *   'unknown' — no threshold available
 *
 * The +10% buffer is a UI choice, not a legal one.
 */
export function classifyEnergy(energyFtLb, jurisdictionCode, speciesCode) {
  const min = minMuzzleEnergyFor(jurisdictionCode, speciesCode);
  if (min == null || !Number.isFinite(energyFtLb)) return 'unknown';
  if (energyFtLb < min) return 'red';
  if (energyFtLb < min * 1.10) return 'amber';
  return 'green';
}

/**
 * Does the statute publish any numeric figure at all for this pair?
 *
 * Scotland's order names red, sika, fallow and roe. Muntjac and Chinese water
 * deer are not naturalised there and the order is silent on them, so all four
 * numeric fields come back null. That silence is not permission: an empty
 * threshold set means the app does not know what the floor is, not that there
 * is no floor. Callers must render 'unknown' on the back of a false here and
 * must never let it roll up to a pass — which is exactly what a rollup that
 * skips missing checks used to do, answering "Pass" for a .22 Hornet on a
 * Scottish muntjac.
 */
export function hasPublishedFigures(jurisdictionCode, speciesCode) {
  const t = thresholdFor(jurisdictionCode, speciesCode);
  if (!t) return false;
  return t.minMuzzleEnergyFtLb != null
      || t.minMuzzleVelocityFps != null
      || t.minBulletWeightGrains != null
      || t.minCalibreInches != null;
}

/**
 * Does an expanding bullet satisfy this jurisdiction's bullet-weight rule on
 * its own? True only where the statute prints the weight limb and the
 * expanding limb as alternatives — Northern Ireland's Sch. 11 para. 8.
 */
export function bulletWeightSatisfiedByExpanding(jurisdictionCode, speciesCode) {
  const t = thresholdFor(jurisdictionCode, speciesCode);
  return !!(t && t.bulletWeightAlternative === 'expanding');
}

/** Is this jurisdiction code known to the module? */
export function isKnownJurisdiction(code) {
  return JURISDICTIONS.some(j => j.code === code);
}

/** Is this species code known to the module? */
export function isKnownSpecies(code) {
  return DEER_SPECIES.some(s => s.code === code);
}

// ── The expanding-bullet requirement ───────────────────────────────────────
//
// All three jurisdictions require an expanding bullet for deer: "soft-nosed or
// hollow-nosed" in England & Wales (Deer Act 1991 Sch. 2, and s.6(6) for
// muntjac/CWD), "an expanding bullet designed to deform in a predictable
// manner" in Northern Ireland (SI 1985/171 Sch. 11), and the same wording in
// Scotland's 2023 Order. The calculator's compliance card turns the
// `construction` tag on a data/ammo-loads.json record into a verdict on that
// requirement — which is the moment a string in a JSON file becomes a
// statement about the law, made to someone who is about to take a shot.
//
// This is an ALLOWLIST, and that is the whole point of it. The gate it
// replaces read `construction !== 'fmj'`, which answers "expanding, lawful"
// for every tag it has never met. Nothing in the database triggered that
// today, so it was never a live bug — but a denylist is only ever as true as
// the last time someone remembered to extend it. Add a hard-cast, a ball
// round or a dangerous-game solid to the ammo database and the old gate would
// have called it lawful for deer without a word. There is no tag we can
// forget to list that makes an allowlist lie. Same reasoning, and the same
// shape, as LEAD_FREE_CONSTRUCTIONS in lib/fl-lead-free-matcher.js.
//
// Unrecognised is deliberately NOT 'fail'. A tag this module has not heard of
// is a gap in our data, not evidence about the ammunition, and telling a
// stalker that a lawful load is illegal is its own kind of wrong. It resolves
// to null — "we cannot say, check it yourself" — which is both the honest
// answer and the safe one, because it never blesses anything.
//
// Some deliberate omissions, since with an allowlist what is left out is the
// design:
//   * 'subsonic' names a velocity class, not a construction, and says nothing
//     about whether the bullet expands. One load in the database carries it
//     (Hornady .308 175gr Sub-X) and it is separately unlawful for deer on
//     energy grounds anyway, so it reads as "verify" rather than as a pass.
//   * 'solid-copper' is out while 'monolithic-copper' is in: a monolithic
//     copper hunting bullet (TSX, CX, GECO Star) is expanding by design, but
//     "solid" in ballistics means a projectile built NOT to deform, and that
//     tag straddles both readings.
//   * 'match' / 'otm' are out. An open-tip match bullet has a hole in the
//     nose and is still not designed to expand — legally the greyest tag
//     there is, and grey belongs in null.

/** Construction tags that denote an expanding projectile. */
export const EXPANDING_CONSTRUCTIONS = new Set([
  'soft-point', 'soft-nose', 'soft-nosed', 'sp',
  'bonded', 'bonded-soft-point',
  'polymer-tip', 'plastic-tip', 'ballistic-tip', 'tipped',
  'hollow-point', 'hollow-nose', 'hollow-nosed', 'hp',
  'monolithic-copper',
  'expanding',
]);

/** Construction tags that denote a projectile which is not designed to
 *  deform. Unlawful for deer in every UK jurisdiction. */
export const NON_EXPANDING_CONSTRUCTIONS = new Set([
  'fmj', 'full-metal-jacket', 'full-metal-jacketed', 'jacketed-solid',
  'ball', 'solid', 'monolithic-solid', 'brass-solid', 'steel-core',
  'hard-cast', 'non-expanding', 'subsonic-non-expanding',
]);

/**
 * Does a construction tag denote an expanding bullet?
 *
 *   true  — a recognised expanding type
 *   false — a recognised non-expanding type (unlawful for deer in the UK)
 *   null  — nothing recorded, or a tag this module does not recognise
 *
 * Comparison ignores case and surrounding whitespace. Anything that is not a
 * string counts as nothing recorded.
 */
export function isExpandingConstruction(construction) {
  if (typeof construction !== 'string') return null;
  const c = construction.trim().toLowerCase();
  if (!c) return null;
  if (EXPANDING_CONSTRUCTIONS.has(c)) return true;
  if (NON_EXPANDING_CONSTRUCTIONS.has(c)) return false;
  return null;
}
