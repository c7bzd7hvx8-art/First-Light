/* Cull Diary — App v2.0 */
// ══════════════════════════════════════════════════════════════
// CULL PLAN — targets vs actuals
// ══════════════════════════════════════════════════════════════
var cullTargets = {}; // { 'Red Deer-m': 10, 'Red Deer-f': 12, ... }
var prevSeasonTargets = {}; // for copy-from-prev
/** Serialized targets sheet inputs after open or save — for unsaved-close guard. */
var targetsSheetSavedSnapshot = null;

var PLAN_SPECIES = [
  { name:'Red Deer',  color:'#c8a84b', key:'red',     mLbl:'Stag', fLbl:'Hind' },
  { name:'Roe Deer',  color:'#5a7a30', key:'roe',     mLbl:'Buck', fLbl:'Doe'  },
  { name:'Fallow',    color:'#f57f17', key:'fallow',  mLbl:'Buck', fLbl:'Doe'  },
  { name:'Muntjac',   color:'#6a1b9a', key:'muntjac', mLbl:'Buck', fLbl:'Doe'  },
  { name:'Sika',      color:'#1565c0', key:'sika',    mLbl:'Stag', fLbl:'Hind' },
  { name:'CWD',       color:'#00695c', key:'cwd',     mLbl:'Buck', fLbl:'Doe'  },
];

/** Match PLAN_SPECIES row for syndicate / plan UIs; unknown names get a neutral dot. */
function planSpeciesMeta(name) {
  for (var i = 0; i < PLAN_SPECIES.length; i++) {
    if (PLAN_SPECIES[i].name === name) return PLAN_SPECIES[i];
  }
  return { name: name, color: '#5a7a30', mLbl: 'Male', fLbl: 'Female' };
}

function isCurrentSeason(season) {
  var now = new Date();
  var m = now.getMonth() + 1, y = now.getFullYear();
  var startYear = m >= 8 ? y : y - 1;
  return season === startYear + '-' + String(startYear + 1).slice(-2);
}

async function loadTargets(season) {
  if (!sb || !currentUser) return;
  try {
    var r = await sb.from('cull_targets')
      .select('species, sex, target')
      .eq('user_id', currentUser.id)
      .eq('season', season);
    cullTargets = {};
    if (r.data) {
      r.data.forEach(function(row) {
        cullTargets[row.species + '-' + row.sex] = row.target;
      });
    }
  } catch(e) { console.warn('loadTargets error:', e); }
}

async function loadPrevTargets(season) {
  // Load targets from the season before current for copy functionality
  if (!sb || !currentUser) return;
  var parts = season.split('-');
  var prevStart = parseInt(parts[0]) - 1;
  var prevSeason = prevStart + '-' + String(prevStart + 1).slice(-2);
  try {
    var r = await sb.from('cull_targets')
      .select('species, sex, target')
      .eq('user_id', currentUser.id)
      .eq('season', prevSeason);
    prevSeasonTargets = {};
    if (r.data) {
      r.data.forEach(function(row) {
        prevSeasonTargets[row.species + '-' + row.sex] = row.target;
      });
    }
  } catch(e) { console.warn('loadPrevTargets error:', e); }
}

/** Plan / stats — target reticle (matches diary.html `.plan-empty-icon` SVG). */
var SVG_PLAN_TARGET_ICON =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="12" cy="12" r="8" stroke="#5a7a30" stroke-width="1.5" opacity="0.55"/>' +
  '<circle cx="12" cy="12" r="3" stroke="#c8a84b" stroke-width="1.3"/>' +
  '<circle cx="12" cy="12" r="1" fill="#c8a84b"/>' +
  '<line x1="12" y1="2" x2="12" y2="5" stroke="#5a7a30" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>' +
  '<line x1="12" y1="19" x2="12" y2="22" stroke="#5a7a30" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>' +
  '<line x1="2" y1="12" x2="5" y2="12" stroke="#5a7a30" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>' +
  '<line x1="19" y1="12" x2="22" y2="12" stroke="#5a7a30" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>' +
  '</svg>';

var SVG_CULL_MAP_EMPTY_PIN =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#5a7a30" fill-opacity="0.2" stroke="#5a7a30" stroke-width="1.2"/>' +
  '<circle cx="12" cy="9" r="2.2" fill="#c8a84b"/>' +
  '</svg>';

/** Stroke / fill icons — replaces emoji in diary UI (trusted markup only). */
var SVG_FL_CLOUD =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M7 18h11a4 4 0 0 0 0-8 0h-.5A5.5 5.5 0 0 0 7 11a4 4 0 0 0 0 7z"/></svg>';
var SVG_FL_CLIPBOARD =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M6 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>' +
  '<path d="M9 12h6M9 16h4"/></svg>';
var SVG_FL_CAMERA =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M8 6h2l1-2h4l1 2h2"/></svg>';
var SVG_FL_IMAGE_GALLERY =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
var SVG_FL_IMAGE_OFF =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
  '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="5" y1="19" x2="19" y2="7"/></svg>';
var SVG_FL_PIN =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 21s7-4.35 7-11a7 7 0 1 0-14 0c0 6.65 7 11 7 11z"/><circle cx="12" cy="10" r="2.2" fill="currentColor" stroke="none"/></svg>';
var SVG_FL_GPS =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>' +
  '<line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>';
var SVG_FL_PENCIL =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
var SVG_FL_FILE_PDF =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
  '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
var SVG_FL_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
  '<line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
var SVG_FL_BOOK =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' +
  '<path d="M8 7h8M8 11h6"/></svg>';
var SVG_FL_QUICK =
  '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M13 1L3 15h7l-1.5 10L21 9h-8l1-8z"/></svg>';
var SVG_FL_SIGNAL =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
  '<path d="M2 20h20"/><path d="M6 16v-6M10 16V8M14 16v-9M18 16V5"/></svg>';
var SVG_FL_TOAST_WARN =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
  '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
  '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
var SVG_FL_TOAST_OK =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
var SVG_FL_TOAST_INFO =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5"/><path d="M12 8h.01"/></svg>';
var SVG_WX_TEMP =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5">' +
  '<path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/><circle cx="12" cy="17" r="3" fill="currentColor" fill-opacity="0.25" stroke="none"/></svg>';
var SVG_WX_WIND =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
  '<path d="M4 10h10a2 2 0 1 0 0-4"/><path d="M4 14h14a3 3 0 1 1 0 6"/><path d="M6 18h9a2 2 0 1 0 0-4"/></svg>';
var SVG_WX_PRESSURE =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5">' +
  '<rect x="4" y="14" width="3" height="6" rx="0.5"/><rect x="10.5" y="10" width="3" height="10" rx="0.5"/><rect x="17" y="6" width="3" height="14" rx="0.5"/></svg>';
var SVG_WX_SKY_CLR =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
var SVG_WX_SKY_PTLY =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5">' +
  '<circle cx="17.5" cy="7" r="2.5"/><path d="M4 18h12a3 3 0 0 0 0-6h-.5A4.5 4.5 0 0 0 4 11a3 3 0 0 0 0 7z"/></svg>';
var SVG_WX_SKY_OVC =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M7 18h11a4 4 0 0 0 0-8 0h-.5A5.5 5.5 0 0 0 7 11a4 4 0 0 0 0 7z"/></svg>';
var SVG_WX_SKY_FOG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
  '<path d="M4 9h16M3 12h18M5 15h14"/></svg>';
var SVG_WX_SKY_DZ =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.4">' +
  '<path d="M4 14h14a3 3 0 0 0 0-6h-.5A4.5 4.5 0 0 0 4 10a3 3 0 0 0 0 4z"/>' +
  '<circle cx="8" cy="19" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/><circle cx="16" cy="19" r="1" fill="currentColor"/></svg>';
var SVG_WX_SKY_RAIN =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.4">' +
  '<path d="M4 13h14a3 3 0 0 0 0-6h-.5A4.5 4.5 0 0 0 4 9a3 3 0 0 0 0 4z"/>' +
  '<line x1="8" y1="17" x2="7" y2="21"/><line x1="12" y1="17" x2="11" y2="21"/><line x1="16" y1="17" x2="15" y2="21"/></svg>';
var SVG_WX_SKY_SHOWERS =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.4">' +
  '<path d="M4 13h14a3 3 0 0 0 0-6h-.5A4.5 4.5 0 0 0 4 9a3 3 0 0 0 0 4z"/>' +
  '<line x1="9" y1="16" x2="7" y2="20" stroke-width="2"/><line x1="15" y1="16" x2="13" y2="20" stroke-width="2"/></svg>';
var SVG_WX_SKY_SNOW =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
  '<path d="M4 13h14a3 3 0 0 0 0-6h-.5A4.5 4.5 0 0 0 4 9a3 3 0 0 0 0 4z"/>' +
  '<path d="M12 17v4M9.5 18.5l5 2.5M14.5 18.5l-5 2.5M10 19h4"/></svg>';
var SVG_WX_SKY_SNSH =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">' +
  '<path d="M4 13h14a3 3 0 0 0 0-6h-.5A4.5 4.5 0 0 0 4 9a3 3 0 0 0 0 4z"/>' +
  '<path d="M9 20l1-2M12 21l1-2M15 20l1-2M9 18l1 1M12 17l1 1M15 18l1 1"/></svg>';
var SVG_WX_SKY_TS =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5">' +
  '<path d="M4 14h16a3 3 0 0 0 0-6h-1a5 5 0 0 0-9.9-1A4 4 0 0 0 4 10"/>' +
  '<path d="M13 17l-2 4M10 17l-2 4M16 17l-2 4" stroke-linecap="round"/></svg>';
var SVG_WX_SKY_UNK =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke="currentColor" stroke-width="1.5">' +
  '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

function diaryCloudSaveInner(label) {
  return '<span class="di-btn-ic" aria-hidden="true">' + SVG_FL_CLOUD + '</span>' + label;
}

function diaryNoPhotoListHtml(spClass, species) {
  var ini = species && species.length ? esc(species.charAt(0)) : '';
  return '<div class="no-photo-placeholder ' + spClass + ' no-photo-placeholder--list" style="position:absolute;inset:0;">'
    + '<span class="di-ic di-ic--list-noph" aria-hidden="true">' + SVG_FL_IMAGE_OFF + '</span>'
    + '<div class="no-photo-list-cap">No photo</div>'
    + (ini ? '<div class="no-photo-list-sub">' + ini + '</div>' : '')
    + '</div>';
}

function diaryHeroNoPhotoHtml() {
  return '<div class="detail-hero-noph" aria-hidden="true">'
    + '<span class="di-ic di-ic--hero-noph">' + SVG_FL_IMAGE_OFF + '</span>'
    + '<div class="detail-hero-noph-t">No photo</div></div>';
}

function diaryPhotoThumbEmptyHtml() {
  return '<div class="photo-thumb-noph">'
    + '<span class="di-ic di-ic--thumb-noph" aria-hidden="true">' + SVG_FL_IMAGE_OFF + '</span>'
    + '<div class="photo-thumb-noph-t">No photo</div></div>';
}

function flToastParse(msg) {
  var m = String(msg == null ? '' : msg);
  if (/^✅\s*/.test(m)) return { kind: 'ok', text: m.replace(/^✅\s*/, '') };
  if (/^⚠️?\s*/.test(m)) return { kind: 'warn', text: m.replace(/^⚠️?\s*/, '') };
  if (/^✓\s*/.test(m)) return { kind: 'ok', text: m.replace(/^✓\s*/, '') };
  if (/^📋\s*/.test(m)) return { kind: 'info', text: m.replace(/^📋\s*/, '') };
  if (/^📷\s*/.test(m)) return { kind: 'info', text: m.replace(/^📷\s*/, '') };
  if (/^📍\s*/.test(m)) return { kind: 'info', text: m.replace(/^📍\s*/, '') };
  if (/^📶\s*/.test(m)) return { kind: 'info', text: m.replace(/^📶\s*/, '') };
  if (/^☁️?\s*/.test(m)) return { kind: 'info', text: m.replace(/^☁️?\s*/, '') };
  if (/^⏳\s*/.test(m)) return { kind: 'info', text: m.replace(/^⏳\s*/, '') };
  if (/^🗑\uFE0F?\s*/.test(m)) return { kind: 'info', text: m.replace(/^🗑\uFE0F?\s*/, '') };
  return { kind: 'info', text: m };
}

function renderPlanCard(entries, season) {
  var body = document.getElementById('plan-body');
  var editBtn = document.getElementById('plan-edit-btn');
  var planSub = document.getElementById('plan-sub');
  if (!body) return;

  // Hide edit button for past seasons
  var isCurrent = isCurrentSeason(season);
  if (editBtn) editBtn.style.display = isCurrent ? '' : 'none';
  if (planSub) planSub.textContent = isCurrent ? 'Cull targets vs actual' : 'Past season · read only';

  // Check if any targets set — either season or ground mode
  var hasSeasonTargets = Object.keys(cullTargets).some(function(k) { return cullTargets[k] > 0; });
  var hasGrndTargets = hasGroundTargets();
  var hasTargets = hasSeasonTargets || hasGrndTargets;
  if (!hasTargets) {
    body.innerHTML = isCurrent
      ? '<div class="plan-empty"><div class="plan-empty-icon" aria-hidden="true">' + SVG_PLAN_TARGET_ICON + '</div><div class="plan-empty-t">No targets set</div><div class="plan-empty-s">Set cull targets to track your season plan against actual results.</div><button type="button" class="plan-set-btn" data-fl-action="open-targets">Set targets</button></div>'
      : '<div class="plan-empty"><div class="plan-empty-icon" aria-hidden="true">' + SVG_PLAN_TARGET_ICON + '</div><div class="plan-empty-t">No targets were set</div><div class="plan-empty-s">No cull plan was recorded for this season.</div></div>';
    return;
  }

  // Count actuals per species/sex — filtered by ground if in ground mode
  var actuals = {};
  var filteredByGround = entries;
  if (planGroundFilter !== 'overview' && (savedGrounds.length > 0 || hasGroundTargets())) {
    if (planGroundFilter === '__unassigned__') {
      filteredByGround = entries.filter(function(e){ return !e.ground; });
    } else {
      filteredByGround = entries.filter(function(e){ return e.ground === planGroundFilter; });
    }
  }
  filteredByGround.forEach(function(e) {
    var k = e.species + '-' + e.sex;
    actuals[k] = (actuals[k] || 0) + 1;
  });

  // Determine which targets to use
  var activeTargets = cullTargets;
  if (planGroundFilter === 'overview') {
    if (groundLedPlanActive()) {
      var aggOverview = sumGroundTargetsAgg(groundTargets);
      activeTargets = summedGroundTargetsAnyPositive(aggOverview) ? aggOverview : cullTargets;
    } else if (hasGroundTargets()) {
      var hasSeasonT = Object.keys(cullTargets).some(function(k) { return cullTargets[k] > 0; });
      if (!hasSeasonT) {
        activeTargets = {};
        Object.keys(groundTargets).forEach(function(g) {
          Object.keys(groundTargets[g]).forEach(function(k) {
            activeTargets[k] = (activeTargets[k] || 0) + (groundTargets[g][k] || 0);
          });
        });
      }
    }
  } else if (savedGrounds.length > 0 || hasGroundTargets()) {
    activeTargets = groundTargets[planGroundFilter] || {};
  }

  var totalTarget = 0, totalActual = 0;
  var html = '';

  PLAN_SPECIES.forEach(function(sp, idx) {
    var mKey = sp.name + '-m';
    var fKey = sp.name + '-f';
    var mTarget = activeTargets[mKey] || 0;
    var fTarget = activeTargets[fKey] || 0;
    var mActual = actuals[mKey] || 0;
    var fActual = actuals[fKey] || 0;
    if (mTarget === 0 && fTarget === 0 && mActual === 0 && fActual === 0) return; // skip species with no targets and no actuals
    var spTarget = mTarget + fTarget;
    var spActual = mActual + fActual;
    totalTarget += spTarget;
    totalActual += spActual;

    if (idx > 0 && html) html += '<div class="plan-divider"></div>';

    html += '<div class="plan-sp-section">';
    html += '<div class="plan-sp-hdr">';
    html += '<div class="plan-sp-dot" style="background:' + sp.color + ';"></div>';
    html += '<div class="plan-sp-name">' + sp.name + '</div>';
    html += '<div class="plan-sp-total">' + spActual + '/' + spTarget + '</div>';
    html += '</div>';

    // Male row — show if target set OR actuals exist
    if (mTarget > 0 || mActual > 0) {
      var mPct = mTarget > 0 ? Math.min(100, Math.round(mActual / mTarget * 100)) : (mActual > 0 ? 100 : 0);
      var mDone = mTarget > 0 && mActual >= mTarget;
      var barColor = mTarget === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : mDone ? 'linear-gradient(90deg,#2d7a1a,#7adf7a)' : 'linear-gradient(90deg,#5a7a30,#7adf7a)';
      html += '<div class="plan-sex-row">';
      html += '<div class="plan-sex-icon">♂</div>';
      html += '<div class="plan-sex-lbl">' + sp.mLbl + '</div>';
      html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + mPct + '%;background:' + barColor + ';"></div></div>';
      html += '<div class="plan-count ' + (mDone ? 'plan-count-done' : mActual === 0 ? 'plan-count-zero' : '') + '">' + mActual + '/' + mTarget + (mDone ? ' ✓' : '') + '</div>';
      html += '</div>';
    }

    // Female row — show if target set OR actuals exist
    if (fTarget > 0 || fActual > 0) {
      var fPct = fTarget > 0 ? Math.min(100, Math.round(fActual / fTarget * 100)) : (fActual > 0 ? 100 : 0);
      var fDone = fTarget > 0 && fActual >= fTarget;
      var fBarColor = fTarget === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : fDone ? 'linear-gradient(90deg,#2d7a1a,#7adf7a)' : 'linear-gradient(90deg,#5a7a30,#7adf7a)';
      html += '<div class="plan-sex-row">';
      html += '<div class="plan-sex-icon">♀</div>';
      html += '<div class="plan-sex-lbl">' + sp.fLbl + '</div>';
      html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + fPct + '%;background:' + fBarColor + ';"></div></div>';
      html += '<div class="plan-count ' + (fDone ? 'plan-count-done' : fActual === 0 ? 'plan-count-zero' : '') + '">' + fActual + '/' + fTarget + (fDone ? ' ✓' : '') + '</div>';
      html += '</div>';
    }

    html += '</div>';
  });

  // Total row
  var totalPct = totalTarget > 0 ? Math.min(100, Math.round(totalActual / totalTarget * 100)) : 0;
  html += '<div class="plan-total-row">';
  html += '<div class="plan-total-lbl">Total</div>';
  html += '<div class="plan-total-bar"><div class="plan-total-fill" style="width:' + totalPct + '%;"></div></div>';
  html += '<div class="plan-total-count">' + totalActual + '/' + totalTarget + '</div>';
  html += '</div>';

  if (!isCurrent) html += '<div class="plan-past-note">Past season — read only</div>';

  body.innerHTML = html;
}

function openTargetsSheet() {
  if (!isCurrentSeason(currentSeason)) return; // only edit current season

  // Populate season steppers (sum of grounds + pool when that split is in use)
  var disp = getSeasonSheetDisplayTotals();
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    if (mEl) mEl.value = disp[sp.name + '-m'] || 0;
    if (fEl) fEl.value = disp[sp.name + '-f'] || 0;
  });

  // Show copy-from-prev if previous season has targets and current is empty
  var dispCopy = getSeasonSheetDisplayTotals();
  var hasCurrentTargets = Object.keys(dispCopy).some(function(k){ return dispCopy[k] > 0; });
  var hasPrevTargets = Object.keys(prevSeasonTargets).some(function(k){ return prevSeasonTargets[k] > 0; });
  var copyWrap = document.getElementById('copy-targets-wrap');
  if (copyWrap) copyWrap.style.display = (!hasCurrentTargets && hasPrevTargets) ? 'block' : 'none';

  // Update subtitle
  var sub = document.getElementById('tsheet-sub');
  if (sub) sub.textContent = currentSeason;

  // Build By ground DOM (hidden) so snapshots, dirty check, and live sync to Season total work.
  renderGroundSections();

  // Always open Season total first; By ground is one tap away (Unassigned lives there only).
  setTargetMode('season');
  refreshSeasonGroundLedHint();
  updateSeasonTotalFooter();
  setTargetsSheetSnapshot();

  document.getElementById('tsheet-ov').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function captureTargetsSheetSnapshot() {
  var parts = [];
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    parts.push('ttm:' + sp.key + ':' + (mEl ? (parseInt(mEl.value, 10) || 0) : -1));
    parts.push('ttf:' + sp.key + ':' + (fEl ? (parseInt(fEl.value, 10) || 0) : -1));
  });
  (savedGrounds || []).forEach(function(g, i) {
    var p = 'gt_' + i;
    PLAN_SPECIES.forEach(function(sp) {
      var mEl = document.getElementById(p + '_' + sp.key + 'm');
      var fEl = document.getElementById(p + '_' + sp.key + 'f');
      parts.push('g:' + p + ':' + sp.key + 'm:' + (mEl ? (parseInt(mEl.value, 10) || 0) : -1));
      parts.push('g:' + p + ':' + sp.key + 'f:' + (fEl ? (parseInt(fEl.value, 10) || 0) : -1));
    });
  });
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('gt_u_' + sp.key + 'm');
    var fEl = document.getElementById('gt_u_' + sp.key + 'f');
    parts.push('gu:' + sp.key + 'm:' + (mEl ? (parseInt(mEl.value, 10) || 0) : -1));
    parts.push('gu:' + sp.key + 'f:' + (fEl ? (parseInt(fEl.value, 10) || 0) : -1));
  });
  return parts.join('|');
}

function isTargetsSheetDirty() {
  var ov = document.getElementById('tsheet-ov');
  if (!ov || !ov.classList.contains('open')) return false;
  if (targetsSheetSavedSnapshot == null) return false;
  return captureTargetsSheetSnapshot() !== targetsSheetSavedSnapshot;
}

function setTargetsSheetSnapshot() {
  targetsSheetSavedSnapshot = captureTargetsSheetSnapshot();
}

/**
 * Close targets sheet. Pass `{ force: true }` after a successful save (skip unsaved prompt).
 * @returns {boolean} false if the user cancelled the unsaved-changes confirm; true if closed or was not open.
 */
function closeTargetsSheet(opts) {
  var ov = document.getElementById('tsheet-ov');
  if (!ov || !ov.classList.contains('open')) {
    document.body.style.overflow = '';
    targetsSheetSavedSnapshot = null;
    return true;
  }
  var force = opts && opts.force;
  if (!force && isTargetsSheetDirty()) {
    if (!confirm('You have target changes that are not saved yet.\n\nClose anyway and lose them?')) return false;
  }
  ov.classList.remove('open');
  document.body.style.overflow = '';
  targetsSheetSavedSnapshot = null;
  return true;
}

/** Live sums under Season total steppers (♂ / ♀ / all). */
function updateSeasonTotalFooter() {
  var mSum = 0;
  var fSum = 0;
  PLAN_SPECIES.forEach(function(sp) {
    var mel = document.getElementById('tt-' + sp.key + 'm');
    var fel = document.getElementById('tt-' + sp.key + 'f');
    mSum += parseInt(mel && mel.value, 10) || 0;
    fSum += parseInt(fel && fel.value, 10) || 0;
  });
  var elM = document.getElementById('tseason-total-m');
  var elF = document.getElementById('tseason-total-f');
  var elA = document.getElementById('tseason-total-all');
  if (elM) elM.textContent = String(mSum);
  if (elF) elF.textContent = String(fSum);
  if (elA) {
    var n = mSum + fSum;
    elA.textContent = n + (n === 1 ? ' animal' : ' animals');
  }
}

/** Sum all By ground steppers in the DOM (named + Unassigned). */
function readGroundTargetsSumFromDom() {
  var out = {};
  PLAN_SPECIES.forEach(function(sp) {
    out[sp.name + '-m'] = 0;
    out[sp.name + '-f'] = 0;
  });
  (savedGrounds || []).forEach(function(g, i) {
    var p = 'gt_' + i;
    PLAN_SPECIES.forEach(function(sp) {
      var mEl = document.getElementById(p + '_' + sp.key + 'm');
      var fEl = document.getElementById(p + '_' + sp.key + 'f');
      out[sp.name + '-m'] += parseInt(mEl && mEl.value, 10) || 0;
      out[sp.name + '-f'] += parseInt(fEl && fEl.value, 10) || 0;
    });
  });
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('gt_u_' + sp.key + 'm');
    var fEl = document.getElementById('gt_u_' + sp.key + 'f');
    out[sp.name + '-m'] += parseInt(mEl && mEl.value, 10) || 0;
    out[sp.name + '-f'] += parseInt(fEl && fEl.value, 10) || 0;
  });
  return out;
}

/** With named grounds: keep Season total steppers + footer in sync with By ground inputs (no save yet). */
function syncSeasonSteppersFromGroundDom() {
  if (!groundLedPlanActive()) return;
  if (!document.getElementById('gt_u_' + PLAN_SPECIES[0].key + 'm')) return;
  var sum = readGroundTargetsSumFromDom();
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    if (mEl) mEl.value = sum[sp.name + '-m'] || 0;
    if (fEl) fEl.value = sum[sp.name + '-f'] || 0;
  });
  updateSeasonTotalFooter();
}

function tstep(id, delta) {
  var el = document.getElementById('tt-' + id);
  if (el) el.value = Math.max(0, (parseInt(el.value) || 0) + delta);
  updateSeasonTotalFooter();
  syncUnassignedSteppersFromSeasonFormDom();
}

function copyTargetsFromPrev() {
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    if (mEl) mEl.value = prevSeasonTargets[sp.name + '-m'] || 0;
    if (fEl) fEl.value = prevSeasonTargets[sp.name + '-f'] || 0;
  });
  document.getElementById('copy-targets-wrap').style.display = 'none';
  updateSeasonTotalFooter();
  syncUnassignedSteppersFromSeasonFormDom();
  showToast('📋 Targets copied from previous season');
}

async function saveTargets() {
  if (!sb || !currentUser) { showToast('⚠️ Not signed in'); return; }
  var btn = document.querySelector('.tsheet-save');
  btn.disabled = true; btn.innerHTML = diaryCloudSaveInner('Saving…');

  try {
    if (targetMode === 'ground') {
      await saveGroundTargets();
      showToast('✅ Targets saved');
      flHapticSuccess();
      closeTargetsSheet({ force: true });
      renderPlanGroundFilter();
      renderPlanCard(allEntries, currentSeason);
      btn.disabled = false; btn.innerHTML = diaryCloudSaveInner('Save targets');
      return;
    }

    // Season total mode — save to cull_targets; with named grounds, rebalance __unassigned__ only
    var rows = [];
    PLAN_SPECIES.forEach(function(sp) {
      var mEl = document.getElementById('tt-' + sp.key + 'm');
      var fEl = document.getElementById('tt-' + sp.key + 'f');
      var mVal = parseInt(mEl ? mEl.value : 0) || 0;
      var fVal = parseInt(fEl ? fEl.value : 0) || 0;
      rows.push({ user_id: currentUser.id, season: currentSeason, species: sp.name, sex: 'm', target: mVal });
      rows.push({ user_id: currentUser.id, season: currentSeason, species: sp.name, sex: 'f', target: fVal });
    });

    if (groundLedPlanActive()) {
      await loadGroundTargets(currentSeason);
      var namedAgg = sumNamedGroundsOnlyAgg(groundTargets);
      var uRows = [];
      var shortfall = null;
      PLAN_SPECIES.forEach(function(sp) {
        ['m', 'f'].forEach(function(sx) {
          var k = sp.name + '-' + sx;
          var want = 0;
          rows.forEach(function(row) {
            if (row.species === sp.name && row.sex === sx) want = row.target;
          });
          var onNamed = parseInt(namedAgg[k], 10) || 0;
          var u = want - onNamed;
          if (u < 0) shortfall = shortfall || (sp.name + (sx === 'm' ? ' stag/buck' : ' hind/doe'));
          uRows.push({
            user_id: currentUser.id, season: currentSeason, ground: '__unassigned__',
            species: sp.name, sex: sx, target: Math.max(0, u)
          });
        });
      });
      if (shortfall) {
        showToast('⚠️ That number is smaller than you already put on a ground (' + shortfall + '). Lower the ground first, or use By ground.');
        btn.disabled = false;
        btn.innerHTML = diaryCloudSaveInner('Save targets');
        return;
      }
      var ur = await sb.from('ground_targets').upsert(uRows, { onConflict: 'user_id,season,ground,species,sex' });
      if (ur.error) throw ur.error;
      await loadGroundTargets(currentSeason);
    }

    var r = await sb.from('cull_targets')
      .upsert(rows, { onConflict: 'user_id,season,species,sex' });

    if (r.error) throw r.error;

    cullTargets = {};
    rows.forEach(function(row) { cullTargets[row.species + '-' + row.sex] = row.target; });

    showToast('✅ Targets saved');
    flHapticSuccess();
    closeTargetsSheet({ force: true });
    renderPlanGroundFilter();
    renderPlanCard(allEntries, currentSeason);
  } catch(e) {
    showToast('⚠️ Save failed: ' + (e.message || 'Unknown error'));
  }
  btn.disabled = false; btn.innerHTML = diaryCloudSaveInner('Save targets');
}

// ════════════════════════════════════
// SUPABASE CONFIG — replace with your project URL and anon key
// Get these from: supabase.com → your project → Settings → API
// ════════════════════════════════════
var SUPABASE_URL  = 'https://sjaasuqeknvvmdpydfsz.supabase.co';
var SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqYWFzdXFla252dm1kcHlkZnN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NjMzMzIsImV4cCI6MjA5MDIzOTMzMn0.aiJaKoLCI3jUkOgifqMLuhp8NnAFK0T24Va6r2CLzgw';

var sb = null;
var SUPABASE_CONFIGURED = (SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_KEY !== 'YOUR_SUPABASE_ANON_KEY');

function initSupabase() {
  if (!SUPABASE_CONFIGURED) {
    // Show setup notice on auth card instead of crashing
    var note = document.querySelector('.auth-note');
    if (note) {
      note.innerHTML = '<span style="color:#c62828;font-weight:700;">Supabase not configured.</span><br>Open <strong>diary.js</strong> and set<br><code>SUPABASE_URL</code> and <code>SUPABASE_KEY</code><br>(replace the <code>YOUR_SUPABASE_*</code> placeholders).';
    }
    document.getElementById('auth-btn').disabled = true;
    return false;
  }
  try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return true;
  } catch(e) {
    showToast('⚠️ Supabase failed to initialise');
    return false;
  }
}

// ════════════════════════════════════
// STATE
// ════════════════════════════════════
var currentUser   = null;
var allEntries    = [];
/** All-season rows for Summary PDF modal only (see openSummaryFilter). */
var summaryEntryPool = null;
var filteredEntries = [];
var currentFilter = 'all';
var currentEntry  = null;
var editingId     = null;
var photoFile     = null;
var photoPreviewUrl = null;
var formSpecies   = '';

function revokeBlobPreviewUrl(u) {
  if (u && u.indexOf('blob:') === 0) {
    try { URL.revokeObjectURL(u); } catch (e) {}
  }
}

function fileToDataUrl(file) {
  return new Promise(function(resolve, reject) {
    var r = new FileReader();
    r.onload = function() { resolve(r.result); };
    r.onerror = function() { reject(r.error || new Error('read failed')); };
    r.readAsDataURL(file);
  });
}
var formSex       = '';

function enhanceKeyboardClickables(root) {
  var scope = root || document;
  var nodes = scope.querySelectorAll('[onclick]');
  nodes.forEach(function(el) {
    var tag = (el.tagName || '').toLowerCase();
    var nativeInteractive = /^(button|a|input|select|textarea|summary)$/.test(tag);
    if (nativeInteractive) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (el.dataset.kbBound === '1') return;
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
    el.dataset.kbBound = '1';
  });
}

function initDiaryFlUi() {
  document.body.addEventListener('click', function(e) {
    var el = e.target.closest('[data-fl-action]');
    if (!el) return;
    var act = el.getAttribute('data-fl-action');
    switch (act) {
      case 'auth-tab': authTab(el.getAttribute('data-tab')); break;
      case 'handle-auth': handleAuth(); break;
      case 'open-forgot-password': openForgotPasswordModal(); break;
      case 'close-forgot-password-modal': closeForgotPasswordModal(); break;
      case 'send-password-reset':
        void sendPasswordResetEmail();
        break;
      case 'submit-password-recovery':
        void submitPasswordRecovery();
        break;
      case 'cancel-password-recovery':
        void cancelPasswordRecovery();
        break;
      case 'filter-entries': filterEntries(el.getAttribute('data-species'), el); break;
      case 'filter-cull-map': filterCullMap(el.getAttribute('data-species'), el); break;
      case 'go': go(el.getAttribute('data-view')); break;
      case 'sync-offline': syncOfflineQueue(); break;
      case 'open-quick': openQuickEntry(); break;
      case 'open-new': openNewEntry(); break;
      case 'close-quick': closeQuickEntry(); break;
      case 'close-quick-then-new': closeQuickEntry(); openNewEntry(); break;
      case 'qs-pick': qsPick(el, el.getAttribute('data-species')); break;
      case 'qs-sex': qsSex(el.getAttribute('data-sex')); break;
      case 'save-quick': saveQuickEntry(); break;
      case 'form-back': formBack(); break;
      case 'photo-camera': offlinePhotoWarn(function(){ var c = document.getElementById('photo-input-camera'); if (c) c.click(); }); break;
      case 'photo-gallery': offlinePhotoWarn(function(){ var c = document.getElementById('photo-input-gallery'); if (c) c.click(); }); break;
      case 'remove-photo': removePhoto(); break;
      case 'pick-species': pickSpecies(el, el.getAttribute('data-species')); break;
      case 'pick-sex': pickSex(el.getAttribute('data-sex')); break;
      case 'open-pin': openPinDrop(); break;
      case 'get-gps': getGPS(); break;
      case 'clear-pinned': clearPinnedLocation(); break;
      case 'reset-wt': resetWeightField(el.getAttribute('data-wt-field')); break;
      case 'save-entry': saveEntry(); break;
      case 'open-targets': openTargetsSheet(); break;
      case 'set-cull-layer': setCullLayer(el.getAttribute('data-layer')); break;
      case 'set-pin-layer': setPinLayer(el.getAttribute('data-layer')); break;
      case 'open-export': openExportModal(el.getAttribute('data-export-fmt')); break;
      case 'open-syndicate-export': openSyndicateExportModal(el.getAttribute('data-export-fmt')); break;
      case 'do-syndicate-export':
        void doSyndicateExport();
        break;
      case 'close-syndicate-export-modal': closeSyndicateExportModal(); break;
      case 'open-summary-filter':
        void openSummaryFilter();
        break;
      case 'do-export': doExport(el.getAttribute('data-export-scope')); break;
      case 'do-export-summary':
        doExportSummaryFiltered().catch(function(err) {
          if (typeof console !== 'undefined' && console.warn) console.warn('doExportSummaryFiltered', err);
          showToast('⚠️ Summary PDF failed — try again');
        });
        break;
      case 'close-export-modal': closeExportModal(); break;
      case 'close-summary-modal':
        closeSummaryFilterModal();
        break;
      case 'sign-out': signOut(); break;
      case 'confirm-delete-account': confirmDeleteAccount(); break;
      case 'delete-account': deleteAccount(); break;
      case 'close-delete-modal': closeDeleteModal(); break;
      case 'close-pin': closePinDrop(); break;
      case 'confirm-pin': confirmPinDrop(); break;
      case 'apply-manual-pin-coords': applyManualPinCoords(); break;
      case 'close-targets': closeTargetsSheet(); break;
      case 'copy-targets-prev': copyTargetsFromPrev(); break;
      case 'set-target-mode': setTargetMode(el.getAttribute('data-mode')); break;
      case 'show-add-ground': showAddGroundInput(); break;
      case 'hide-add-ground': hideAddGroundInput(); break;
      case 'confirm-add-ground': confirmAddGround(); break;
      case 'save-targets': saveTargets(); break;
      case 'tstep':
        tstep(el.getAttribute('data-step-id'), parseInt(el.getAttribute('data-step-delta'), 10));
        break;
      case 'close-photo-lb': closePhotoLightbox(); break;
      case 'open-detail': openDetail(el.getAttribute('data-entry-id')); break;
      case 'open-photo-lb': {
        var pu = el.getAttribute('data-photo-url');
        if (pu) openPhotoLightbox(decodeURIComponent(pu));
        break;
      }
      case 'open-edit-entry': openEditEntry(el.getAttribute('data-entry-id')); break;
      case 'export-single-pdf': exportSinglePDF(el.getAttribute('data-entry-id')); break;
      case 'delete-entry': deleteEntry(el.getAttribute('data-entry-id')); break;
      case 'gt-step':
        gtStep(el.getAttribute('data-gt-id'), parseInt(el.getAttribute('data-gt-delta'), 10));
        break;
      case 'toggle-ground': toggleGroundSection(el.getAttribute('data-ground-prefix')); break;
      case 'toggle-unassigned': toggleUnassignedBuffer(); break;
      case 'delete-ground-idx':
        e.stopPropagation();
        deleteGroundByIdx(el);
        break;
      case 'plan-ground-filter':
        setPlanGroundFilter(decodeURIComponent(el.getAttribute('data-plan-key') || ''));
        break;
      case 'open-syndicate-create': openSyndicateCreateSheet(); break;
      case 'close-syndicate-modal': closeSynModal(); break;
      case 'open-syndicate-manage':
        syndicateEditingId = el.getAttribute('data-syndicate-id');
        openSyndicateManageSheet(syndicateEditingId);
        break;
      case 'save-syndicate-create': saveSyndicateCreate(); break;
      case 'save-syndicate-targets': saveSyndicateTargets(); break;
      case 'save-syndicate-alloc': saveSyndicateAlloc(); break;
      case 'synd-generate-invite': syndGenerateInvite(); break;
      case 'synd-copy-invite': syndCopyInvite(el); break;
      case 'synd-leave': syndLeaveOrClose(); break;
      case 'synd-delete': syndDelete(); break;
      case 'synd-remove-member':
        syndRemoveMember(el.getAttribute('data-member-user-id'));
        break;
      case 'synd-tstep':
        syndTstep(el.getAttribute('data-step-id'), parseInt(el.getAttribute('data-step-delta'), 10));
        break;
      case 'pinmap-select':
        pinmapSelectResult(
          parseFloat(el.getAttribute('data-lat')),
          parseFloat(el.getAttribute('data-lng')),
          decodeURIComponent(el.getAttribute('data-place-name') || '')
        );
        break;
      default: return;
    }
    e.preventDefault();
  });

  document.body.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target.closest('[data-fl-action]');
    if (!el) return;
    if (el.matches('button,a,input,textarea,select')) return;
    e.preventDefault();
    el.click();
  });

  var qso = document.getElementById('qs-overlay');
  if (qso) qso.addEventListener('click', function(ev) { if (ev.target === qso) closeQuickEntry(); });
  var tso = document.getElementById('tsheet-ov');
  if (tso) tso.addEventListener('click', function(ev) { if (ev.target === tso) closeTargetsSheet(); });
  var syno = document.getElementById('syn-ov');
  if (syno) syno.addEventListener('click', function(ev) { if (ev.target === syno) closeSynModal(); });
  var synExp = document.getElementById('syndicate-export-modal');
  if (synExp) synExp.addEventListener('click', function(ev) { if (ev.target === synExp) closeSyndicateExportModal(); });
  var forgotMo = document.getElementById('forgot-password-modal');
  if (forgotMo) forgotMo.addEventListener('click', function(ev) { if (ev.target === forgotMo) closeForgotPasswordModal(); });
  var plb = document.getElementById('photo-lightbox');
  if (plb) plb.addEventListener('click', function(ev) { if (ev.target === plb) closePhotoLightbox(); });

  var seasonSel = document.getElementById('season-select');
  if (seasonSel) seasonSel.addEventListener('change', changeSeason);
  var seasonStats = document.getElementById('season-select-stats');
  if (seasonStats && seasonSel) {
    seasonStats.addEventListener('change', function() {
      seasonSel.value = seasonStats.value;
      changeSeason();
    });
  }

  var fg = document.getElementById('f-ground');
  if (fg) fg.addEventListener('change', function() { handleGroundSelect(fg); });
  var fc = document.getElementById('f-calibre-sel');
  if (fc) fc.addEventListener('change', function() { handleCalibreSelect(fc); });
  var fp = document.getElementById('f-placement');
  if (fp) fp.addEventListener('change', function() { handlePlacementSelect(fp); });

  var pic = document.getElementById('photo-input-camera');
  var pig = document.getElementById('photo-input-gallery');
  if (pic) pic.addEventListener('change', function(ev) { handlePhoto(ev.target); });
  if (pig) pig.addEventListener('change', function(ev) { handlePhoto(ev.target); });

  var psearch = document.getElementById('pinmap-search');
  if (psearch) {
    psearch.addEventListener('input', function() { pinmapSearchDebounce(psearch.value); });
    psearch.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') pinmapSearchNow(psearch.value);
    });
  }

  var gadd = document.getElementById('ground-add-inp');
  if (gadd) {
    gadd.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') confirmAddGround();
      if (ev.key === 'Escape') hideAddGroundInput();
    });
  }

  var delInp = document.getElementById('delete-confirm-input');
  if (delInp) delInp.addEventListener('input', checkDeleteInput);
  var formScroll = document.querySelector('#v-form .form-scroll');
  if (formScroll) formScroll.addEventListener('scroll', requestFormProgressUpdate, { passive:true });

  var fshoot = document.getElementById('f-shooter');
  if (fshoot) {
    fshoot.addEventListener('input', function() {
      fshoot.classList.toggle('shooter-self', fshoot.value === '' || fshoot.value === 'Self');
    });
  }

  document.body.addEventListener('change', function(ev) {
    if (ev.target.classList && ev.target.classList.contains('tstep-val')) {
      updateGroundRollup();
      if (ev.target.id && ev.target.id.indexOf('tt-') === 0) {
        updateSeasonTotalFooter();
        syncUnassignedSteppersFromSeasonFormDom();
      }
      if (ev.target.id && (ev.target.id.indexOf('gt_') === 0 || ev.target.id.indexOf('gt_u_') === 0)) {
        syncSeasonSteppersFromGroundDom();
      }
    }
  });

  var tsOv = document.getElementById('tsheet-ov');
  if (tsOv) {
    tsOv.addEventListener('input', function(ev) {
      if (!ev.target.classList || !ev.target.classList.contains('tstep-val') || !ev.target.id) return;
      if (ev.target.id.indexOf('tt-') === 0) {
        updateSeasonTotalFooter();
        syncUnassignedSteppersFromSeasonFormDom();
      }
      if (ev.target.id.indexOf('gt_') === 0 || ev.target.id.indexOf('gt_u_') === 0) {
        updateGroundRollup();
        syncSeasonSteppersFromGroundDom();
      }
    });
  }

  document.addEventListener('keydown', function(ev) {
    if (ev.key !== 'Escape') return;
    var tsEsc = document.getElementById('tsheet-ov');
    if (!tsEsc || !tsEsc.classList.contains('open')) return;
    var gaddEsc = document.getElementById('ground-add-inp');
    if (gaddEsc && document.activeElement === gaddEsc) return;
    ev.preventDefault();
    closeTargetsSheet();
  });
}

// ════════════════════════════════════
// SEASON HELPERS — fully dynamic
// ════════════════════════════════════
function getCurrentSeason() {
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth() + 1; // 1-12
  // Season runs Aug-Jul, so Aug 2025 → Jul 2026 = "2025-26"
  var startYear = m >= 8 ? y : y - 1;
  return startYear + '-' + String(startYear + 1).slice(-2);
}

function seasonLabel(s) {
  var parts = s.split('-');
  var y1 = parts[0];
  var y2 = parts[1].length === 2 ? '20' + parts[1] : parts[1];
  return y1 + '–' + y2 + ' Season';
}

function buildSeasonFromEntry(dateStr) {
  // Given an entry date, return which season it belongs to
  if (dateStr == null || dateStr === '') return getCurrentSeason();
  var raw = String(dateStr).trim();
  if (!raw) return getCurrentSeason();
  // Parse manually to avoid UTC midnight timezone shift (YYYY-MM-DD parsed by new Date() = UTC)
  var parts = raw.split('-');
  if (parts.length < 2) return getCurrentSeason();
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10); // 1–12 exact, no timezone offset
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return getCurrentSeason();
  var startYear = m >= 8 ? y : y - 1;
  if (!Number.isFinite(startYear)) return getCurrentSeason();
  return startYear + '-' + String(startYear + 1).slice(-2);
}

function populateSeasonDropdown(seasons) {
  var sel = document.getElementById('season-select');
  if (!sel) return;
  sel.innerHTML = '';
  seasons.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s;
    opt.textContent = seasonLabel(s);
    sel.appendChild(opt);
  });
  sel.value = currentSeason;
  // Sync stats season pill whenever list dropdown is populated
  var statsSel = document.getElementById('season-select-stats');
  if (statsSel) { statsSel.innerHTML = sel.innerHTML; statsSel.value = currentSeason; }
}

function buildSeasonList(earliestSeason) {
  // Build list from earliest season with entries up to current season
  var current = getCurrentSeason();
  var seasons = [];
  var startYear = parseInt(current.split('-')[0]);
  var endYear = earliestSeason ? parseInt(earliestSeason.split('-')[0]) : startYear;
  // Go from current back to earliest (or max 10 years)
  for (var y = startYear; y >= Math.max(endYear, startYear - 9); y--) {
    seasons.push(y + '-' + String(y + 1).slice(-2));
  }
  return seasons;
}

var currentSeason = getCurrentSeason();

// ════════════════════════════════════
// ROUTING
// ════════════════════════════════════
var VIEWS = ['v-auth','v-list','v-form','v-detail','v-stats'];
var NAV_MAP = {'v-list':'n-list','v-form':'n-form','v-stats':'n-stats'};
var formDirty = false;
/** After loadEntries / sign-out; cleared at end of buildStats — avoids full stats rebuild on every Stats tab visit. */
var statsNeedsFullRebuild = true;
var UNSAVED_FORM_MSG = 'You have unsaved changes. Leave without saving?';

function hasUnsavedFormChanges() {
  var formView = document.getElementById('v-form');
  return !!(formDirty && formView && formView.classList.contains('active'));
}

function confirmDiscardUnsavedForm() {
  if (!hasUnsavedFormChanges()) return true;
  if (!confirm(UNSAVED_FORM_MSG)) return false;
  formDirty = false;
  return true;
}

function go(id) {
  var target = document.getElementById(id);
  if (!target) return;
  var tsOvGo = document.getElementById('tsheet-ov');
  if (tsOvGo && tsOvGo.classList.contains('open') && !closeTargetsSheet()) return;
  // Warn if leaving form with unsaved changes
  if (id !== 'v-form' && !confirmDiscardUnsavedForm()) return;
  VIEWS.forEach(function(v){
    var el = document.getElementById(v);
    if (el) el.classList.remove('active');
  });
  target.classList.add('active');
  var nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.style.display = (id === 'v-auth') ? 'none' : 'flex';
  Object.keys(NAV_MAP).forEach(function(k){
    var nb = document.getElementById(NAV_MAP[k]);
    if (nb) nb.classList.remove('on');
  });
  if (NAV_MAP[id]) {
    var activeNav = document.getElementById(NAV_MAP[id]);
    if (activeNav) activeNav.classList.add('on');
  }
  window.scrollTo(0,0);
  if (id === 'v-form') {
    var fs = target.querySelector('.form-scroll');
    if (fs) fs.scrollTop = 0;
    requestFormProgressUpdate();
  }
  if (id === 'v-stats') {
    var statsSelGo = document.getElementById('season-select-stats');
    var listSelGo = document.getElementById('season-select');
    if (statsSelGo && listSelGo) {
      statsSelGo.innerHTML = listSelGo.innerHTML;
      statsSelGo.value = currentSeason;
    }
    // Always refresh syndicate strip (lightweight) so we never leave the static “sign in” placeholder
    if (sb && typeof renderSyndicateSection === 'function') {
      void renderSyndicateSection().then(function() {
        void updateSyndicateExportVisibility();
      });
    }
    if (!statsNeedsFullRebuild && cullMap) {
      setTimeout(function() {
        if (cullMap) {
          cullMap.invalidateSize();
          renderCullMapPins();
        }
        var sub = document.getElementById('cullmap-sub');
        if (sub) sub.textContent = 'Location history · ' + currentSeason;
      }, 150);
      return;
    }
    buildStats();
  }
}

function formBack() {
  if (!confirmDiscardUnsavedForm()) return;
  go('v-list');
}

var formProgressRaf = false;
function requestFormProgressUpdate() {
  if (formProgressRaf) return;
  formProgressRaf = true;
  requestAnimationFrame(function() {
    formProgressRaf = false;
    updateFormProgressChip();
  });
}

function updateFormProgressChip() {
  var chip = document.getElementById('form-progress-chip');
  var sc = document.querySelector('#v-form .form-scroll');
  if (!chip || !sc) return;
  var sections = Array.from(document.querySelectorAll('#v-form .fsec'));
  if (!sections.length) return;
  var active = 0;
  var scRect = sc.getBoundingClientRect();
  var marker = scRect.top + 30;
  for (var i = 0; i < sections.length; i++) {
    var secTop = sections[i].getBoundingClientRect().top;
    if (secTop <= marker) active = i;
  }
  sections.forEach(function(sec, idx) { sec.classList.toggle('is-current', idx === active); });
  var t = sections[active].querySelector('.fsec-title');
  var title = t ? t.textContent.trim() : '';
  chip.textContent = 'Section ' + (active + 1) + ' of ' + sections.length + (title ? ' · ' + title : '');
}

// Mark form dirty on any input change
document.addEventListener('DOMContentLoaded', function() {
  var form = document.getElementById('v-form');
  if (form) {
    form.addEventListener('input', function() { formDirty = true; });
    form.addEventListener('change', function() { formDirty = true; });
  }
});

window.addEventListener('beforeunload', function(e) {
  if (!hasUnsavedFormChanges()) return;
  e.preventDefault();
  e.returnValue = '';
});

document.addEventListener('click', function(e) {
  var link = e.target.closest('a[href]');
  if (!link) return;
  var href = link.getAttribute('href') || '';
  if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return;
  if (!confirmDiscardUnsavedForm()) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

function showToast(msg, duration) {
  var t = document.getElementById('toast');
  if (!t) return;
  var p = flToastParse(msg);
  var iconSvg = p.kind === 'warn' ? SVG_FL_TOAST_WARN : (p.kind === 'ok' ? SVG_FL_TOAST_OK : SVG_FL_TOAST_INFO);
  t.className = 'toast toast--' + p.kind;
  t.innerHTML = '<span class="toast-inner"><span class="toast-ic" aria-hidden="true">' + iconSvg + '</span><span class="toast-txt"></span></span>';
  var tx = t.querySelector('.toast-txt');
  if (tx) tx.textContent = p.text;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, duration || 2500);
}

function flReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { return false; }
}

/** One short pulse on devices that support Vibration API (typically Android Chrome). */
function flHapticSuccess() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(12);
    }
  } catch (e) { /* ignore */ }
}

function getListSkeletonHtml() {
  var rows = '';
  for (var i = 0; i < 6; i++) {
    rows += '<div class="skel-list-row"><div class="skel skel-thumb"></div><div class="skel-list-text">'
      + '<div class="skel skel-line skel-w40"></div><div class="skel skel-line skel-w70"></div><div class="skel skel-line skel-w30"></div></div></div>';
  }
  var cls = 'list-skeleton' + (flReducedMotion() ? '' : ' skel-shimmer');
  return '<div class="' + cls + '" aria-busy="true" aria-label="Loading entries">' + rows + '</div>';
}

function showEntriesListSkeleton() {
  var c = document.getElementById('entries-container');
  if (c) c.innerHTML = getListSkeletonHtml();
}

function getStatsSkeletonInnerHtml() {
  var cells = '';
  for (var i = 0; i < 4; i++) {
    cells += '<div class="stats-skel-cell"><div class="skel skel-stat-h"></div><div class="skel skel-stat-n"></div><div class="skel skel-stat-s"></div></div>';
  }
  return '<div class="stats-skel-statgrid">' + cells + '</div>'
    + '<div class="skel skel-map-block" aria-hidden="true"></div>'
    + '<div class="stats-skel-band"><div class="skel skel-band-t" aria-hidden="true"></div><div class="skel skel-band-r" aria-hidden="true"></div></div>'
    + '<div class="stats-skel-band"><div class="skel skel-band-t w40" aria-hidden="true"></div><div class="skel skel-chart" aria-hidden="true"></div></div>';
}

function ensureStatsLoadingOverlay() {
  var scroll = document.querySelector('#v-stats .stats-scroll');
  if (!scroll) return null;
  var el = document.getElementById('stats-loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stats-loading-overlay';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Loading statistics');
    scroll.insertBefore(el, scroll.firstChild);
  }
  el.innerHTML = getStatsSkeletonInnerHtml();
  el.className = 'stats-loading-overlay' + (flReducedMotion() ? '' : ' skel-shimmer');
  return el;
}

function showStatsLoadingOverlay() {
  var el = ensureStatsLoadingOverlay();
  if (el) {
    el.classList.add('is-on');
    el.hidden = false;
  }
}

function hideStatsLoadingOverlay() {
  var el = document.getElementById('stats-loading-overlay');
  if (el) {
    el.classList.remove('is-on');
    el.hidden = true;
  }
}

// ════════════════════════════════════
// AUTH
// ════════════════════════════════════
var authMode = 'signin';
/** True while user must set a new password (email reset link). Blocks normal sign-in redirect. */
var authRecoveryMode = false;

function isPasswordRecoveryUrl() {
  try {
    var h = window.location.hash;
    if (h && h.length > 2 && /type=recovery/i.test(decodeURIComponent(h))) return true;
  } catch (e) { /* ignore */ }
  return false;
}

function diaryShowPasswordRecovery() {
  if (authRecoveryMode) return;
  authRecoveryMode = true;
  currentUser = null;
  var std = document.getElementById('auth-standard-panel');
  var rec = document.getElementById('auth-recovery-panel');
  if (std) std.style.display = 'none';
  if (rec) rec.style.display = 'block';
  var p1 = document.getElementById('auth-recovery-pass');
  var p2 = document.getElementById('auth-recovery-pass2');
  if (p1) p1.value = '';
  if (p2) p2.value = '';
  var re = document.getElementById('auth-recovery-err');
  if (re) { re.style.display = 'none'; re.textContent = ''; }
  go('v-auth');
}

function diaryHidePasswordRecoveryUI() {
  authRecoveryMode = false;
  var std = document.getElementById('auth-standard-panel');
  var rec = document.getElementById('auth-recovery-panel');
  if (std) std.style.display = 'block';
  if (rec) rec.style.display = 'none';
}

function openForgotPasswordModal() {
  if (!sb) {
    showToast('⚠️ Supabase not configured');
    return;
  }
  var em = document.getElementById('auth-email');
  var fe = document.getElementById('forgot-password-email');
  if (fe && em) fe.value = em.value.trim();
  var err = document.getElementById('forgot-password-err');
  if (err) err.style.display = 'none';
  var m = document.getElementById('forgot-password-modal');
  if (m) m.style.display = 'flex';
}

function closeForgotPasswordModal() {
  var m = document.getElementById('forgot-password-modal');
  if (m) m.style.display = 'none';
}

async function sendPasswordResetEmail() {
  if (!sb) {
    showToast('⚠️ Supabase not configured');
    return;
  }
  var fe = document.getElementById('forgot-password-email');
  var err = document.getElementById('forgot-password-err');
  var email = fe && fe.value ? fe.value.trim() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (err) {
      err.textContent = 'Please enter a valid email address.';
      err.style.display = 'block';
    }
    return;
  }
  if (err) err.style.display = 'none';
  try {
    var redirectTo = window.location.origin + window.location.pathname;
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
    if (r.error) throw r.error;
    showToast('✅ Check your email for a reset link', 5000);
    closeForgotPasswordModal();
  } catch (e) {
    if (err) {
      err.textContent = e.message || 'Could not send reset email.';
      err.style.display = 'block';
    }
  }
}

async function submitPasswordRecovery() {
  if (!sb) return;
  var p1 = document.getElementById('auth-recovery-pass');
  var p2 = document.getElementById('auth-recovery-pass2');
  var errEl = document.getElementById('auth-recovery-err');
  var btn = document.getElementById('auth-recovery-btn');
  var a = p1 ? p1.value : '';
  var b = p2 ? p2.value : '';
  if (errEl) errEl.style.display = 'none';
  if (!a || a.length < 8) {
    if (errEl) {
      errEl.textContent = 'Password must be at least 8 characters.';
      errEl.style.display = 'block';
    }
    return;
  }
  if (a !== b) {
    if (errEl) {
      errEl.textContent = 'Passwords do not match.';
      errEl.style.display = 'block';
    }
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating…';
  }
  try {
    var result = await sb.auth.updateUser({ password: a });
    if (result.error) throw result.error;
    authRecoveryMode = false;
    diaryHidePasswordRecoveryUI();
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    showToast('✅ Password updated');
    var sess = await sb.auth.getSession();
    if (sess.data && sess.data.session && sess.data.session.user) {
      currentUser = sess.data.session.user;
      onSignedIn();
    }
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.message || 'Could not update password.';
      errEl.style.display = 'block';
    }
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Update password →';
  }
}

async function cancelPasswordRecovery() {
  if (sb) await sb.auth.signOut();
  authRecoveryMode = false;
  diaryHidePasswordRecoveryUI();
  if (window.location.hash) history.replaceState(null, '', window.location.pathname);
}

function authTab(mode) {
  authMode = mode;
  document.getElementById('tab-signin').classList.toggle('on', mode === 'signin');
  document.getElementById('tab-signup').classList.toggle('on', mode === 'signup');
  document.getElementById('auth-btn').textContent = mode === 'signin' ? 'Sign In →' : 'Create Account →';
  document.getElementById('auth-name-field').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-consent-field').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-err').style.display = 'none';
  document.getElementById('auth-password').setAttribute('autocomplete', mode === 'signin' ? 'current-password' : 'new-password');
  var fr = document.getElementById('auth-forgot-row');
  if (fr) fr.style.display = mode === 'signin' ? 'block' : 'none';
}

async function handleAuth() {
  if (!sb) { showToast('⚠️ Supabase not configured'); return; }
  var email = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-password').value;
  var errEl = document.getElementById('auth-err');
  var btn = document.getElementById('auth-btn');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Please enter email and password.'; errEl.style.display = 'block'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Please enter a valid email address.'; errEl.style.display = 'block'; return; }
  if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.style.display = 'block'; return; }
  if (authMode === 'signup' && !document.getElementById('auth-consent').checked) {
    errEl.textContent = 'Please agree to the Privacy Policy to create an account.'; errEl.style.display = 'block'; return;
  }
  btn.disabled = true;
  btn.textContent = authMode === 'signin' ? 'Signing in…' : 'Creating account…';
  try {
    var result;
    if (authMode === 'signin') {
      result = await sb.auth.signInWithPassword({ email: email, password: password });
    } else {
      var name = document.getElementById('auth-name').value.trim();
      result = await sb.auth.signUp({ email: email, password: password, options: { data: { full_name: name } } });
    }
    if (result.error) throw result.error;
    if (authMode === 'signup') {
      showToast('✅ Check your email to confirm your account', 4000);
      authTab('signin');
    } else {
      currentUser = result.data.user;
      onSignedIn();
    }
  } catch(e) {
    errEl.textContent = e.message || 'Authentication failed.';
    errEl.style.display = 'block';
  }
  btn.disabled = false;
  btn.textContent = authMode === 'signin' ? 'Sign In →' : 'Create Account →';
}

function destroyCullMapLeaflet() {
  statsNeedsFullRebuild = true;
  if (!cullMap) return;
  try {
    cullMap.remove();
  } catch (e) {}
  cullMarkers = [];
  cullMap = null;
  cullMapLayer = null;
  cullSatLayer = null;
}

async function signOut() {
  if (sb) await sb.auth.signOut();
  // Reset all session state so a new user starts clean
  currentUser = null;
  allEntries = [];
  filteredEntries = [];
  currentSeason = getCurrentSeason();
  currentFilter = 'all';
  cullTargets = {};
  groundTargets = {};
  savedGrounds = [];
  planGroundFilter = 'overview';
  targetMode = 'season';
  destroyCullMapLeaflet();
  hideStatsLoadingOverlay();
  go('v-auth');
}

function onSignedIn() {
  initWeightCalc();
  updateOfflineBadge();
  var meta = currentUser.user_metadata || {};
  var name = meta.full_name || currentUser.email.split('@')[0];
  var initials = name.split(' ').map(function(w){ return w[0]; }).join('').toUpperCase().slice(0,2);
  var av = document.getElementById('account-av');
  var nm = document.getElementById('account-name');
  var em = document.getElementById('account-email');
  if (av) av.textContent = initials;
  if (nm) nm.textContent = name;
  if (em) em.textContent = currentUser.email + ' · Synced';
  // Set current season label dynamically
  currentSeason = getCurrentSeason();
  var sl = document.getElementById('season-label');
  var ssl = document.getElementById('stats-season-lbl');
  if (sl) sl.textContent = seasonLabel(currentSeason);
  if (ssl) ssl.textContent = seasonLabel(currentSeason);
  go('v-list');
  loadGrounds();
  loadEntries();
  (async function() {
    await tryRedeemSyndicateInviteFromUrl();
    await ensureMySyndicateDisplayNames();
  })();
}

/** Apply Supabase session to UI (list view, loads). Clears URL hash after email-confirm redirect. */
function diaryApplyAuthSession(session) {
  if (!session || !session.user) return;
  if (authRecoveryMode) return;
  if (isPasswordRecoveryUrl()) {
    diaryShowPasswordRecovery();
    return;
  }
  if (currentUser && currentUser.id === session.user.id) {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    return;
  }
  currentUser = session.user;
  onSignedIn();
  if (window.location.hash) history.replaceState(null, '', window.location.pathname);
}

// Init on DOM ready
document.addEventListener('DOMContentLoaded', function() {
  initStatsMoreSection();
  if (!initSupabase()) return;
  initDiaryFlUi();
  enhanceKeyboardClickables(document);
  if ('MutationObserver' in window) {
    var kbObserver = new MutationObserver(function(muts) {
      muts.forEach(function(m) {
        if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(function(n) {
            if (n && n.nodeType === 1) enhanceKeyboardClickables(n);
          });
        }
      });
    });
    kbObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Subscribe first so PASSWORD_RECOVERY from reset links is handled before we auto-apply session to the list.
  (async function() {
    sb.auth.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_OUT') {
        currentUser = null;
        authRecoveryMode = false;
        diaryHidePasswordRecoveryUI();
        go('v-auth');
        return;
      }
      if (event === 'PASSWORD_RECOVERY') {
        diaryShowPasswordRecovery();
        return;
      }
      if (event === 'TOKEN_REFRESHED' && session && session.user) {
        if (authRecoveryMode) return;
        currentUser = session.user;
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && session.user) {
        if (authRecoveryMode) return;
        if (isPasswordRecoveryUrl()) {
          diaryShowPasswordRecovery();
          return;
        }
        if (currentUser && currentUser.id === session.user.id) {
          if (window.location.hash) history.replaceState(null, '', window.location.pathname);
          return;
        }
        diaryApplyAuthSession(session);
      }
    });

    try {
      var s = await sb.auth.getSession();
      if (s.data && s.data.session) {
        if (isPasswordRecoveryUrl()) {
          diaryShowPasswordRecovery();
        } else {
          // Defer so PASSWORD_RECOVERY can set authRecoveryMode first (reset-link edge cases).
          setTimeout(function() {
            if (authRecoveryMode) return;
            sb.auth.getSession().then(function(s2) {
              if (!s2.data || !s2.data.session) return;
              if (authRecoveryMode) return;
              diaryApplyAuthSession(s2.data.session);
            });
          }, 0);
        }
      }
    } catch (e) { /* no session */ }
  })();
});

// Register SW when diary is opened directly (index.html also registers — duplicate register is a no-op)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js').then(function(reg) {
      reg.addEventListener('updatefound', function() {
        var newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', function() {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('New version available — refresh the page to load it.', 6000);
          }
        });
      });
    }).catch(function() { /* file:// or blocked */ });
  });
}

// ════════════════════════════════════
// DATA
// ════════════════════════════════════
function seasonDates(season) {
  var parts = season.split('-');
  var y1 = parseInt(parts[0]); // e.g. 2025
  var y2 = y1 + 1;             // always next year (2026)
  return { start: y1 + '-08-01', end: y2 + '-07-31' };
}

// Season list + cards + stats + map: omit weather_data (JSONB can be large). Hydrate in openDetail.
var CULL_ENTRY_LIST_COLUMNS =
  'id,user_id,species,sex,date,time,location_name,lat,lng,weight_gralloch,weight_clean,weight_larder,' +
  'calibre,distance_m,shot_placement,age_class,notes,shooter,ground,destination,photo_url,created_at';

async function loadEntries() {
  if (!currentUser || !sb) return;
  var statsActive = document.getElementById('v-stats') && document.getElementById('v-stats').classList.contains('active');
  if (statsActive) showStatsLoadingOverlay();
  else showEntriesListSkeleton();

  try {
    // First fetch ALL entries to know which seasons exist
    var all = await sb.from('cull_entries')
      .select('date')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: true });

    // Build season list from actual entry dates
    var earliest = null;
    if (all.data && all.data.length > 0) {
      earliest = buildSeasonFromEntry(all.data[0].date);
    }
    var seasons = buildSeasonList(earliest);
    populateSeasonDropdown(seasons);

    // Now load entries for the current season
    var d = seasonDates(currentSeason);
    var r = await sb.from('cull_entries')
      .select(CULL_ENTRY_LIST_COLUMNS)
      .eq('user_id', currentUser.id)
      .gte('date', d.start)
      .lte('date', d.end)
      .order('date', { ascending: false });

    if (!r.error) {
      allEntries = r.data || [];
      await resolveCullPhotoDisplayUrls(allEntries);
      renderList();
      statsNeedsFullRebuild = true;
      if (statsActive) {
        buildStats();
        hideStatsLoadingOverlay();
      }
    } else {
      showToast('⚠️ Could not load entries');
      renderList();
      if (statsActive) {
        buildStats();
        hideStatsLoadingOverlay();
      }
    }
  } catch(e) {
    showToast('⚠️ Could not load entries');
    console.warn('loadEntries failed:', e);
    renderList();
    if (statsActive) {
      buildStats();
      hideStatsLoadingOverlay();
    }
  }
}

function changeSeason() {
  currentSeason = document.getElementById('season-select').value;
  document.getElementById('season-label').textContent = seasonLabel(currentSeason);
  loadEntries();
}

// ════════════════════════════════════
// RENDER LIST
// ════════════════════════════════════
var SPECIES_CLASS = { 'Red Deer':'sp-red','Roe Deer':'sp-roe','Fallow':'sp-fallow','Sika':'sp-sika','Muntjac':'sp-muntjac','CWD':'sp-cwd' };
var SEX_BADGE     = { 'm':'sx-st', 'f':'sx-hi' };  // overridden per species below
var SEX_LABEL     = { 'm':'Stag/Buck', 'f':'Hind/Doe' };
var MONTH_NAMES   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var FULL_MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function sexBadgeClass(sex, species) {
  if (sex === 'm') return (species === 'Roe Deer' || species === 'Fallow' || species === 'Muntjac' || species === 'Sika' || species === 'CWD') ? 'sx-bu' : 'sx-st';
  return (species === 'Roe Deer' || species === 'Fallow' || species === 'Muntjac' || species === 'Sika' || species === 'CWD') ? 'sx-do' : 'sx-hi';
}
function sexLabel(sex, species) {
  var isBuck = ['Roe Deer','Fallow','Muntjac','Sika','CWD'].indexOf(species) >= 0;
  if (sex === 'm') return isBuck ? 'Buck' : 'Stag';
  return isBuck ? 'Doe' : 'Hind';
}
/** YYYY-MM-DD calendar parts for local display; null if not three numeric segments with sane ranges */
function parseEntryDateParts(d) {
  if (d == null || d === '') return null;
  var raw = String(d).trim();
  if (!raw) return null;
  var parts = raw.split('-');
  if (parts.length < 3) return null;
  var y = parseInt(parts[0], 10);
  var mo = parseInt(parts[1], 10);
  var day = parseInt(parts[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(day)) return null;
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  return { y: y, m: mo, day: day };
}

function fmtDate(d) {
  if (!d) return '';
  var p = parseEntryDateParts(d);
  if (!p) return typeof d === 'string' ? d : String(d);
  // Local calendar date — avoid UTC parse shift from new Date('YYYY-MM-DD')
  var dt = new Date(p.y, p.m - 1, p.day);
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()] + ' ' + p.day + ' ' + MONTH_NAMES[p.m - 1];
}

// Safe photo URL — only allow https URLs from trusted storage
function safeUrl(url) {
  if (!url) return null;
  return /^https:\/\//.test(url) ? url : null;
}

/** Signed URL lifetime for private bucket reads (seconds). */
var CULL_PHOTO_SIGN_EXPIRES = 86400;

/**
 * Storage object path within bucket cull-photos: "userId/file.jpg".
 * Accepts legacy full Supabase URLs (public or signed) or stored path.
 */
function cullPhotoStoragePath(photo_url) {
  if (!photo_url || typeof photo_url !== 'string') return null;
  var s = photo_url.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (/^[0-9a-f-]{36}\//i.test(s)) return s;
    return null;
  }
  var m = s.match(/cull-photos\/([^?]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

/** After loadEntries: fill _photoDisplayUrl for list/detail (private bucket). */
async function resolveCullPhotoDisplayUrls(entries) {
  if (!sb || !currentUser || !entries || !entries.length) return;
  await Promise.all(entries.map(async function(e) {
    delete e._photoDisplayUrl;
    if (!e.photo_url) return;
    var path = cullPhotoStoragePath(e.photo_url);
    if (!path) return;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var signed = await sb.storage.from('cull-photos').createSignedUrl(path, CULL_PHOTO_SIGN_EXPIRES);
        if (signed.data && signed.data.signedUrl && !signed.error) {
          e._photoDisplayUrl = signed.data.signedUrl;
          break;
        }
      } catch (err) { /* retry */ }
    }
  }));
}

function entryPhotoSrc(e) {
  if (!e) return null;
  if (e._photoDisplayUrl) return e._photoDisplayUrl;
  return safeUrl(e.photo_url);
}

/** Fade-in photos: skeleton hides when image loads or errors (Cull Diary list/detail/form). */
function diaryOnImgLoad(img) {
  img.classList.add('diary-img-loaded');
  var prev = img.previousElementSibling;
  if (prev && prev.classList && prev.classList.contains('diary-img-skeleton')) {
    prev.classList.add('diary-img-skeleton-hide');
  }
}
function diaryOnImgError(img) {
  img.classList.add('diary-img-loaded');
  var prev = img.previousElementSibling;
  if (prev && prev.classList && prev.classList.contains('diary-img-skeleton')) {
    prev.classList.add('diary-img-skeleton-hide');
  }
}

/** CSP: no inline onload/onerror on injected <img> — attach here. */
function bindDiaryImgHandlers(img) {
  if (!img) return;
  img.addEventListener('load', function() { diaryOnImgLoad(img); });
  img.addEventListener('error', function() { diaryOnImgError(img); });
  if (img.complete) {
    if (img.naturalWidth > 0) diaryOnImgLoad(img);
    else diaryOnImgError(img);
  }
}

function diaryWireDiaryImages(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('img.diary-img-fade').forEach(bindDiaryImgHandlers);
}

// ── Weight auto-calculator ──────────────────────────────────
// BDS ratios: clean ≈ gralloch × 0.82, larder ≈ gralloch × 0.75
var wtcManual = false; // true when user has manually edited clean
var wtlManual = false; // true when user has manually edited larder

function initWeightCalc() {
  var gEl = document.getElementById('f-wt-g');
  var cEl = document.getElementById('f-wt-c');
  var lEl = document.getElementById('f-wt-l');
  if (!gEl) return;

  // When gralloch changes → auto-fill clean and larder if not manually set
  gEl.addEventListener('input', function() {
    var g = parseFloat(this.value);
    if (isNaN(g) || g <= 0) {
      if (!wtcManual) { cEl.value = ''; showAutoBadge('c', false); }
      if (!wtlManual) { lEl.value = ''; showAutoBadge('l', false); }
      return;
    }
    if (!wtcManual) {
      cEl.value = (Math.round(g * 0.82 * 10) / 10).toFixed(1);
      showAutoBadge('c', true);
    }
    if (!wtlManual) {
      lEl.value = (Math.round(g * 0.75 * 10) / 10).toFixed(1);
      showAutoBadge('l', true);
    }
  });

  // When user manually edits clean → mark as manual, hide auto badge
  cEl.addEventListener('input', function() {
    if (document.activeElement === cEl) {
      wtcManual = true;
      showAutoBadge('c', false);
    }
  });

  // When user manually edits larder → mark as manual
  lEl.addEventListener('input', function() {
    if (document.activeElement === lEl) {
      wtlManual = true;
      showAutoBadge('l', false);
    }
  });
}

function showAutoBadge(field, show) {
  var badge = document.getElementById('wt-' + field + '-badge');
  if (badge) badge.style.display = show ? 'inline-flex' : 'none';
}

function resetWeightField(field) {
  // Reset a manually overridden field back to calculated value
  var g = parseFloat(document.getElementById('f-wt-g').value);
  if (isNaN(g) || g <= 0) return;
  if (field === 'c') {
    document.getElementById('f-wt-c').value = (Math.round(g * 0.82 * 10) / 10).toFixed(1);
    wtcManual = false;
    showAutoBadge('c', true);
  } else {
    document.getElementById('f-wt-l').value = (Math.round(g * 0.75 * 10) / 10).toFixed(1);
    wtlManual = false;
    showAutoBadge('l', true);
  }
}

function resetWeightAutoState() {
  // Call when opening a new or edit form to reset manual flags
  wtcManual = false;
  wtlManual = false;
  showAutoBadge('c', false);
  showAutoBadge('l', false);
}

// XSS sanitiser — escapes user data before innerHTML injection
function esc(s) {
  return (s === null || s === undefined) ? '' :
    String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
             .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
             .replace(/'/g,'&#x27;');
}

/** Empty list — onboarding + link to diary-guide.html (static SVG, no user data). */
function getEmptyListHtml() {
  var hasAny = allEntries.length > 0;
  var filtered = currentFilter !== 'all';
  var title;
  var sub;
  if (filtered && hasAny) {
    title = 'No entries for ' + esc(currentFilter);
    sub = 'Tap <strong>All</strong> to see every species, or <strong>+</strong> to log a cull.';
  } else {
    title = 'Start your cull diary';
    sub = 'Tap <strong>+</strong> for a full entry or <strong>Quick</strong> for a fast log. Your records sync when you\'re online.';
  }
  var svg = '<svg class="empty-illu-svg" viewBox="0 0 120 88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
    + '<defs><linearGradient id="empty-paper" x1="0%" y1="0%" x2="100%" y2="100%">'
    + '<stop offset="0%" stop-color="#faf8f4"/><stop offset="100%" stop-color="#ebe6dc"/></linearGradient></defs>'
    + '<rect x="22" y="10" width="76" height="68" rx="9" fill="url(#empty-paper)" stroke="#d4cfc4" stroke-width="1.2"/>'
    + '<rect x="22" y="10" width="16" height="68" rx="3" fill="#5a7a30" opacity="0.1"/>'
    + '<line x1="22" y1="26" x2="98" y2="26" stroke="#e0dbd2" stroke-width="1"/>'
    + '<line x1="46" y1="40" x2="88" y2="40" stroke="#c9a84c" stroke-width="1.4" stroke-linecap="round" opacity="0.45"/>'
    + '<line x1="46" y1="50" x2="80" y2="50" stroke="#c9a84c" stroke-width="1.4" stroke-linecap="round" opacity="0.35"/>'
    + '<line x1="46" y1="60" x2="92" y2="60" stroke="#c9a84c" stroke-width="1.4" stroke-linecap="round" opacity="0.28"/>'
    + '<circle cx="82" cy="20" r="6" fill="#c9a84c" opacity="0.2"/>'
    + '<path d="M86 52c4-6 10-6 14-2c2 2 3 5 2 8h-5c0-3-2-5-5-5s-5 2-6 5v3h-4v-4c0-4 2-8 4-5z" fill="#5a7a30" opacity="0.18"/>'
    + '</svg>';
  return '<div class="empty-state">'
    + '<div class="empty-illu">' + svg + '</div>'
    + '<div class="empty-title">' + title + '</div>'
    + '<div class="empty-sub">' + sub + '</div>'
    + '<a href="diary-guide.html" class="empty-guide-link">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7h8M8 11h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/></svg>'
    + 'How to use the Cull Diary</a>'
    + '</div>';
}

function renderList() {
  var entries = currentFilter === 'all' ? allEntries : allEntries.filter(function(e){ return e.species === currentFilter; });
  filteredEntries = entries;
  var container = document.getElementById('entries-container');

  // Stats
  var total = entries.length;
  var kg = entries.reduce(function(s,e){ return s + (parseFloat(e.weight_gralloch)||0); }, 0);
  var species_set = new Set(entries.map(function(e){ return e.species; }));
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-kg').textContent = Math.round(kg);
  document.getElementById('stat-spp').textContent = species_set.size;

  if (!total) {
    container.innerHTML = getEmptyListHtml();
    return;
  }

  // Group by month (invalid dates → single bucket at end)
  var LIST_INVALID_YM = '0000-00';
  var months = {};
  entries.forEach(function(e) {
    var p = parseEntryDateParts(e.date);
    var k = p ? p.y + '-' + ('0' + p.m).slice(-2) : LIST_INVALID_YM;
    if (!months[k]) months[k] = [];
    months[k].push(e);
  });

  var html = '';
  Object.keys(months).sort(function(a,b){ return b.localeCompare(a); }).forEach(function(ym) {
    if (ym === LIST_INVALID_YM) {
      html += '<div class="month-lbl">Other dates</div>';
    } else {
      var parts = ym.split('-');
      var mi = parseInt(parts[1], 10);
      html += '<div class="month-lbl">' + FULL_MONTHS[mi - 1] + ' ' + parts[0] + '</div>';
    }
    html += '<div class="grid">';
    var group = months[ym];
    var i = 0;
    while (i < group.length) {
      var e = group[i];
      var spClass = SPECIES_CLASS[e.species] || 'sp-red';
      var sxClass = sexBadgeClass(e.sex, e.species);
      var sxLbl = sexLabel(e.sex, e.species);
      var safePhoto = entryPhotoSrc(e);
      var hasPhoto = !!safePhoto;
      var imgHtml = hasPhoto
        ? '<div class="diary-img-skeleton" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(safePhoto) + '" alt="" loading="eager" decoding="async"><div class="gc-img-ov"></div>'
        : diaryNoPhotoListHtml(spClass, e.species);

      // Check if next entry also exists for potential wide layout (no-photo entries shown wide)
      var nextE = group[i+1];
      var showWide = !e.photo_url && (!nextE || !nextE.photo_url);
      if (showWide) {
        // Wide card
        html += '<div class="gc wide" tabindex="0" role="button" data-fl-action="open-detail" data-entry-id="' + e.id + '">'
          + '<div class="gc-img ' + spClass + '" style="position:relative;">' + imgHtml
          + '<div class="gc-img-top"><span class="gc-sex ' + sxClass + '">' + sxLbl + '</span></div>'
          + '<div class="gc-img-bot"><div class="gc-species">' + e.species + '</div><div class="gc-date">' + fmtDate(e.date) + '</div></div>'
          + '</div>'
          + '<div class="gc-body"><div class="gc-meta">' + esc(e.location_name) + (e.calibre ? ' · ' + esc(e.calibre) : '') + '</div>'
          + '<div class="gc-foot"><span class="gc-kg">' + (e.weight_gralloch ? e.weight_gralloch + ' kg' : '–') + '</span></div></div></div>';
        i++;
      } else {
        // Normal card
        html += '<div class="gc" tabindex="0" role="button" data-fl-action="open-detail" data-entry-id="' + e.id + '">'
          + '<div class="gc-img ' + spClass + '" style="position:relative;">' + imgHtml
          + '<div class="gc-img-top"><span class="gc-sex ' + sxClass + '">' + sxLbl + '</span>'
          + (hasPhoto ? '<div class="gc-photo-badge" aria-hidden="true">' + SVG_FL_CAMERA + '</div>' : '')
          + '</div>'
          + '<div class="gc-img-bot"><div class="gc-species">' + e.species + '</div><div class="gc-date">' + fmtDate(e.date) + '</div></div>'
          + '</div>'
          + '<div class="gc-body"><div class="gc-meta">' + esc(e.location_name) + (e.calibre ? ' · ' + esc(e.calibre) : '') + '</div>'
          + '<div class="gc-foot"><span class="gc-kg">' + (e.weight_gralloch ? e.weight_gralloch + ' kg' : '–') + '</span>'
          + '<span class="gc-cal">' + esc(e.calibre) + '</span></div></div></div>';
        i++;
      }
    }
    html += '</div>';
  });

  container.innerHTML = html;
  diaryWireDiaryImages(container);
}

function filterEntries(filter, el) {
  currentFilter = filter;
  document.querySelectorAll('.filter-bar .fc').forEach(function(b){ b.classList.remove('on'); });
  el.classList.add('on');
  renderList();
}

// ════════════════════════════════════
// DETAIL
// ════════════════════════════════════
async function openDetail(id) {
  var e = allEntries.find(function(x){ return x.id === id; });
  if (!e) return;
  if (e.weather_data === undefined && sb && currentUser) {
    try {
      var wr = await sb.from('cull_entries')
        .select('weather_data')
        .eq('id', id)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      e.weather_data = (wr.data && 'weather_data' in wr.data) ? wr.data.weather_data : null;
    } catch (err) {
      e.weather_data = null;
    }
  }
  if (e.photo_url && sb && currentUser) {
    var phPath = cullPhotoStoragePath(e.photo_url);
    if (phPath) {
      try {
        var sh = await sb.storage.from('cull-photos').createSignedUrl(phPath, CULL_PHOTO_SIGN_EXPIRES);
        if (sh.data && sh.data.signedUrl && !sh.error) e._photoDisplayUrl = sh.data.signedUrl;
      } catch (err) { /* use cached _photoDisplayUrl from list */ }
    }
  }
  currentEntry = e;
  var spClass = SPECIES_CLASS[e.species] || 'sp-red';
  var sxLbl = sexLabel(e.sex, e.species);

  var heroStyle = e.photo_url
    ? 'background:#0a0f07;'
    : 'background:linear-gradient(135deg,' + {'Red Deer':'#3a1a0a,#1a0a04','Roe Deer':'#0a2210,#050e04','Fallow':'#3a2208,#180e04','Sika':'#081830,#020810','Muntjac':'#1a0a2a,#0a0410','CWD':'#062018,#041010'}[e.species] + ');';

  var _safeHero = entryPhotoSrc(e);
  var heroImg = _safeHero
    ? '<div class="diary-img-skeleton diary-img-skeleton-hero" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(_safeHero) + '" alt="" loading="eager" decoding="async" fetchpriority="high">'
    : diaryHeroNoPhotoHtml();

  var syncTime = e.created_at ? new Date(e.created_at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';

  var dateDisp = fmtDate(e.date);
  var calibreRange = '–';
  if (e.calibre && e.distance_m) calibreRange = esc(e.calibre) + ' · ' + e.distance_m + 'm';
  else if (e.calibre) calibreRange = esc(e.calibre);
  else if (e.distance_m) calibreRange = '– · ' + e.distance_m + 'm';
  var placementDisp = e.shot_placement ? esc(e.shot_placement) : '–';
  var shooterDisp = e.shooter ? esc(e.shooter) : 'Self';
  var destDisp = e.destination ? esc(e.destination) : '–';
  function ddWt(v) {
    if (v == null || v === '') return '–';
    return esc(String(v)) + ' <span class="dd-u">kg</span>';
  }
  function ddDist(v) {
    if (v == null || v === '') return '–';
    return esc(String(v)) + ' <span class="dd-u">m</span>';
  }

  var photoCard = '<div class="dd-card"><div class="dd-card-lbl">Photo</div>'
    + (_safeHero
      ? '<div class="dd-photo-row"><div class="dd-photo-col"><div class="photo-thumb" tabindex="0" role="button" data-fl-action="open-photo-lb" data-photo-url="' + encodeURIComponent(_safeHero) + '" title="Tap to view full size"><div class="diary-img-skeleton diary-img-skeleton-thumb" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(_safeHero) + '" alt="" loading="eager" decoding="async"></div><div class="dd-photo-hint">Tap to expand</div></div><button type="button" class="photo-change-btn" data-fl-action="open-edit-entry" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_PENCIL + '</span>Edit entry</button></div>'
      : '<div class="dd-photo-row"><div class="dd-photo-col"><div class="photo-thumb photo-thumb--empty">' + diaryPhotoThumbEmptyHtml() + '</div></div><button type="button" class="photo-change-btn" data-fl-action="open-edit-entry" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_PENCIL + '</span>Edit entry</button></div>')
    + '</div>';

  var whenCard = '<div class="dd-card"><div class="dd-card-lbl">When &amp; where</div>'
    + '<div class="dd-kv"><span class="dd-k">Date</span><span class="dd-v">' + esc(dateDisp || '–') + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Time</span><span class="dd-v">' + esc(e.time || '–') + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Location</span><span class="dd-v">' + (e.location_name ? esc(e.location_name) : '–') + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Ground</span><span class="dd-v">' + (e.ground ? esc(e.ground) : '–') + '</span></div>'
    + '</div>';

  var weightsCard = '<div class="dd-card"><div class="dd-card-lbl">Weights &amp; distance</div><div class="dd-grid2">'
    + '<div class="dd-tile"><div class="dd-tile-k">Gralloch</div><div class="dd-tile-v">' + ddWt(e.weight_gralloch) + '</div></div>'
    + '<div class="dd-tile"><div class="dd-tile-k">Clean</div><div class="dd-tile-v">' + ddWt(e.weight_clean) + '</div></div>'
    + '<div class="dd-tile"><div class="dd-tile-k">Larder</div><div class="dd-tile-v">' + ddWt(e.weight_larder) + '</div></div>'
    + '<div class="dd-tile"><div class="dd-tile-k">Distance</div><div class="dd-tile-v">' + ddDist(e.distance_m) + '</div></div>'
    + '</div></div>';

  var shotCard = '<div class="dd-card"><div class="dd-card-lbl">Shot &amp; stalking</div>'
    + '<div class="dd-kv"><span class="dd-k">Calibre / range</span><span class="dd-v">' + calibreRange + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Placement</span><span class="dd-v">' + placementDisp + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Shooter</span><span class="dd-v">' + shooterDisp + '</span></div>'
    + '<div class="dd-kv"><span class="dd-k">Destination</span><span class="dd-v">' + destDisp + '</span></div>'
    + '</div>';

  var notesCard = e.notes
    ? '<div class="dd-card"><div class="dd-card-lbl">Notes</div><p class="dd-notes">' + esc(e.notes) + '</p></div>'
    : '';

  var wxRaw = renderWeatherStrip(e);
  var wxCard = wxRaw ? '<div class="dd-card dd-card--wx">' + wxRaw + '</div>' : '';

  var html = '<div class="detail-hero detail-hero--dense ' + spClass + '" style="' + heroStyle + '">'
    + heroImg
    + '<div class="detail-hero-ov"></div>'
    + '<button type="button" class="detail-hero-back" data-fl-action="go" data-view="v-list">←</button>'
    + '<div class="detail-hero-bot">'
    + '<div class="detail-species">' + e.species + ' ' + sxLbl + '</div>'
    + '<div class="detail-chips">'
    + '<span class="dchip ' + (e.sex === 'm' ? 'dc-m' : 'dc-f') + '">' + (e.sex === 'm' ? '♂' : '♀') + ' ' + esc(sxLbl) + (e.age_class ? ' · ' + esc(e.age_class) : '') + '</span>'
    + (e.location_name ? '<span class="dchip dc-l"><span class="dchip-ic" aria-hidden="true">' + SVG_FL_PIN + '</span>' + esc(e.location_name) + '</span>' : '')
    + (e.weight_gralloch ? '<span class="dchip dc-w">' + e.weight_gralloch + ' kg gralloch</span>' : '')
    + '</div>'
    + '<div class="sync-row"><div class="sync-dot"></div><span class="sync-txt">Synced' + (syncTime ? ' · ' + syncTime : '') + '</span></div>'
    + '</div></div>'

    + '<div class="detail-dash">'
    + photoCard
    + whenCard
    + weightsCard
    + shotCard
    + notesCard
    + wxCard
    + '<div class="action-row action-row--dash">'
    + '<button type="button" class="abtn a-e" data-fl-action="open-edit-entry" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_PENCIL + '</span>Edit</button>'
    + '<button type="button" class="abtn a-x" data-fl-action="export-single-pdf" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_FILE_PDF + '</span>PDF</button>'
    + '<button type="button" class="abtn a-d" data-fl-action="delete-entry" data-entry-id="' + e.id + '"><span class="di-btn-ic" aria-hidden="true">' + SVG_FL_TRASH + '</span>Delete</button>'
    + '</div></div>';

  var detailEl = document.getElementById('detail-content');
  detailEl.innerHTML = html;
  diaryWireDiaryImages(detailEl);
  go('v-detail');
}

// ════════════════════════════════════
// FORM
// ════════════════════════════════════
function openNewEntry() {
  formDirty = false;
  editingId = null;
  photoFile = null;
  revokeBlobPreviewUrl(photoPreviewUrl);
  photoPreviewUrl = null;
  formSpecies = '';
  formSex = '';
  resetPhotoSlot();
  document.querySelectorAll('.sp-btn').forEach(function(b){ b.classList.remove('on'); });
  document.getElementById('sx-m').classList.remove('on');
  document.getElementById('sx-f').classList.remove('on');
  var now = new Date();
  // Use UK time for date/time pre-fill — toISOString() returns UTC which can be wrong date/time
  var _ukParts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false
  }).formatToParts(now);
  var _get = function(t){ return _ukParts.find(function(p){ return p.type===t; }).value; };
  document.getElementById('f-date').value = _get('year') + '-' + _get('month') + '-' + _get('day');
  document.getElementById('f-time').value = _get('hour') + ':' + _get('minute');
  ['f-location','f-dist','f-notes'].forEach(function(id){ document.getElementById(id).value = ''; }); setCalibreValue('');
  var shooterEl = document.getElementById('f-shooter');
  if (shooterEl) { shooterEl.value = 'Self'; shooterEl.classList.add('shooter-self'); }
  var destEl = document.getElementById('f-destination');
  if (destEl) destEl.value = '';
  var groundEl = document.getElementById('f-ground');
  if (groundEl) { groundEl.value = ''; }
  var groundCustom = document.getElementById('f-ground-custom');
  if (groundCustom) { groundCustom.value = ''; groundCustom.style.display = 'none'; }
  populateGroundDropdown();
  document.getElementById('f-wt-g').value = '';
  document.getElementById('f-wt-c').value = '';
  document.getElementById('f-wt-l').value = '';
  resetWeightAutoState();
  clearPinnedLocation();
  setPlacementValue('');
  document.getElementById('f-age').value = '';
  document.getElementById('form-title').textContent = 'New Entry';
  var _days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var _ukDate = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/London', weekday:'short', day:'numeric', month:'long', year:'numeric'
  }).formatToParts(now);
  var _gp = function(t){ var p=_ukDate.find(function(x){return x.type===t;}); return p?p.value:''; };
  document.getElementById('form-date-label').textContent = _gp('weekday') + ' ' + _gp('day') + ' ' + _gp('month') + ' ' + _gp('year');
  go('v-form');
}

async function openEditEntry(id) {
  formDirty = false;
  var e = allEntries.find(function(x){ return x.id === id; });
  if (!e) return;
  editingId = id;
  formSpecies = e.species;
  formSex = e.sex;
  photoFile = null;
  revokeBlobPreviewUrl(photoPreviewUrl);
  photoPreviewUrl = null;
  var path = e.photo_url ? cullPhotoStoragePath(e.photo_url) : null;
  if (path && sb) {
    try {
      var signed = await sb.storage.from('cull-photos').createSignedUrl(path, CULL_PHOTO_SIGN_EXPIRES);
      if (signed.data && signed.data.signedUrl && !signed.error) photoPreviewUrl = signed.data.signedUrl;
    } catch (err) { /* fall through */ }
  }
  if (!photoPreviewUrl) photoPreviewUrl = safeUrl(e.photo_url) || null;
  // Set photo slot
  if (photoPreviewUrl) {
    var slot = document.getElementById('photo-slot');
    slot.className = 'photo-slot filled';
    slot.innerHTML = '<div class="diary-img-skeleton diary-img-skeleton-slot" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(photoPreviewUrl) + '" alt=""><button type="button" class="photo-slot-rm" data-fl-action="remove-photo">✕</button>';
    diaryWireDiaryImages(slot);
    document.getElementById('photo-rm-btn').style.display = 'block';
  } else {
    resetPhotoSlot();
  }
  // Species
  document.querySelectorAll('.sp-btn').forEach(function(b){ b.classList.toggle('on', b.querySelector('.sp-name').textContent === e.species); });
  // Sex
  document.getElementById('sx-m').classList.toggle('on', e.sex === 'm');
  document.getElementById('sx-f').classList.toggle('on', e.sex === 'f');
  document.getElementById('f-date').value = e.date || '';
  document.getElementById('f-time').value = e.time || '';
  document.getElementById('f-location').value = e.location_name || '';
  if (e.lat && e.lng) {
    formPinLat = e.lat; formPinLng = e.lng;
    showPinnedStrip(e.location_name || (e.lat.toFixed(4) + ', ' + e.lng.toFixed(4)), e.lat, e.lng);
  } else {
    clearPinnedLocation();
  }
  document.getElementById('f-wt-g').value = e.weight_gralloch || '';
  document.getElementById('f-wt-c').value = e.weight_clean || '';
  document.getElementById('f-wt-l').value = e.weight_larder || '';
  // On edit, treat existing clean/larder as manually entered (don't auto-overwrite)
  resetWeightAutoState();
  if (e.weight_gralloch && e.weight_clean)  { wtcManual = true; }
  if (e.weight_gralloch && e.weight_larder) { wtlManual = true; }
  setCalibreValue(e.calibre || '');
  document.getElementById('f-dist').value = e.distance_m || '';
  setPlacementValue(e.shot_placement || '');
  document.getElementById('f-age').value = e.age_class || '';
  document.getElementById('f-notes').value = e.notes || '';
  var sEl = document.getElementById('f-shooter');
  if (sEl) {
    sEl.value = e.shooter || 'Self';
    sEl.classList.toggle('shooter-self', !e.shooter || e.shooter === 'Self');
  }
  var destEl = document.getElementById('f-destination');
  if (destEl) destEl.value = e.destination || '';
  populateGroundDropdown();
  setGroundValue(e.ground || '');
  document.getElementById('form-title').textContent = 'Edit Entry';
  document.getElementById('form-date-label').textContent = fmtDate(e.date);
  go('v-form');
}

function pickSpecies(el, name) {
  document.querySelectorAll('.sp-btn').forEach(function(b){ b.classList.remove('on'); });
  el.classList.add('on');
  formSpecies = name;
  formDirty = true;
}
function pickSex(s) {
  formSex = s;
  document.getElementById('sx-m').classList.toggle('on', s === 'm');
  document.getElementById('sx-f').classList.toggle('on', s === 'f');
  formDirty = true;
}

function handlePhoto(input) {
  var file = input.files[0];
  if (!file) return;
  input.value = '';
  revokeBlobPreviewUrl(photoPreviewUrl);
  photoPreviewUrl = null;

  // Compress image via canvas before storing
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      // Target max 800px on longest side, JPEG quality 0.75
      var MAX = 800;
      var w = img.width;
      var h = img.height;
      if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
      else        { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }

      var canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(function(blob) {
        photoFile = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        photoPreviewUrl = URL.createObjectURL(blob);

        var slot = document.getElementById('photo-slot');
        slot.className = 'photo-slot filled';
        slot.innerHTML = '<div class="diary-img-skeleton diary-img-skeleton-slot" aria-hidden="true"></div><img class="diary-img diary-img-fade" src="' + esc(photoPreviewUrl) + '" alt=""><button type="button" class="photo-slot-rm" data-fl-action="remove-photo">✕</button>';
        diaryWireDiaryImages(slot);
        document.getElementById('photo-rm-btn').style.display = 'block';

        var kb = Math.round(photoFile.size / 1024);
        showToast('📷 Photo ready · ' + kb + ' KB');
      }, 'image/jpeg', 0.75);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  photoFile = null;
  revokeBlobPreviewUrl(photoPreviewUrl);
  photoPreviewUrl = null;
  resetPhotoSlot();
}

/** New Entry empty photo — landscape frame + sun + hills (matches form HTML). */
var PHOTO_SLOT_EMPTY_HTML =
  '<div class="photo-slot-icon" aria-hidden="true">' +
  '<svg class="photo-slot-empty-svg" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<rect x="7" y="11" width="34" height="26" rx="5" stroke="currentColor" stroke-width="1.5" opacity="0.9"/>' +
  '<circle cx="17" cy="20" r="3.5" fill="#c8a84b" opacity="0.42"/>' +
  '<path d="M9 36l9-12 7 7 9-13 6 18H9z" fill="#5a7a30" fill-opacity="0.2"/>' +
  '<path d="M9 36l9-12 7 7 9-13 6 18" fill="none" stroke="#5a7a30" stroke-opacity="0.5" stroke-width="1.15" stroke-linejoin="round"/>' +
  '</svg></div><div class="photo-slot-lbl">No photo</div>';

function resetPhotoSlot() {
  var slot = document.getElementById('photo-slot');
  slot.className = 'photo-slot empty';
  slot.innerHTML = PHOTO_SLOT_EMPTY_HTML;
  document.getElementById('photo-rm-btn').style.display = 'none';
}

var lastGpsLat = null, lastGpsLng = null;


function handleCalibreSelect(sel) {
  var custom = document.getElementById('f-calibre');
  if (sel.value === '__custom__') {
    custom.style.display = 'block';
    custom.value = '';
    custom.focus();
    sel.classList.add('has-val');
  } else {
    custom.style.display = 'none';
    custom.value = sel.value;
    sel.classList.toggle('has-val', sel.value !== '');
  }
}

function getCalibreValue() {
  var sel = document.getElementById('f-calibre-sel');
  var custom = document.getElementById('f-calibre');
  if (sel && sel.value === '__custom__') return custom.value.trim();
  if (sel && sel.value && sel.value !== '') return sel.value;
  return custom ? custom.value.trim() : '';
}

function setCalibreValue(val) {
  var sel = document.getElementById('f-calibre-sel');
  var custom = document.getElementById('f-calibre');
  if (!val) { 
    if (sel) sel.value = ''; 
    if (custom) { custom.value = ''; custom.style.display = 'none'; }
    return; 
  }
  // Check if val matches a dropdown option
  var matched = false;
  if (sel) {
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === val) { sel.value = val; matched = true; break; }
    }
  }
  if (!matched) {
    // Use custom
    if (sel) sel.value = '__custom__';
    if (custom) { custom.value = val; custom.style.display = 'block'; }
  } else {
    if (custom) { custom.value = val; custom.style.display = 'none'; }
  }
}

function handlePlacementSelect(sel) {
  var custom = document.getElementById('f-placement-custom');
  if (sel.value === '__other__') {
    custom.style.display = 'block';
    sel.classList.add('has-val');
    custom.focus();
  } else {
    custom.style.display = 'none';
    custom.value = '';
    sel.classList.toggle('has-val', !!sel.value);
  }
}

function getPlacementValue() {
  var sel = document.getElementById('f-placement');
  if (sel.value === '__other__') {
    return document.getElementById('f-placement-custom').value.trim() || '';
  }
  return sel.value;
}

function setPlacementValue(val) {
  var sel = document.getElementById('f-placement');
  var custom = document.getElementById('f-placement-custom');
  // Check if val matches a known option
  var known = ['Heart / Lung','High Shoulder','Neck','Head','Spine','Shoulder','Abdomen','Haunch'];
  if (!val) {
    sel.value = '';
    sel.classList.remove('has-val');
    custom.style.display = 'none';
    custom.value = '';
  } else if (known.indexOf(val) !== -1) {
    sel.value = val;
    sel.classList.add('has-val');
    custom.style.display = 'none';
    custom.value = '';
  } else {
    sel.value = '__other__';
    sel.classList.add('has-val');
    custom.style.display = 'block';
    custom.value = val;
  }
} // stored for weather fetch

/** Nominatim (OpenStreetMap) — abort after `ms` to avoid hung UI on slow networks. Default 5s. */
function nominatimFetch(url, ms) {
  var limit = ms === undefined ? 5000 : ms;
  var ctrl = new AbortController();
  var tid = setTimeout(function() { ctrl.abort(); }, limit);
  return fetch(url, { signal: ctrl.signal }).finally(function() { clearTimeout(tid); });
}

function getGPS() {
  if (!navigator.geolocation) { showToast('GPS not available'); return; }
  showToast('📍 Getting location…');
  navigator.geolocation.getCurrentPosition(function(pos) {
    var lat = pos.coords.latitude.toFixed(4);
    var lng = pos.coords.longitude.toFixed(4);
    lastGpsLat = parseFloat(lat); lastGpsLng = parseFloat(lng);
    formPinLat = parseFloat(lat); formPinLng = parseFloat(lng);
    nominatimFetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json')
      .then(function(r){ return r.json(); })
      .then(function(d) {
        var name = diaryReverseGeocodeLabel(d, lat, lng);
        document.getElementById('f-location').value = name;
        showPinnedStrip(name, parseFloat(lat), parseFloat(lng));
        showToast('📍 ' + name);
      }).catch(function() {
        document.getElementById('f-location').value = lat + ', ' + lng;
        showPinnedStrip(lat + ', ' + lng, parseFloat(lat), parseFloat(lng));
      });
  }, function() { showToast('Could not get location'); });
}

async function saveEntry() {
  if (!formSpecies) { showToast('⚠️ Please select a species'); return; }
  if (!formSex)     { showToast('⚠️ Please select sex'); return; }
  if (!sb)          { showToast('⚠️ Supabase not configured'); return; }
  var btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.innerHTML = diaryCloudSaveInner('Saving…');

  // ── Offline check — queue locally if no connection ──
  if (!navigator.onLine && !editingId) {
    var offlinePayload = {
      species:         formSpecies,
      sex:             formSex,
      date:            document.getElementById('f-date').value,
      time:            document.getElementById('f-time').value,
      location_name:   document.getElementById('f-location').value,
      lat:             formPinLat || lastGpsLat || null,
      lng:             formPinLng || lastGpsLng || null,
      weight_gralloch: Math.max(0, parseFloat(document.getElementById('f-wt-g').value)) || null,
      weight_clean:    Math.max(0, parseFloat(document.getElementById('f-wt-c').value)) || null,
      weight_larder:   Math.max(0, parseFloat(document.getElementById('f-wt-l').value)) || null,
      calibre:         getCalibreValue(),
      distance_m:      Math.max(0, parseInt(document.getElementById('f-dist').value)) || null,
      shot_placement:  getPlacementValue(),
      age_class:       document.getElementById('f-age').value,
      notes:           document.getElementById('f-notes').value,
      shooter:         document.getElementById('f-shooter').value.trim() || 'Self',
      ground:          getGroundValue(),
      destination:     document.getElementById('f-destination').value || null,
      _photoDataUrl:   null,
      _existingPhotoUrl: (function() {
        if (!photoPreviewUrl || photoPreviewUrl.indexOf('blob:') === 0) return null;
        var p = cullPhotoStoragePath(photoPreviewUrl);
        if (p) return p;
        return photoPreviewUrl.indexOf('http') === 0 ? photoPreviewUrl : null;
      })(),
    };
    if (photoFile) {
      try {
        offlinePayload._photoDataUrl = await fileToDataUrl(photoFile);
      } catch (fe) {
        showToast('⚠️ Could not read photo for offline save');
        btn.disabled = false;
        btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
        return;
      }
    }
    await queueOfflineEntry(offlinePayload);
    formDirty = false;
    btn.disabled = false;
    btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
    return;
  }

  try {
    var payload = {
      user_id:         currentUser.id,
      species:         formSpecies,
      sex:             formSex,
      date:            document.getElementById('f-date').value,
      time:            document.getElementById('f-time').value,
      location_name:   document.getElementById('f-location').value,
      lat:             formPinLat || lastGpsLat || null,
      lng:             formPinLng || lastGpsLng || null,
      weight_gralloch: Math.max(0, parseFloat(document.getElementById('f-wt-g').value)) || null,
      weight_clean:    Math.max(0, parseFloat(document.getElementById('f-wt-c').value)) || null,
      weight_larder:   Math.max(0, parseFloat(document.getElementById('f-wt-l').value)) || null,
      calibre:         getCalibreValue(),
      distance_m:      Math.max(0, parseInt(document.getElementById('f-dist').value)) || null,
      shot_placement:  getPlacementValue(),
      age_class:       document.getElementById('f-age').value,
      notes:           document.getElementById('f-notes').value,
      shooter:         document.getElementById('f-shooter').value.trim() || 'Self',
      ground:          getGroundValue(),
      destination:     document.getElementById('f-destination').value || null,
    };
    if (photoFile) {
      try {
        var path = currentUser.id + '/' + Date.now() + '.jpg';
        var upload = await sb.storage.from('cull-photos').upload(path, photoFile, {
          upsert: true,
          contentType: 'image/jpeg'
        });
        if (upload.error) {
          console.error('Photo upload error:', upload.error);
          showToast('⚠️ Photo upload failed: ' + (upload.error.message || 'Check storage policies'));
        } else {
          payload.photo_url = path;
          showToast('📷 Photo uploaded');
        }
      } catch(uploadErr) {
        showToast('⚠️ Photo upload error — entry saved without photo');
        console.error('Upload exception:', uploadErr);
      }
    } else if (photoPreviewUrl) {
      var keepPath = cullPhotoStoragePath(photoPreviewUrl);
      if (keepPath) payload.photo_url = keepPath;
    } else if (!photoPreviewUrl) {
      payload.photo_url = null; // removed
    }

    var result;
    if (editingId) {
      result = await sb.from('cull_entries').update(payload).eq('id', editingId);
    } else {
      result = await sb.from('cull_entries').insert(payload).select('id');
    }
    if (result.error) throw result.error;

    showToast(editingId ? '✅ Entry updated' : '✅ Entry saved');
    flHapticSuccess();
    formDirty = false;
    // Save new ground name if not already in list
    var gVal = getGroundValue();
    if (gVal) saveGround(gVal);
    await loadEntries();
    go('v-list');

    // Silently fetch and attach weather in background (last 7 days only)
    var savedId = editingId || (result.data && result.data[0] && result.data[0].id);
    if (!savedId && !editingId) {
      var fresh = await sb.from('cull_entries')
        .select('id').eq('user_id', currentUser.id)
        .order('created_at', { ascending: false }).limit(1);
      if (fresh.data && fresh.data[0]) savedId = fresh.data[0].id;
    }
    if (savedId && payload.date) {
      // Use GPS coords if available, else try parsing from location field
      var wxLat = lastGpsLat || (qsLat ? parseFloat(qsLat) : null);
      var wxLng = lastGpsLng || (qsLng ? parseFloat(qsLng) : null);
      if (!wxLat && payload.location_name) {
        var coordMatch = payload.location_name.match(/^(-?[\d.]+),\s*(-?[\d.]+)$/);
        if (coordMatch) { wxLat = parseFloat(coordMatch[1]); wxLng = parseFloat(coordMatch[2]); }
      }
      // Use bannerState lat/lng as last resort (index.html shares none — skip)
      if (wxLat && wxLng) {
        attachWeatherToEntry(savedId, payload.date, payload.time, wxLat, wxLng);
      }
    }
  } catch(e) {
    showToast('⚠️ Save failed: ' + (e.message || 'Unknown error'));
  }
  btn.disabled = false;
  btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  var entry = allEntries.find(function(e){ return e.id === id; });

  // Delete photo from storage first if it exists
  if (entry && entry.photo_url && sb) {
    try {
      var sp = cullPhotoStoragePath(entry.photo_url);
      if (sp) await sb.storage.from('cull-photos').remove([sp]);
    } catch(e) { /* non-fatal */ }
  }

  var r = await sb.from('cull_entries').delete().eq('id', id);
  if (!r.error) {
    showToast('🗑 Entry deleted');
    await loadEntries();
    go('v-list');
  } else { showToast('⚠️ Could not delete'); }
}

// ════════════════════════════════════
// STATS
// ════════════════════════════════════
/** Shared empty state for chart areas (keeps copy consistent). */
function statsChartEmpty(message) {
  return '<div class="stats-empty">' + esc(message || 'No data for this season') + '</div>';
}

function initStatsMoreSection() {
  var wrap = document.getElementById('stats-more-wrap');
  var btn = document.getElementById('stats-more-toggle');
  var body = document.getElementById('stats-more-body');
  if (!wrap || !btn || !body) return;
  function apply(opened) {
    wrap.classList.toggle('open', opened);
    btn.setAttribute('aria-expanded', opened ? 'true' : 'false');
    btn.setAttribute('aria-label', opened ? 'Hide charts and breakdowns' : 'Show charts and breakdowns');
    body.hidden = !opened;
    var cta = document.getElementById('stats-more-cta');
    if (cta) cta.textContent = opened ? 'Tap to hide' : 'Tap to show';
    try {
      localStorage.setItem('fl-stats-more', opened ? '1' : '0');
    } catch (e) { /* private mode */ }
  }
  var stored = null;
  try {
    stored = localStorage.getItem('fl-stats-more');
  } catch (e) { /* ignore */ }
  apply(stored === '1');
  btn.addEventListener('click', function() {
    apply(!wrap.classList.contains('open'));
  });
}

function buildStats(speciesFilter) {
  // Sync stats season pill with list season dropdown
  var statsSel = document.getElementById('season-select-stats');
  var listSel  = document.getElementById('season-select');
  if (statsSel && listSel) {
    statsSel.innerHTML = listSel.innerHTML;
    statsSel.value = currentSeason;
  }
  // Load targets for current season then render plan card
  Promise.all([loadTargets(currentSeason), loadGroundTargets(currentSeason)]).then(function() {
    loadPrevTargets(currentSeason);
    renderPlanGroundFilter();
    renderPlanCard(allEntries, currentSeason);
    return renderSyndicateSection();
  }).then(function() {
    void updateSyndicateExportVisibility();
  });
  // Update season label to match currently selected season
  var d = seasonDates(currentSeason);
  var parts = currentSeason.split('-');
  var y1 = parts[0];
  var y2 = parts[1].length === 2 ? '20' + parts[1] : parts[1];
  var startDate = new Date(d.start);
  var endDate = new Date(d.end);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var seasonDateStr = months[startDate.getMonth()] + ' ' + startDate.getFullYear()
    + ' – ' + months[endDate.getMonth()] + ' ' + endDate.getFullYear();
  document.getElementById('stats-season-lbl').textContent = y1 + '–' + y2 + ' · ' + seasonDateStr;

  var entries = speciesFilter ? allEntries.filter(function(e){ return e.species === speciesFilter; }) : allEntries;
  var total = entries.length;
  var kg = entries.reduce(function(s,e){ return s + (parseFloat(e.weight_gralloch)||0); }, 0);
  var avg = total ? Math.round(kg/total) : 0;
  var maxE = entries.reduce(function(m,e){ return (parseFloat(e.weight_gralloch)||0) > (parseFloat(m.weight_gralloch)||0) ? e : m; }, {});
  document.getElementById('st-total').textContent = total;
  document.getElementById('st-kg').textContent = Math.round(kg);
  document.getElementById('st-avg').textContent = avg || '–';
  document.getElementById('st-max').textContent = maxE.weight_gralloch || '–';
  document.getElementById('st-max-lbl').textContent = maxE.weight_gralloch ? 'kg · ' + maxE.species + ' ' + (maxE.date||'').slice(0,7) : 'kg';

  // Species chart with sex breakdown
  var spCount = {}, spMale = {}, spFemale = {};
  entries.forEach(function(e){
    spCount[e.species]  = (spCount[e.species]||0)+1;
    if (e.sex==='m') spMale[e.species]   = (spMale[e.species]||0)+1;
    else             spFemale[e.species] = (spFemale[e.species]||0)+1;
  });
  var spMax = Math.max.apply(null, Object.values(spCount).concat([1]));
  var spColors = {'Red Deer':'#c8a84b','Roe Deer':'#5a7a30','Fallow':'#f57f17','Sika':'#1565c0','Muntjac':'#6a1b9a','CWD':'#00695c'};
  var spMaleLabels = {'Red Deer':'Stag','Roe Deer':'Buck','Fallow':'Buck','Sika':'Stag','Muntjac':'Buck','CWD':'Buck'};
  var spFemLabels  = {'Red Deer':'Hind','Roe Deer':'Doe','Fallow':'Doe','Sika':'Hind','Muntjac':'Doe','CWD':'Doe'};
  var spHtml = Object.keys(spCount).sort(function(a,b){ return spCount[b]-spCount[a]; }).map(function(sp) {
    var clr = spColors[sp]||'#5a7a30';
    var mCnt = spMale[sp]||0, fCnt = spFemale[sp]||0;
    var mLbl = spMaleLabels[sp]||'Male', fLbl = spFemLabels[sp]||'Female';
    var html = '<div class="bar-row" style="margin-bottom:4px;">'
      + '<div class="bar-lbl" style="font-size:12px;font-weight:700;">' + sp + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:' + (spCount[sp]/spMax*100) + '%;background:' + clr + ';"></div></div>'
      + '<div class="bar-cnt">' + spCount[sp] + '</div></div>';
    // Sex sub-rows
    if (mCnt > 0) html += '<div class="bar-row" style="padding-left:12px;margin-bottom:3px;">'
      + '<div class="bar-lbl" style="font-size:10px;color:var(--muted);">♂ ' + mLbl + '</div>'
      + '<div class="bar-track" style="height:4px;"><div class="bar-fill" style="width:' + (mCnt/spCount[sp]*100) + '%;background:rgba(191,54,12,0.55);"></div></div>'
      + '<div class="bar-cnt" style="font-size:10px;color:var(--muted);">' + mCnt + '</div></div>';
    if (fCnt > 0) html += '<div class="bar-row" style="padding-left:12px;margin-bottom:8px;">'
      + '<div class="bar-lbl" style="font-size:10px;color:var(--muted);">♀ ' + fLbl + '</div>'
      + '<div class="bar-track" style="height:4px;"><div class="bar-fill" style="width:' + (fCnt/spCount[sp]*100) + '%;background:rgba(136,14,79,0.55);"></div></div>'
      + '<div class="bar-cnt" style="font-size:10px;color:var(--muted);">' + fCnt + '</div></div>';
    return html;
  }).join('');
  document.getElementById('species-chart').innerHTML = spHtml || statsChartEmpty('No culls this season');

  // Sex chart
  var mCount = entries.filter(function(e){ return e.sex === 'm'; }).length;
  var fCount = entries.filter(function(e){ return e.sex === 'f'; }).length;
  var sexMax = Math.max(mCount, fCount, 1);
  document.getElementById('sex-chart').innerHTML =
    '<div class="bar-row"><div class="bar-lbl">♂ Male</div><div class="bar-track"><div class="bar-fill" style="width:' + (mCount/sexMax*100) + '%;background:rgba(191,54,12,0.75);"></div></div><div class="bar-cnt">' + mCount + '</div></div>' +
    '<div class="bar-row"><div class="bar-lbl">♀ Female</div><div class="bar-track"><div class="bar-fill" style="width:' + (fCount/sexMax*100) + '%;background:rgba(136,14,79,0.75);"></div></div><div class="bar-cnt">' + fCount + '</div></div>';

  // Calibre, distance, age & ground stats
  buildCalibreDistanceStats(entries);
  buildAgeStats(entries);
  buildShooterStats(entries);
  buildDestinationStats(entries);
  buildGroundStats(entries);

  // Cull map (after DOM paint)
  setTimeout(function() {
    initCullMap();
    renderCullMapPins();
    var sub = document.getElementById('cullmap-sub');
    if (sub) sub.textContent = 'Location history · ' + currentSeason;
  }, 150);

  // Monthly chart
  var mCount2 = {};
  entries.forEach(function(e) {
    if (!e.date) return;
    var dp = String(e.date).trim().split('-');
    var m = parseInt(dp[1], 10);
    if (!Number.isFinite(m) || m < 1 || m > 12) return;
    mCount2[m] = (mCount2[m] || 0) + 1;
  });
  var mMax = Math.max.apply(null, Object.values(mCount2).concat([1]));
  var seasonMonths = [8,9,10,11,12,1,2,3,4,5,6,7];
  var mHtml = seasonMonths.map(function(m) {
    var cnt = mCount2[m]||0;
    var h = cnt ? Math.max(6, Math.round(cnt/mMax*60)) : 3;
    var cls = cnt ? (cnt === Math.max.apply(null, Object.values(mCount2)) ? 'mc-bar pk' : 'mc-bar on') : 'mc-bar';
    return '<div class="mc-col"><div class="' + cls + '" style="height:' + h + 'px;' + (cnt ? '' : 'opacity:0.4;') + '"></div><div class="mc-lbl">' + MONTH_NAMES[m-1] + '</div></div>';
  }).join('');
  document.getElementById('month-chart').innerHTML = mHtml;

  statsNeedsFullRebuild = false;
}

// ════════════════════════════════════
// EXPORT
// ════════════════════════════════════
// ════════════════════════════════════
// DELETE ACCOUNT
// ════════════════════════════════════
function confirmDeleteAccount() {
  document.getElementById('delete-confirm-input').value = '';
  document.getElementById('delete-confirm-btn').disabled = true;
  document.getElementById('delete-account-modal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('delete-account-modal').style.display = 'none';
}

function checkDeleteInput() {
  var val = document.getElementById('delete-confirm-input').value;
  var btn = document.getElementById('delete-confirm-btn');
  var ready = val === 'DELETE';
  btn.disabled = !ready;
}

async function deleteAccount() {
  if (!sb || !currentUser) return;
  var btn = document.getElementById('delete-confirm-btn');
  btn.textContent = 'Deleting…';
  btn.disabled = true;

  try {
    // 1. Delete all photos from storage
    showToast('🗑 Deleting photos…');
    var photos = await sb.from('cull_entries')
      .select('photo_url')
      .eq('user_id', currentUser.id)
      .not('photo_url', 'is', null);

    if (photos.data && photos.data.length > 0) {
      var paths = photos.data
        .filter(function(e) { return e.photo_url; })
        .map(function(e) { return cullPhotoStoragePath(e.photo_url); })
        .filter(Boolean);
      if (paths.length > 0) {
        await sb.storage.from('cull-photos').remove(paths);
      }
    }

    // 2. Anonymised syndicate tallies (species / sex / date only) — must run before cull_entries delete
    showToast('🗑 Saving syndicate totals…');
    var retainRes = await sb.rpc('retain_syndicate_anonymous_culls');
    if (retainRes.error && typeof console !== 'undefined' && console.warn) {
      console.warn('retain_syndicate_anonymous_culls:', retainRes.error.message || retainRes.error);
    }

    // 3. Delete all entries
    showToast('🗑 Deleting records…');
    await sb.from('cull_entries').delete().eq('user_id', currentUser.id);

    // 4. Delete the auth account via custom RPC
    // Requires 'delete_user' function in Supabase (calls auth.users delete internally)
    showToast('🗑 Deleting account…');
    var rpcResult = await sb.rpc('delete_user');
    if (rpcResult.error) {
      // RPC may not exist — sign out and inform user to contact support
      await sb.auth.signOut();
      destroyCullMapLeaflet();
      showToast('⚠️ Entries deleted. Contact support to remove auth account.');
      setTimeout(function() { go('v-auth'); }, 3000);
      return;
    }

    // 5. Sign out and redirect
    await sb.auth.signOut();
    destroyCullMapLeaflet();
    closeDeleteModal();
    showToast('✅ Account deleted. Goodbye.');
    setTimeout(function() { go('v-auth'); }, 2000);

  } catch(e) {
    // Fallback — sign out even if delete fails
    showToast('⚠️ ' + (e.message || 'Could not fully delete. Contact support.'));
    btn.textContent = 'Delete everything';
    btn.disabled = false;
  }
}
var exportFormat = 'csv';

async function openExportModal(format) {
  exportFormat = format;
  document.getElementById('export-modal-title').textContent = format === 'csv' ? 'Export CSV' : 'Export PDF';
  document.getElementById('export-season-lbl').textContent = seasonLabel(currentSeason);
  document.getElementById('export-season-count').textContent = allEntries.length + ' entries';

  // Fetch total all-entries count
  if (sb && currentUser) {
    try {
      var all = await sb.from('cull_entries').select('id', { count: 'exact' }).eq('user_id', currentUser.id);
      var total = all.count || 0;
      document.getElementById('export-all-count').textContent = total + ' entries across all seasons';
    } catch(e) {
      document.getElementById('export-all-count').textContent = '– entries across all seasons';
    }
  }

  var modal = document.getElementById('export-modal');
  modal.style.display = 'flex';
}

function closeExportModal() {
  document.getElementById('export-modal').style.display = 'none';
}

async function doExport(scope) {
  closeExportModal();
  if (scope === 'season') {
    if (exportFormat === 'csv') exportCSV();
    else exportPDF();
  } else {
    if (!sb || !currentUser) {
      showToast('⚠️ Sign in to export');
      return;
    }
    // Fetch ALL entries across all seasons
    showToast('⏳ Fetching all entries…');
    try {
      var r = await sb.from('cull_entries')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('date', { ascending: false });
      if (r.error || !r.data.length) { showToast('⚠️ No entries found'); return; }
      var allData = r.data;
      if (exportFormat === 'csv') exportCSVData(allData, 'all-seasons');
      else exportPDFData(allData, 'All Seasons');
    } catch(e) {
      showToast('⚠️ Export failed — ' + (e.message || 'network error'));
    }
  }
}

function exportCSV() {
  if (!allEntries.length) { showToast('⚠️ No entries to export'); return; }
  exportCSVData(allEntries, currentSeason);
}

function exportCSVData(entries, label) {
  var headers = ['Date','Time','Species','Sex','Location','Ground','Gralloch(kg)','Clean(kg)','Larder(kg)','Calibre','Distance(m)','Placement','Age class','Shooter','Destination','Notes'];
  function csvField(v) {
    // Properly quote CSV fields — handles commas, newlines, and quotes
    var s = v === null || v === undefined ? '' : String(v);
    return '"' + s.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '') + '"';
  }
  var rows = entries.map(function(e) {
    return [
      csvField(e.date), csvField(e.time), csvField(e.species),
      csvField(e.sex === 'm' ? 'Male' : 'Female'), csvField(e.location_name), csvField(e.ground||''),
      csvField(e.weight_gralloch), csvField(e.weight_clean), csvField(e.weight_larder),
      csvField(e.calibre), csvField(e.distance_m), csvField(e.shot_placement),
      csvField(e.age_class), csvField(e.shooter||'Self'), csvField(e.destination||''), csvField(e.notes)
    ].join(',');
  });
  var csv = [headers.join(',')].concat(rows).join('\n');
  var blob = new Blob([csv], {type:'text/csv'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cull-diary-' + label + '.csv';
  a.click();
  showToast('✅ CSV downloaded — ' + entries.length + ' entries');
}

function exportPDF() {
  if (!allEntries.length) { showToast('⚠️ No entries to export'); return; }
  exportPDFData(allEntries, seasonLabel(currentSeason));
}

function exportPDFData(entries, label) {
  // Simple list export (used for all-seasons or fallback)
  var doc = new jspdf.jsPDF();
  doc.setFontSize(18);
  doc.text('Cull Diary - ' + label, 14, 20);
  doc.setFontSize(10);
  doc.text('First Light · firstlightdeer.co.uk · ' + entries.length + ' entries', 14, 28);
  var y = 38;
  entries.forEach(function(e, i) {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text((i+1) + '. ' + e.species + ' (' + (e.sex==='m'?'Male':'Female') + ') - ' + (fmtDate(e.date) || '—'), 14, y);
    y += 6;
    doc.setFontSize(9);
    var meta = [];
    if (e.location_name) meta.push('Location: ' + e.location_name);
    if (e.weight_gralloch) meta.push('Gralloch: ' + e.weight_gralloch + 'kg');
    if (e.calibre) meta.push('Calibre: ' + e.calibre);
    if (e.distance_m) meta.push('Distance: ' + e.distance_m + 'm');
    if (e.shot_placement) meta.push('Placement: ' + e.shot_placement);
    if (e.destination) meta.push('Destination: ' + e.destination);
    if (meta.length) { doc.text(meta.join(' · '), 14, y); y += 5; }
    if (e.notes) {
      var noteLines = doc.splitTextToSize('Notes: ' + e.notes, 180);
      noteLines.forEach(function(line) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(line, 14, y); y += 4;
      });
      y += 1;
    }
    y += 4;
    doc.line(14, y, 196, y); y += 5;
  });
  var filename = label === 'All Seasons' ? 'cull-diary-all-seasons' : 'cull-diary-' + currentSeason;
  doc.save(filename + '.pdf');
  showToast('✅ PDF downloaded - ' + entries.length + ' entries');
}

// ── Season Summary PDF ────────────────────────────────────────
// Full formatted report: header, stats, species breakdown,
// cull plan vs actual, complete entries table with pagination
function exportSeasonSummary() {
  var entries = allEntries;
  if (!entries.length) { showToast('⚠️ No entries to export'); return; }

  var doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  var PW = 595, PH = 842; // A4 in pt
  var ML = 18, MR = 18;   // left/right margins
  var UW = PW - ML - MR;  // usable width = 559pt

  // ── Colour helpers ──
  function rgb(hex) {
    var r = parseInt(hex.slice(1,3),16)/255;
    var g = parseInt(hex.slice(3,5),16)/255;
    var b = parseInt(hex.slice(5,7),16)/255;
    return [r,g,b];
  }
  var C = {
    deep:   '#0e2a08', forest: '#1a3a0e', moss:   '#5a7a30',
    gold:   '#c8a84b', bark:   '#3d2b1f', muted:  '#a0988a',
    stone:  '#ede9e2', white:  '#ffffff',
    red:    '#c8a84b', roe:    '#5a7a30', fallow: '#f57f17',
    muntjac:'#6a1b9a', sika:   '#1565c0', cwd:    '#00695c',
    male:   '#8b4513', female: '#8b1a4a', done:   '#2d7a1a',
  };
  function setFill(hex)   { var c=rgb(hex); doc.setFillColor(c[0]*255,c[1]*255,c[2]*255); }
  function setStroke(hex) { var c=rgb(hex); doc.setDrawColor(c[0]*255,c[1]*255,c[2]*255); }
  function setFont(hex)   { var c=rgb(hex); doc.setTextColor(c[0]*255,c[1]*255,c[2]*255); }

  function hrule(y, col) {
    setStroke(col||C.stone); doc.setLineWidth(0.3);
    doc.line(0, y, PW, y);
  }

  function newPageIfNeeded(y, needed) {
    if (y + needed > PH - 50) {
      doc.addPage();
      // Mini header on continuation pages (match “All Seasons” vs single season)
      setFill(C.deep); doc.rect(0, 0, PW, 24, 'F');
      setFont(C.gold); doc.setFontSize(7); doc.setFont(undefined,'bold');
      var hdrSeason = window._summarySeasonLabel
        ? String(window._summarySeasonLabel).toUpperCase()
        : String(currentSeason).toUpperCase();
      doc.text('FIRST LIGHT  -  CULL DIARY  -  ' + hdrSeason, ML, 15);
      return 32;
    }
    return y;
  }

  // ── Stats from entries ──
  var totalKg  = entries.reduce(function(s,e){ return s+(parseFloat(e.weight_gralloch)||0); },0);
  var avgKg    = entries.length ? Math.round(totalKg/entries.length) : 0;
  var spSet    = {};
  entries.forEach(function(e){ spSet[e.species]=(spSet[e.species]||0)+1; });
  var spCount  = Object.keys(spSet).length;
  var spColors = { 'Red Deer':C.red,'Roe Deer':C.roe,'Fallow':C.fallow,
                   'Muntjac':C.muntjac,'Sika':C.sika,'CWD':C.cwd };

  // ── Generate display date ──
  function fmtEntryDate(d) {
    if (!d) return '';
    var p = parseEntryDateParts(d);
    if (!p) {
      var s = String(d).trim();
      return s || '—';
    }
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return p.day + ' ' + months[p.m - 1] + ' ' + p.y;
  }
  function fmtEntryTime(t) {
    if (t === null || t === undefined || t === '') return '–';
    var s = String(t).trim();
    return s || '–';
  }

  // ═══════════════════════════════════════
  // PAGE 1
  // ═══════════════════════════════════════
  var y = 0;

  // Header band — HDR_H from stacked lines so URL / generated never overlap
  var now = new Date();
  var mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var _pdfHm = (function(d){ var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d); return {h:parseInt(p.find(function(x){return x.type==='hour';}).value),m:parseInt(p.find(function(x){return x.type==='minute';}).value)}; }(now));
  var genDate = now.getDate()+' '+mo[now.getMonth()]+' '+now.getFullYear()+
    '  -  '+('0'+_pdfHm.h).slice(-2)+':'+('0'+_pdfHm.m).slice(-2);
  var hasGr = window._summaryGroundOverride && window._summaryGroundOverride !== 'All Grounds';
  var metaUrlY = hasGr ? 74 : 58;
  var metaGenY = metaUrlY + 13;
  var HDR_H = metaGenY + 16;

  setFill(C.deep); doc.rect(0, 0, PW, HDR_H, 'F');
  setFill(C.forest); doc.rect(0, 0, PW/2, HDR_H, 'F');
  setStroke(C.gold); doc.setLineWidth(1.5);
  doc.line(0, HDR_H, PW, HDR_H);

  setFont(C.gold); doc.setFontSize(7); doc.setFont(undefined,'bold');
  doc.text('FIRST LIGHT  -  CULL DIARY', ML, 18);
  setFont(C.white); doc.setFontSize(22); doc.setFont(undefined,'bold');
  var pdfSeasonTitle = (window._summarySeasonLabel || (currentSeason + ' Season Report'));
  doc.text(pdfSeasonTitle, ML, 42);
  if (hasGr) {
    setFont(C.gold); doc.setFontSize(9); doc.setFont(undefined,'bold');
    doc.text('Ground: ' + window._summaryGroundOverride, ML, 58);
  }
  setFont('#aaaaaa'); doc.setFontSize(10); doc.setFont(undefined,'normal');
  doc.text('firstlightdeer.co.uk', ML, metaUrlY);
  setFont(C.gold); doc.setFontSize(7); doc.setFont(undefined,'normal');
  doc.text('Generated '+genDate, ML, metaGenY);

  y = HDR_H;

  // Stats row
  var STAT_H = 46, cw = PW/4;
  var statData = [
    [String(entries.length), 'Total Cull'],
    [String(spCount),        'Species'],
    [String(Math.round(totalKg)), 'kg Gralloch'],
    [avgKg ? String(avgKg)+'kg' : '-', 'Average'],
  ];
  statData.forEach(function(s, i) {
    var x = i*cw;
    setFill(i%2===0 ? C.white : '#faf8f5'); doc.rect(x, y, cw, STAT_H, 'F');
    if (i>0) { setStroke(C.stone); doc.setLineWidth(0.5); doc.line(x,y,x,y+STAT_H); }
    setFont(C.bark); doc.setFontSize(20); doc.setFont(undefined,'bold');
    doc.text(s[0], x+cw/2, y+22, {align:'center'});
    setFont(C.muted); doc.setFontSize(7); doc.setFont(undefined,'bold');
    doc.text(s[1].toUpperCase(), x+cw/2, y+35, {align:'center'});
  });
  hrule(y+STAT_H, C.stone);
  y += STAT_H;

  // ── Section header helper ──
  function secHdr(y, title) {
    setFill('#f0ece6'); doc.rect(0, y, PW, 18, 'F');
    setStroke(C.stone); doc.setLineWidth(0.5); doc.line(0,y+18,PW,y+18);
    setFont(C.moss); doc.setFontSize(7); doc.setFont(undefined,'bold');
    doc.text(title.toUpperCase(), ML, y+11);
    return y+18;
  }

  // ── Species breakdown ──
  y = secHdr(y, 'Species Breakdown');
  var spSorted = Object.keys(spSet).sort(function(a,b){ return spSet[b]-spSet[a]; });
  var spMax = Math.max.apply(null, spSorted.map(function(k){ return spSet[k]; }));
  var totalWtBySpecies = {};
  entries.forEach(function(e){ totalWtBySpecies[e.species]=(totalWtBySpecies[e.species]||0)+(parseFloat(e.weight_gralloch)||0); });

  var bxBar = 130, bwBar = 210, bhBar = 5;
  spSorted.forEach(function(sp) {
    y += 22;
    var base = y;
    var clr = spColors[sp] || C.moss;
    setFill(clr); doc.circle(22, base - 3, 3.5, 'F');
    setFont(C.bark); doc.setFontSize(10); doc.setFont(undefined,'bold');
    doc.text(sp, 32, base);
    setFill(C.stone); doc.roundedRect(bxBar, base - 5, bwBar, bhBar, 2, 2, 'F');
    setFill(clr); doc.roundedRect(bxBar, base - 5, bwBar * (spSet[sp] / spMax), bhBar, 2, 2, 'F');
    setFont(C.bark); doc.setFontSize(10); doc.setFont(undefined,'bold');
    doc.text(String(spSet[sp]), 355, base);
    setFont(C.muted); doc.setFontSize(9); doc.setFont(undefined,'normal');
    var wtStr = totalWtBySpecies[sp] ? Math.round(totalWtBySpecies[sp]) + ' kg' : '';
    doc.text(wtStr, PW - MR, base, { align: 'right' });
    hrule(base + 10, C.stone);
    y = base + 10;
  });

  // ── Cull Plan vs Actual: show target rows + rows where there are actuals but no target ──
  var actuals = {};
  entries.forEach(function(e) { var k = e.species + '-' + e.sex; actuals[k] = (actuals[k] || 0) + 1; });
  var planRows = 0;
  PLAN_SPECIES.forEach(function(sp) {
    var mT = cullTargets[sp.name + '-m'] || 0, fT = cullTargets[sp.name + '-f'] || 0;
    var mA = actuals[sp.name + '-m'] || 0, fA = actuals[sp.name + '-f'] || 0;
    [[mT, mA, 'Male'], [fT, fA, 'Female']].forEach(function(row) {
      var tgt = row[0], act = row[1], sex = row[2];
      if (!tgt && !act) return;
      planRows++;
    });
  });
  if (planRows > 0) {
    y += 10;
    y = secHdr(y, 'Cull Plan vs Actual');
    PLAN_SPECIES.forEach(function(sp) {
      var mT = cullTargets[sp.name + '-m'] || 0, fT = cullTargets[sp.name + '-f'] || 0;
      var mA = actuals[sp.name + '-m'] || 0, fA = actuals[sp.name + '-f'] || 0;
      [[mT, mA, 'Male'], [fT, fA, 'Female']].forEach(function(row) {
        var tgt = row[0], act = row[1], sex = row[2];
        if (!tgt && !act) return;
        y += 16;
        setFont(C.bark); doc.setFontSize(9); doc.setFont(undefined, 'bold');
        if (sex === 'Male') doc.text(sp.name, ML, y);
        setFont(sex === 'Male' ? C.male : C.female); doc.setFont(undefined, 'normal');
        doc.text(sex, 82, y);
        var bx = 138, bw = 280, bh = 4;
        if (tgt > 0) {
          var pct = Math.min(1, act / tgt), done = act >= tgt;
          setFill(C.stone); doc.roundedRect(bx, y - 3, bw, bh, 2, 2, 'F');
          setFill(done ? C.done : C.moss); doc.roundedRect(bx, y - 3, bw * pct, bh, 2, 2, 'F');
          setFont(done ? C.done : C.bark); doc.setFontSize(9); doc.setFont(undefined, 'bold');
          doc.text(act + '/' + tgt + (done ? ' (done)' : ''), PW - MR, y, { align: 'right' });
        } else {
          setFont(C.muted); doc.setFontSize(9); doc.setFont(undefined, 'normal');
          doc.text(String(act) + ' (no target set)', PW - MR, y, { align: 'right' });
        }
        hrule(y + 6, C.stone);
      });
    });
  }

  // ── Entries table (compact 7pt — DATE, TIME, GROUND, NOTES added) ──
  y += 10;
  y = secHdr(y, 'All Entries — ' + entries.length + ' records');

  var W_DATE = 42, W_TIME = 28, W_SP = 56, W_SEX = 34, W_GRALL = 34, W_GRND = 46, W_PLACE = 48, W_SHOOT = 40, W_LOC = 58, W_NOTES = 173;
  var COL = {
    date:      ML,
    time:      ML + W_DATE,
    species:   ML + W_DATE + W_TIME,
    sex:       ML + W_DATE + W_TIME + W_SP,
    gralloch:  ML + W_DATE + W_TIME + W_SP + W_SEX,
    ground:    ML + W_DATE + W_TIME + W_SP + W_SEX + W_GRALL,
    placement: ML + W_DATE + W_TIME + W_SP + W_SEX + W_GRALL + W_GRND,
    shooter:   ML + W_DATE + W_TIME + W_SP + W_SEX + W_GRALL + W_GRND + W_PLACE,
    location:  ML + W_DATE + W_TIME + W_SP + W_SEX + W_GRALL + W_GRND + W_PLACE + W_SHOOT,
    notes:     ML + W_DATE + W_TIME + W_SP + W_SEX + W_GRALL + W_GRND + W_PLACE + W_SHOOT + W_LOC
  };

  var TB = 7;
  y += 18;
  setFill('#f0ece6'); doc.rect(0, y - 14, PW, 18, 'F');
  setFont(C.muted); doc.setFontSize(6.5); doc.setFont(undefined,'bold');
  var hdrs = [
    ['DATE', COL.date], ['TIME', COL.time], ['SPECIES', COL.species], ['SEX', COL.sex],
    ['GRALL.', COL.gralloch], ['GROUND', COL.ground], ['PLACE', COL.placement],
    ['SHOOT', COL.shooter], ['LOCATION', COL.location], ['NOTES', COL.notes]
  ];
  hdrs.forEach(function(h) { doc.text(h[0], h[1], y - 3); });
  hrule(y + 4, C.stone);

  entries.forEach(function(e, i) {
    y = newPageIfNeeded(y, 22);
    y += 18;
    setFill(i % 2 === 0 ? C.white : '#fdfcfa'); doc.rect(0, y - 12, PW, 18, 'F');
    doc.setFontSize(TB); setFont(C.bark); doc.setFont(undefined, 'normal');
    doc.text(fmtEntryDate(e.date), COL.date, y);
    doc.text(fmtEntryTime(e.time), COL.time, y);
    doc.text((e.species || '').slice(0, 16), COL.species, y);
    setFont(e.sex === 'm' ? C.male : C.female); doc.setFont(undefined, 'bold');
    doc.text(e.sex === 'm' ? 'Male' : 'Female', COL.sex, y);
    setFont(C.bark); doc.setFont(undefined, 'normal');
    doc.text(e.weight_gralloch ? (String(e.weight_gralloch).slice(0, 8)) : '–', COL.gralloch, y);
    var gnd = (e.ground && String(e.ground).trim()) ? String(e.ground).trim() : '–';
    var gLines = doc.splitTextToSize(gnd, W_GRND - 2);
    doc.text(gLines.length > 1 ? gLines[0] + '…' : (gLines[0] || '–'), COL.ground, y);
    doc.text((e.shot_placement || '–').slice(0, 12), COL.placement, y);
    doc.text((e.shooter && e.shooter !== 'Self' ? e.shooter : '–').slice(0, 14), COL.shooter, y);
    var locRaw = String(e.location_name || '–');
    var locLines = doc.splitTextToSize(locRaw, W_LOC - 2);
    doc.text(locLines.length > 1 ? locLines[0] + '…' : (locLines[0] || '–'), COL.location, y);
    var noteRaw = (e.notes && String(e.notes).trim()) ? String(e.notes).replace(/\s+/g, ' ').trim() : '–';
    var noteLines = doc.splitTextToSize(noteRaw, W_NOTES - 2);
    doc.text(noteLines.length > 1 ? noteLines[0] + '…' : (noteLines[0] || '–'), COL.notes, y);
    hrule(y + 4, C.stone);
  });

  // Footer on each page
  var pageCount = doc.internal.getNumberOfPages();
  for (var p=1; p<=pageCount; p++) {
    doc.setPage(p);
    setStroke(C.stone); doc.setLineWidth(0.5); doc.line(0,PH-38,PW,PH-38);
    setFont(C.muted); doc.setFontSize(7); doc.setFont(undefined,'normal');
    doc.text('First Light  -  Cull Diary  -  Page '+p+' of '+pageCount, ML, PH-24);
    setFont(C.gold);
    doc.text('firstlightdeer.co.uk', PW-MR, PH-24, {align:'right'});
  }

  var summaryFilename = window._summarySeasonLabel
    ? 'first-light-all-seasons'
    : 'first-light-season-' + currentSeason;
  if (window._summaryGroundOverride && window._summaryGroundOverride !== 'All Grounds') {
    summaryFilename += '-' + window._summaryGroundOverride.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  }
  doc.save(summaryFilename + '.pdf');
  showToast('✅ Season summary downloaded');
}

// ── Syndicate manager export (species, sex, date, culled-by only) ──
var syndicateExportFormat = 'csv';

function syndicateFileSlug(name) {
  var s = String(name || 'syndicate').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return s || 'syndicate';
}

function getSeasonSelectValues() {
  var sel = document.getElementById('season-select');
  if (!sel || !sel.options || !sel.options.length) return [currentSeason];
  var out = [];
  for (var i = 0; i < sel.options.length; i++) {
    var v = sel.options[i].value;
    if (v) out.push(v);
  }
  return out.length ? out : [currentSeason];
}

async function updateSyndicateExportVisibility() {
  var row = document.getElementById('syndicate-export-row');
  if (!row) return;
  if (!sb || !currentUser) {
    row.style.display = 'none';
    return;
  }
  try {
    var list = await loadMySyndicateRows();
    var hasMgr = list.some(function(x) { return x.role === 'manager'; });
    row.style.display = hasMgr ? 'block' : 'none';
  } catch (e) {
    row.style.display = 'none';
  }
}

async function fetchSyndicateMemberNameMap(syndicateId) {
  var map = {};
  if (!sb || !syndicateId) return map;
  var r = await sb.from('syndicate_members').select('user_id, display_name')
    .eq('syndicate_id', syndicateId).eq('status', 'active');
  if (r.data) {
    r.data.forEach(function(m) {
      map[m.user_id] = (m.display_name && String(m.display_name).trim())
        ? String(m.display_name).trim()
        : ('Member ' + (m.user_id || '').slice(0, 8));
    });
  }
  return map;
}

function syndicateCulledByLabel(row, nameMap) {
  if (!row || !row.user_id) return 'Anonymous (retained)';
  return nameMap[row.user_id] || ('Member ' + String(row.user_id).slice(0, 8));
}

async function fetchSyndicateManagerExportRowsRaw(syndicateId, season, nameMap) {
  var br = await sb.rpc('syndicate_member_actuals_for_manager', { p_syndicate_id: syndicateId, p_season: season });
  if (br.error) throw br.error;
  return (br.data || []).map(function(row) {
    return {
      species: row.species,
      sex: row.sex,
      cull_date: row.cull_date,
      culledBy: syndicateCulledByLabel(row, nameMap)
    };
  });
}

function sortSyndicateExportRows(rows) {
  return rows.slice().sort(function(a, b) {
    var da = String(a.cull_date || '');
    var db = String(b.cull_date || '');
    if (da !== db) return db.localeCompare(da);
    var sp = String(a.species || '').localeCompare(String(b.species || ''));
    if (sp !== 0) return sp;
    var sx = String(a.sex || '').localeCompare(String(b.sex || ''));
    if (sx !== 0) return sx;
    return String(a.culledBy || '').localeCompare(String(b.culledBy || ''));
  });
}

async function fetchSyndicateExportRowsForScope(syndicateId, season, scope, nameMap) {
  if (scope === 'season') {
    return sortSyndicateExportRows(await fetchSyndicateManagerExportRowsRaw(syndicateId, season, nameMap));
  }
  var merged = [];
  var seasons = getSeasonSelectValues();
  for (var i = 0; i < seasons.length; i++) {
    var part = await fetchSyndicateManagerExportRowsRaw(syndicateId, seasons[i], nameMap);
    merged = merged.concat(part);
  }
  return sortSyndicateExportRows(merged);
}

function openSyndicateExportModal(format) {
  if (!sb || !currentUser) {
    showToast('⚠️ Sign in to export');
    return;
  }
  syndicateExportFormat = format || 'csv';
  var title = document.getElementById('syndicate-export-modal-title');
  var sub = document.getElementById('syndicate-export-modal-sub');
  var scopeWrap = document.getElementById('syndicate-export-scope-wrap');
  var sumHint = document.getElementById('syndicate-export-summary-hint');
  if (syndicateExportFormat === 'summary') {
    if (title) title.textContent = 'Syndicate summary (PDF)';
    if (sub) sub.textContent = 'Species breakdown, plan vs actual, and all entries.';
    if (scopeWrap) scopeWrap.style.display = 'none';
    if (sumHint) sumHint.style.display = 'block';
  } else {
    if (title) title.textContent = syndicateExportFormat === 'csv' ? 'Syndicate CSV' : 'Syndicate PDF';
    if (sub) sub.textContent = 'Species, sex, date, and who culled.';
    if (scopeWrap) scopeWrap.style.display = 'block';
    if (sumHint) sumHint.style.display = 'none';
  }

  loadMySyndicateRows().then(function(list) {
    var mgr = list.filter(function(x) { return x.role === 'manager'; });
    if (!mgr.length) {
      showToast('⚠️ Manager access required');
      return;
    }
    var sel = document.getElementById('syndicate-export-syndicate');
    var sea = document.getElementById('syndicate-export-season');
    if (!sel || !sea) return;
    sel.innerHTML = mgr.map(function(x) {
      return '<option value="' + esc(x.syndicate.id) + '">' + esc(x.syndicate.name) + '</option>';
    }).join('');
    var listSel = document.getElementById('season-select');
    sea.innerHTML = listSel ? listSel.innerHTML : '<option value="' + esc(currentSeason) + '">' + esc(currentSeason) + '</option>';
    sea.value = currentSeason;
    var modal = document.getElementById('syndicate-export-modal');
    if (modal) modal.style.display = 'flex';
  }).catch(function() {
    showToast('⚠️ Could not load syndicates');
  });
}

function closeSyndicateExportModal() {
  var modal = document.getElementById('syndicate-export-modal');
  if (modal) modal.style.display = 'none';
}

async function fetchSyndicateSummaryForManagerExport(syndicate, season) {
  var sum = await fetchSyndicateSummaryRpc(syndicate.id, season);
  if (sum.ok) return sum.rows || [];
  var fb = await fetchSyndicateSummaryFallback(syndicate, season, true);
  return fb.rows || [];
}

async function doSyndicateExport() {
  if (!sb || !currentUser) {
    showToast('⚠️ Sign in');
    return;
  }
  var sel = document.getElementById('syndicate-export-syndicate');
  var sea = document.getElementById('syndicate-export-season');
  if (!sel || !sea) return;
  var syndicateId = sel.value;
  if (!syndicateId) {
    showToast('⚠️ Choose a syndicate');
    return;
  }
  var list = await loadMySyndicateRows();
  var pick = list.find(function(x) {
    return String(x.syndicate.id) === String(syndicateId) && x.role === 'manager';
  });
  if (!pick) {
    showToast('⚠️ Manager access required');
    return;
  }
  var s = pick.syndicate;
  var season = sea.value || currentSeason;
  var scopeEl = document.querySelector('input[name="syndicate-export-scope"]:checked');
  var scope = scopeEl ? scopeEl.value : 'season';
  closeSyndicateExportModal();

  var nameMap = await fetchSyndicateMemberNameMap(syndicateId);

  try {
    if (syndicateExportFormat === 'summary') {
      showToast('⏳ Building summary…');
      var entries = sortSyndicateExportRows(await fetchSyndicateManagerExportRowsRaw(syndicateId, season, nameMap));
      var summaryRows = await fetchSyndicateSummaryForManagerExport(s, season);
      exportSyndicateSeasonSummaryPdf(s, season, entries, summaryRows);
      return;
    }
    showToast('⏳ Preparing export…');
    var rows = await fetchSyndicateExportRowsForScope(syndicateId, season, scope, nameMap);
    var slug = syndicateFileSlug(s.name);
    var label = scope === 'all' ? 'all-seasons' : season;
    if (syndicateExportFormat === 'csv') {
      exportSyndicateCSVData(rows, 'syndicate-' + slug + '-' + label);
    } else {
      var titleExtra = scope === 'all' ? 'All seasons' : seasonLabel(season);
      exportSyndicateListPDF(rows, s.name, titleExtra, 'syndicate-' + slug + '-' + label);
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('syndicate export', e);
    showToast('⚠️ ' + (e.message || 'Export failed'));
  }
}

function exportSyndicateCSVData(rows, filenameBase) {
  function csvField(v) {
    var x = v === null || v === undefined ? '' : String(v);
    return '"' + x.replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, '') + '"';
  }
  var headers = ['Species', 'Sex', 'Date', 'Culled by'];
  var lines = rows.map(function(r) {
    return [
      csvField(r.species),
      csvField(r.sex === 'm' ? 'Male' : 'Female'),
      csvField(r.cull_date || ''),
      csvField(r.culledBy)
    ].join(',');
  });
  var csv = [headers.join(',')].concat(lines).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filenameBase + '.csv';
  a.click();
  showToast('✅ CSV downloaded — ' + rows.length + ' rows');
}

function exportSyndicateListPDF(rows, syndicateName, seasonLabelStr, filenameBase) {
  var doc = new jspdf.jsPDF();
  doc.setFontSize(16);
  doc.text('Syndicate culls — ' + syndicateName, 14, 18);
  doc.setFontSize(10);
  doc.text(seasonLabelStr + ' · ' + rows.length + ' rows · firstlightdeer.co.uk', 14, 26);
  var y = 36;
  rows.forEach(function(r, i) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text((i + 1) + '. ' + (r.species || '—'), 14, y);
    doc.setFont(undefined, 'normal');
    doc.text(r.sex === 'm' ? 'Male' : 'Female', 100, y);
    doc.text(fmtDate(r.cull_date) || String(r.cull_date || '—'), 130, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Culled by: ' + (r.culledBy || '—'), 14, y);
    doc.setTextColor(0, 0, 0);
    y += 8;
  });
  doc.save(filenameBase + '.pdf');
  showToast('✅ PDF downloaded — ' + rows.length + ' rows');
}

function exportSyndicateSeasonSummaryPdf(syndicate, season, entries, summaryRows) {
  var doc = new jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  var PW = 595, PH = 842, ML = 18, MR = 18;

  function rgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }
  var C = {
    deep: '#0e2a08', forest: '#1a3a0e', moss: '#5a7a30',
    gold: '#c8a84b', bark: '#3d2b1f', muted: '#a0988a',
    stone: '#ede9e2', white: '#ffffff',
    red: '#c8a84b', roe: '#5a7a30', fallow: '#f57f17',
    muntjac: '#6a1b9a', sika: '#1565c0', cwd: '#00695c',
    male: '#8b4513', female: '#8b1a4a', done: '#2d7a1a'
  };
  var spColors = { 'Red Deer': C.red, 'Roe Deer': C.roe, 'Fallow': C.fallow,
    'Muntjac': C.muntjac, 'Sika': C.sika, 'CWD': C.cwd };

  function setFill(hex) { var c = rgb(hex); doc.setFillColor(c[0] * 255, c[1] * 255, c[2] * 255); }
  function setStroke(hex) { var c = rgb(hex); doc.setDrawColor(c[0] * 255, c[1] * 255, c[2] * 255); }
  function setFont(hex) { var c = rgb(hex); doc.setTextColor(c[0] * 255, c[1] * 255, c[2] * 255); }

  function hrule(y, col) {
    setStroke(col || C.stone);
    doc.setLineWidth(0.3);
    doc.line(0, y, PW, y);
  }

  function newPageIfNeeded(y, needed) {
    if (y + needed > PH - 50) {
      doc.addPage();
      setFill(C.deep);
      doc.rect(0, 0, PW, 24, 'F');
      setFont(C.gold);
      doc.setFontSize(7);
      doc.setFont(undefined, 'bold');
      doc.text('FIRST LIGHT  -  SYNDICATE  -  ' + String(season).toUpperCase(), ML, 15);
      return 32;
    }
    return y;
  }

  function secHdr(y0, title) {
    setFill('#f0ece6');
    doc.rect(0, y0, PW, 18, 'F');
    setStroke(C.stone);
    doc.setLineWidth(0.5);
    doc.line(0, y0 + 18, PW, y0 + 18);
    setFont(C.moss);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text(title.toUpperCase(), ML, y0 + 11);
    return y0 + 18;
  }

  function fmtEntryDatePdf(d) {
    if (!d) return '—';
    var p = parseEntryDateParts(d);
    if (!p) return String(d);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return p.day + ' ' + months[p.m - 1] + ' ' + p.y;
  }

  var now = new Date();
  var mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var _pdfHm = (function(d) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    return { h: parseInt(p.find(function(x) { return x.type === 'hour'; }).value, 10), m: parseInt(p.find(function(x) { return x.type === 'minute'; }).value, 10) };
  }(now));
  var genDate = now.getDate() + ' ' + mo[now.getMonth()] + ' ' + now.getFullYear() +
    '  -  ' + ('0' + _pdfHm.h).slice(-2) + ':' + ('0' + _pdfHm.m).slice(-2);

  var HDR_H = 94;
  setFill(C.deep);
  doc.rect(0, 0, PW, HDR_H, 'F');
  setFill(C.forest);
  doc.rect(0, 0, PW / 2, HDR_H, 'F');
  setStroke(C.gold);
  doc.setLineWidth(1.5);
  doc.line(0, HDR_H, PW, HDR_H);

  setFont(C.gold);
  doc.setFontSize(7);
  doc.setFont(undefined, 'bold');
  doc.text('FIRST LIGHT  -  SYNDICATE SUMMARY', ML, 18);
  setFont(C.white);
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text(syndicate.name, ML, 42);
  setFont(C.gold);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(seasonLabel(season), ML, 58);
  setFont('#aaaaaa');
  doc.setFontSize(10);
  doc.text('firstlightdeer.co.uk', ML, 72);
  setFont(C.gold);
  doc.setFontSize(7);
  doc.text('Generated ' + genDate, ML, 84);

  var y = HDR_H + 12;

  var mCount = entries.filter(function(e) { return e.sex === 'm'; }).length;
  var fCount = entries.filter(function(e) { return e.sex === 'f'; }).length;
  var spSet = {};
  entries.forEach(function(e) { spSet[e.species] = (spSet[e.species] || 0) + 1; });
  var spCount = Object.keys(spSet).length;

  var STAT_H = 46, cw = PW / 4;
  var statData = [
    [String(entries.length), 'Total culls'],
    [String(spCount), 'Species'],
    [String(mCount), 'Male'],
    [String(fCount), 'Female']
  ];
  statData.forEach(function(s, i) {
    var x = i * cw;
    setFill(i % 2 === 0 ? C.white : '#faf8f5');
    doc.rect(x, y, cw, STAT_H, 'F');
    if (i > 0) {
      setStroke(C.stone);
      doc.setLineWidth(0.5);
      doc.line(x, y, x, y + STAT_H);
    }
    setFont(C.bark);
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text(s[0], x + cw / 2, y + 22, { align: 'center' });
    setFont(C.muted);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text(s[1].toUpperCase(), x + cw / 2, y + 35, { align: 'center' });
  });
  hrule(y + STAT_H, C.stone);
  y += STAT_H;

  y = secHdr(y, 'Species breakdown');
  var spSorted = Object.keys(spSet).sort(function(a, b) { return spSet[b] - spSet[a]; });
  if (!spSorted.length) {
    y += 14;
    setFont(C.muted);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('No culls recorded for this season.', ML, y);
    y += 8;
  }
  var spMax = Math.max.apply(null, spSorted.map(function(k) { return spSet[k]; }).concat([1]));
  var bxBar = 130, bwBar = 210, bhBar = 5;
  spSorted.forEach(function(sp) {
    y += 22;
    var base = y;
    var clr = spColors[sp] || C.moss;
    setFill(clr);
    doc.circle(22, base - 3, 3.5, 'F');
    setFont(C.bark);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(sp, 32, base);
    setFill(C.stone);
    doc.roundedRect(bxBar, base - 5, bwBar, bhBar, 2, 2, 'F');
    setFill(clr);
    doc.roundedRect(bxBar, base - 5, bwBar * (spSet[sp] / spMax), bhBar, 2, 2, 'F');
    setFont(C.bark);
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(String(spSet[sp]), 355, base);
    hrule(base + 10, C.stone);
    y = base + 10;
  });

  var byKey = {};
  (summaryRows || []).forEach(function(row) {
    var k = row.species + '-' + row.sex;
    byKey[k] = row;
  });
  var planRows = 0;
  PLAN_SPECIES.forEach(function(ps) {
    ['m', 'f'].forEach(function(sx) {
      var row = byKey[ps.name + '-' + sx];
      var tgt = row ? parseInt(row.target_total, 10) || 0 : 0;
      var act = row ? parseInt(row.actual_total, 10) || 0 : 0;
      if (tgt || act) planRows++;
    });
  });

  if (planRows > 0) {
    y += 10;
    y = secHdr(y, 'Cull plan vs actual');
    PLAN_SPECIES.forEach(function(ps) {
      var spMeta = planSpeciesMeta(ps.name);
      ['m', 'f'].forEach(function(sx) {
        var row = byKey[ps.name + '-' + sx];
        var tgt = row ? parseInt(row.target_total, 10) || 0 : 0;
        var act = row ? parseInt(row.actual_total, 10) || 0 : 0;
        if (!tgt && !act) return;
        y += 16;
        var sexLbl = sx === 'm' ? (spMeta.mLbl || 'Male') : (spMeta.fLbl || 'Female');
        setFont(C.bark);
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        if (sx === 'm') doc.text(ps.name, ML, y);
        setFont(sx === 'm' ? C.male : C.female);
        doc.setFont(undefined, 'normal');
        doc.text(sexLbl, 120, y);
        var bx = 200, bw = 220, bh = 4;
        if (tgt > 0) {
          var pct = Math.min(1, act / tgt);
          var done = act >= tgt;
          setFill(C.stone);
          doc.roundedRect(bx, y - 3, bw, bh, 2, 2, 'F');
          setFill(done ? C.done : C.moss);
          doc.roundedRect(bx, y - 3, bw * pct, bh, 2, 2, 'F');
          setFont(done ? C.done : C.bark);
          doc.setFontSize(9);
          doc.setFont(undefined, 'bold');
          doc.text(act + '/' + tgt + (done ? ' (done)' : ''), PW - MR, y, { align: 'right' });
        } else {
          setFont(C.muted);
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          doc.text(String(act) + ' (no target set)', PW - MR, y, { align: 'right' });
        }
        hrule(y + 6, C.stone);
      });
    });
  }

  y += 10;
  y = newPageIfNeeded(y, 40);
  y = secHdr(y, 'All entries — ' + entries.length + ' records');

  var W_DATE = 78, W_SP = 100, W_SEX = 52, W_BY = PW - ML - MR - W_DATE - W_SP - W_SEX;
  var COL = {
    date: ML,
    species: ML + W_DATE,
    sex: ML + W_DATE + W_SP,
    by: ML + W_DATE + W_SP + W_SEX
  };

  y += 18;
  setFill('#f0ece6');
  doc.rect(0, y - 14, PW, 18, 'F');
  setFont(C.muted);
  doc.setFontSize(6.5);
  doc.setFont(undefined, 'bold');
  doc.text('DATE', COL.date, y - 3);
  doc.text('SPECIES', COL.species, y - 3);
  doc.text('SEX', COL.sex, y - 3);
  doc.text('CULLED BY', COL.by, y - 3);
  hrule(y + 4, C.stone);

  entries.forEach(function(e, i) {
    y = newPageIfNeeded(y, 22);
    y += 18;
    setFill(i % 2 === 0 ? C.white : '#fdfcfa');
    doc.rect(0, y - 12, PW, 18, 'F');
    doc.setFontSize(7);
    setFont(C.bark);
    doc.setFont(undefined, 'normal');
    doc.text(fmtEntryDatePdf(e.cull_date), COL.date, y);
    doc.text(String(e.species || '').slice(0, 22), COL.species, y);
    setFont(e.sex === 'm' ? C.male : C.female);
    doc.setFont(undefined, 'bold');
    doc.text(e.sex === 'm' ? 'Male' : 'Female', COL.sex, y);
    setFont(C.bark);
    doc.setFont(undefined, 'normal');
    var byLines = doc.splitTextToSize(String(e.culledBy || '—'), W_BY - 2);
    doc.text(byLines.length ? byLines[0] : '—', COL.by, y);
    hrule(y + 4, C.stone);
  });

  var pageCount = doc.internal.getNumberOfPages();
  for (var p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    setStroke(C.stone);
    doc.setLineWidth(0.5);
    doc.line(0, PH - 38, PW, PH - 38);
    setFont(C.muted);
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.text('First Light  -  ' + syndicate.name + '  -  Page ' + p + ' of ' + pageCount, ML, PH - 24);
    setFont(C.gold);
    doc.text('firstlightdeer.co.uk', PW - MR, PH - 24, { align: 'right' });
  }

  doc.save('syndicate-' + syndicateFileSlug(syndicate.name) + '-summary-' + season + '.pdf');
  showToast('✅ Syndicate summary downloaded');
}

function exportSinglePDF(id) {
  var e = allEntries.find(function(x){ return x.id === id; });
  if (!e) return;
  var doc = new jspdf.jsPDF();
  doc.setFontSize(16); doc.text('Cull Record — First Light', 14, 20);
  doc.setFontSize(12); doc.text(e.species + ' (' + (e.sex==='m'?'Male':'Female') + ')', 14, 32);
  doc.setFontSize(10);
  var fields = [
    ['Date', e.date], ['Time', e.time], ['Location', e.location_name],
    ['Ground', e.ground],
    ['Age class', e.age_class], ['Gralloch weight', e.weight_gralloch ? e.weight_gralloch + ' kg' : ''],
    ['Clean weight', e.weight_clean ? e.weight_clean + ' kg' : ''],
    ['Larder weight', e.weight_larder ? e.weight_larder + ' kg' : ''],
    ['Calibre', e.calibre], ['Distance', e.distance_m ? e.distance_m + 'm' : ''],
    ['Shot placement', e.shot_placement], ['Destination', e.destination], ['Notes', e.notes ? e.notes.slice(0, 300) : null]
  ];
  var y = 44;
  fields.forEach(function(f) {
    if (!f[1]) return;
    doc.setFont(undefined,'bold'); doc.text(f[0] + ':', 14, y);
    doc.setFont(undefined,'normal'); doc.text(String(f[1]), 60, y);
    y += 7;
  });
  doc.save('cull-record-' + e.date + '.pdf');
  showToast('✅ PDF downloaded');
}

// ══════════════════════════════════════════════════════════════
// QUICK ENTRY
// ══════════════════════════════════════════════════════════════
var qsSpecies = null;
var qsSexVal  = null;
var qsLocation = '';
var qsLat = null, qsLng = null;

function openQuickEntry() {
  // Reset state
  qsSpecies = null; qsSexVal = null;
  document.querySelectorAll('.qs-pill').forEach(function(p){ p.classList.remove('on'); });
  document.getElementById('qs-m').classList.remove('on');
  document.getElementById('qs-f').classList.remove('on');
  document.getElementById('qs-wt').value = '';

  // Pre-fill date/time/location in meta line
  var now = new Date();
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var _hm = (function(d){ var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d); return {h:parseInt(p.find(function(x){return x.type==='hour';}).value),m:parseInt(p.find(function(x){return x.type==='minute';}).value)}; }(now)); var timeStr = ('0'+_hm.h).slice(-2)+':'+('0'+_hm.m).slice(-2);
  var dateStr = days[now.getDay()] + ' ' + now.getDate() + ' ' + months[now.getMonth()];
  document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr + ' · Getting location…';

  // Show sheet
  document.getElementById('qs-overlay').classList.add('open');
  var qs = document.getElementById('quick-sheet');
  qs.style.display = 'block';
  qs.style.transform = 'translateX(-50%)';
  document.body.style.overflow = 'hidden';

  // Silently fetch GPS location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      qsLat = pos.coords.latitude.toFixed(4);
      qsLng = pos.coords.longitude.toFixed(4);
      nominatimFetch('https://nominatim.openstreetmap.org/reverse?lat=' + qsLat + '&lon=' + qsLng + '&format=json')
        .then(function(r){ return r.json(); })
        .then(function(d) {
          qsLocation = diaryReverseGeocodeLabel(d, qsLat, qsLng);
          document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr + ' · ' + qsLocation;
        }).catch(function() {
          qsLocation = qsLat + ', ' + qsLng;
          document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr + ' · ' + qsLocation;
        });
    }, function() {
      qsLocation = '';
      document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr;
    }, { timeout: 6000, maximumAge: 60000 });
  } else {
    document.getElementById('qs-meta').textContent = dateStr + ' · ' + timeStr;
  }
}

function closeQuickEntry() {
  document.getElementById('qs-overlay').classList.remove('open');
  document.getElementById('quick-sheet').style.display = 'none';
  document.body.style.overflow = '';
  qsSpecies = null; qsSexVal = null;
}

function qsPick(el, name) {
  document.querySelectorAll('.qs-pill').forEach(function(p){ p.classList.remove('on'); });
  el.classList.add('on');
  qsSpecies = name;
}

function qsSex(s) {
  qsSexVal = s;
  document.getElementById('qs-m').classList.toggle('on', s === 'm');
  document.getElementById('qs-f').classList.toggle('on', s === 'f');
}

async function saveQuickEntry() {
  if (!qsSpecies) { showToast('⚠️ Please select a species'); return; }
  if (!qsSexVal)  { showToast('⚠️ Please select sex'); return; }
  if (!sb || !currentUser) { showToast('⚠️ Not signed in'); return; }

  var btn = document.getElementById('qs-save-btn');
  btn.disabled = true; btn.innerHTML = diaryCloudSaveInner('Saving…');

  var now = new Date();
  var dateVal = now.getFullYear() + '-'
    + ('0'+(now.getMonth()+1)).slice(-2) + '-'
    + ('0'+now.getDate()).slice(-2);
  var _hm2 = (function(d){ var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d); return {h:parseInt(p.find(function(x){return x.type==='hour';}).value),m:parseInt(p.find(function(x){return x.type==='minute';}).value)}; }(now)); var timeVal = ('0'+_hm2.h).slice(-2)+':'+('0'+_hm2.m).slice(-2);

  var gralloch = parseFloat(document.getElementById('qs-wt').value) || null;

  var payload = {
    user_id:         currentUser.id,
    species:         qsSpecies,
    sex:             qsSexVal,
    date:            dateVal,
    time:            timeVal,
    location_name:   qsLocation || null,
    weight_gralloch: gralloch ? Math.max(0, gralloch) : null,
    weight_clean:    gralloch ? Math.round(gralloch * 0.82 * 10) / 10 : null,
    weight_larder:   gralloch ? Math.round(gralloch * 0.75 * 10) / 10 : null,
    lat:             qsLat ? parseFloat(qsLat) : null,
    lng:             qsLng ? parseFloat(qsLng) : null,
  };

  // ── Offline check ──
  if (!navigator.onLine) {
    await queueOfflineEntry({ species:payload.species, sex:payload.sex, date:payload.date, time:payload.time,
      location_name:payload.location_name, lat:payload.lat, lng:payload.lng,
      weight_gralloch:payload.weight_gralloch, weight_clean:payload.weight_clean, weight_larder:payload.weight_larder });
    btn.disabled = false; btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
    return;
  }

  try {
    var result = await sb.from('cull_entries').insert(payload).select('id');
    if (result.error) throw result.error;
    showToast('✅ ' + qsSpecies + ' saved');
    flHapticSuccess();
    closeQuickEntry();
    await loadEntries();
  } catch(e) {
    showToast('⚠️ Save failed: ' + (e.message || 'Unknown error'));
  }
  btn.disabled = false; btn.innerHTML = diaryCloudSaveInner('Save to Cloud');
}


// Open-Meteo WMO codes → abbrev + label + SVG + strip bar (replaces emoji sky cells)
function wxCodeLabel(code) {
  var c = code;
  if (c === 0 || c === null || c === undefined) {
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

function windDirLabel(deg) {
  if (deg === null || deg === undefined) return '';
  var dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// ── Weather at time of cull ──────────────────────────────────
// Fetches from Open-Meteo historical or forecast API
// Only fetches for entries within last 7 days
// Stores as JSONB in cull_entries.weather_data

function findOpenMeteoHourlyIndex(times, date, hour) {
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

async function fetchCullWeather(date, time, lat, lng) {
  // date: 'YYYY-MM-DD', time: 'HH:MM', lat/lng: numbers
  if (!date || !lat || !lng) return null;

  var entryDate = new Date(date + 'T' + (time || '12:00') + ':00');
  var now = new Date();
  var ageDays = (now - entryDate) / 86400000;

  // Skip if older than 7 days or in the future
  if (ageDays > 7 || ageDays < 0) return null;

  var hour = time ? parseInt(time.split(':')[0]) : 12;

  try {
    // Use forecast API with past_hours for recent entries
    // past_hours=168 = 7 days back
    var url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + lat + '&longitude=' + lng
      + '&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,windgusts_10m,surface_pressure,cloud_cover,weather_code,precipitation'
      + '&past_days=7&forecast_days=1&timezone=auto';

    var r = await fetch(url);
    if (!r.ok) return null;
    var d = await r.json();

    // Find the index matching our date+hour (API may use HH:00 or HH:00:00)
    var times = d.hourly && d.hourly.time ? d.hourly.time : [];
    var idx = findOpenMeteoHourlyIndex(times, date, hour);
    if (idx === -1) return null;

    var h = d.hourly;
    var windKmh = h.wind_speed_10m ? h.wind_speed_10m[idx] : null;
    var gustKmh = h.windgusts_10m  ? h.windgusts_10m[idx]  : null;

    return {
      temp:       h.temperature_2m    ? Math.round(h.temperature_2m[idx] * 10) / 10 : null,
      wind_mph:   windKmh !== null     ? Math.round(windKmh * 0.621)               : null,
      gust_mph:   gustKmh !== null     ? Math.round(gustKmh * 0.621)               : null,
      wind_dir:   h.wind_direction_10m ? h.wind_direction_10m[idx]                 : null,
      pressure:   h.surface_pressure  ? Math.round(h.surface_pressure[idx])        : null,
      cloud:      h.cloud_cover        ? h.cloud_cover[idx]                         : null,
      code:       h.weather_code       ? h.weather_code[idx]                        : null,
      precip_mm:  h.precipitation     ? h.precipitation[idx]                       : null,
      fetched_at: new Date().toISOString()
    };
  } catch(e) {
    console.warn('Weather fetch failed:', e);
    return null;
  }
}

async function attachWeatherToEntry(entryId, date, time, lat, lng) {
  if (!sb || !currentUser || !entryId) return;
  var wx = await fetchCullWeather(date, time, lat, lng);
  if (!wx) return; // silently skip if outside 7-day window or fetch failed
  try {
    var upd = await sb.from('cull_entries')
      .update({ weather_data: wx })
      .eq('id', entryId)
      .eq('user_id', currentUser.id);
    if (upd.error) console.warn('Weather attach failed:', upd.error);
    else {
      var wxi = allEntries.findIndex(function(x) { return x.id === entryId; });
      if (wxi !== -1) allEntries[wxi].weather_data = wx;
    }
  } catch(e) {
    console.warn('Weather attach failed:', e);
  }
}

function renderWeatherStrip(e) {
  var wx = e.weather_data;
  if (!wx || typeof wx !== 'object') return '';

  var wc = wxCodeLabel(wx.code);
  var windDir = windDirLabel(wx.wind_dir);
  var windStr = wx.wind_mph !== null ? wx.wind_mph + ' mph' : '–';
  if (windDir) windStr += ' ' + windDir;
  var tempStr  = wx.temp    !== null ? wx.temp + '°C'   : '–';
  var pressStr = wx.pressure !== null ? wx.pressure + ' hPa' : '–';
  var cloudStr = wx.cloud   !== null ? wx.cloud + '%'   : '–';

  var wxTagTitle = '';
  if (wx.fetched_at) {
    try {
      var fd = new Date(wx.fetched_at);
      if (!isNaN(fd.getTime())) {
        wxTagTitle = 'Fetched ' + fd.toLocaleString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
      }
    } catch (x) { /* ignore */ }
  }

  var html = '<div class="wx-strip-hdr">'
    + '<div class="wx-strip-hdr-main">'
    + '<div class="wx-strip-title">Conditions at time of cull</div>'
    + '<span class="wx-added-tag"' + (wxTagTitle ? ' title="' + esc(wxTagTitle) + '"' : '') + '>Weather added</span>'
    + '</div>'
    + (e.time ? '<div class="wx-strip-time">' + esc(e.time) + '</div>' : '')
    + '</div>'
    + '<div class="wx-strip">'
    + '<div class="wx-cell wx-cell--sky" title="' + esc(wc.wmoTitle) + '">'
    + '<div class="wx-cell-icon">' + wc.skySvg + '</div>'
    + '<div class="wx-sky-bar" style="background:' + wc.barBg + '" aria-hidden="true"></div>'
    + '<div class="wx-cell-val wx-cell-val--sky"><div class="wx-sky-abbr">' + esc(wc.abbrev) + '</div><div class="wx-sky-full">' + esc(wc.label) + '</div></div>'
    + '<div class="wx-cell-lbl">Sky</div></div>'
    + '<div class="wx-cell"><div class="wx-cell-icon">' + SVG_WX_TEMP + '</div><div class="wx-cell-val">' + tempStr + '</div><div class="wx-cell-lbl">Temp</div></div>'
    + '<div class="wx-cell"><div class="wx-cell-icon">' + SVG_WX_WIND + '</div><div class="wx-cell-val" style="font-size:10px;">' + esc(windStr) + '</div><div class="wx-cell-lbl">Wind</div></div>'
    + '<div class="wx-cell"><div class="wx-cell-icon">' + SVG_WX_PRESSURE + '</div><div class="wx-cell-val" style="font-size:10px;">' + esc(pressStr) + '</div><div class="wx-cell-lbl">Pressure</div></div>'
    + '</div>';

  return html;
}


// ══════════════════════════════════════════════════════════════
// MAP FEATURE — Pin Drop + Cull Map
// ══════════════════════════════════════════════════════════════
var OS_KEY = 'Q4CgPxeA5EHM17KPG6y78arVIekRHGsv';
var TILE_SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
// OS Maps API — Road_3857 works on free tier; Outdoor_3857 requires premium
var TILE_OS_STD = 'https://api.os.uk/maps/raster/v1/zxy/Road_3857/{z}/{x}/{y}.png?key=' + OS_KEY;

var SP_COLORS = {
  'Red Deer':'#c8a84b','Roe Deer':'#5a7a30','Fallow':'#f57f17',
  'Muntjac':'#6a1b9a','Sika':'#1565c0','CWD':'#00695c'
};

// ── PIN DROP ──────────────────────────────────────────────────
var pinMap = null, pinMapLayer = null, pinSatLayer = null;
var formPinLat = null, formPinLng = null;
var pinNominatimTimer = null;
var _pinMapTileErrorCount = 0;

function formatPinMapCoordLine(lat, lng) {
  return Math.abs(lat).toFixed(5) + '°' + (lat >= 0 ? 'N' : 'S')
    + ' · ' + Math.abs(lng).toFixed(5) + '°' + (lng >= 0 ? 'E' : 'W');
}

function refreshPinMapFallbackBanner() {
  var el = document.getElementById('pinmap-fallback-msg');
  if (!el) return;
  var o = document.getElementById('pinmap-overlay');
  if (!o || o.style.display !== 'flex') return;
  if (!navigator.onLine) {
    el.style.display = 'block';
    el.textContent = 'Offline — map tiles won\'t load. Enter latitude and longitude (decimal degrees, WGS84), tap Apply, then Confirm.';
    return;
  }
  if (_pinMapTileErrorCount >= 3) {
    el.style.display = 'block';
    el.textContent = 'Map tiles may be failing. Enter decimal degrees below, try Satellite, or check signal.';
    return;
  }
  el.style.display = 'none';
  el.textContent = '';
}

function applyManualPinCoords() {
  var latEl = document.getElementById('pinmap-manual-lat');
  var lngEl = document.getElementById('pinmap-manual-lng');
  if (!latEl || !lngEl) return;
  var lat = parseFloat(String(latEl.value).trim().replace(',', '.'));
  var lng = parseFloat(String(lngEl.value).trim().replace(',', '.'));
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showToast('⚠️ Enter valid latitude (−90…90) and longitude (−180…180), decimal degrees.');
    return;
  }
  if (!pinMap) {
    showToast('⚠️ Open the map first');
    return;
  }
  pinMap.setView([lat, lng], Math.max(pinMap.getZoom(), 12));
  document.getElementById('pinmap-coords').textContent = formatPinMapCoordLine(lat, lng);
  document.getElementById('pinmap-name').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  formPinLat = lat;
  formPinLng = lng;
  lastGpsLat = lat;
  lastGpsLng = lng;
  setTimeout(function() { if (pinMap) pinMap.invalidateSize(); }, 80);
  showToast('✓ Coordinates applied');
}

function attachPinMapTileErrorHandlers() {
  if (!pinMapLayer || !pinSatLayer || pinMapLayer._flTileErrBound) return;
  pinMapLayer._flTileErrBound = true;
  function bump() {
    _pinMapTileErrorCount++;
    refreshPinMapFallbackBanner();
  }
  pinMapLayer.on('tileerror', bump);
  pinSatLayer.on('tileerror', bump);
}

function makeMarkerIcon(color) {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">'
    + '<filter id="ms"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.3"/></filter>'
    + '<path d="M13 2C7.5 2 3 6.5 3 12c0 8 10 20 10 20s10-12 10-20C23 6.5 18.5 2 13 2z" fill="' + color + '" stroke="white" stroke-width="1.8" filter="url(#ms)"/>'
    + '<circle cx="13" cy="12" r="4.5" fill="white" opacity="0.92"/>'
    + '</svg>';
  return L.divIcon({ html:svg, iconSize:[26,34], iconAnchor:[13,34], popupAnchor:[0,-34], className:'' });
}

function openPinDrop() {
  _pinMapTileErrorCount = 0;
  var overlay = document.getElementById('pinmap-overlay');
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  var mLat = document.getElementById('pinmap-manual-lat');
  var mLng = document.getElementById('pinmap-manual-lng');
  if (mLat && mLng) {
    var pLat = formPinLat != null ? formPinLat : lastGpsLat;
    var pLng = formPinLng != null ? formPinLng : lastGpsLng;
    mLat.value = pLat != null ? String(pLat) : '';
    mLng.value = pLng != null ? String(pLng) : '';
  }

  if (!pinMap) {
    // Default centre: UK midpoint, or last known location
    var startLat = formPinLat || lastGpsLat || 52.5;
    var startLng = formPinLng || lastGpsLng || -1.5;

    pinMap = L.map('pin-map-div', { zoomControl:true, attributionControl:false })
      .setView([startLat, startLng], 14);

    pinMapLayer = L.tileLayer(TILE_OS_STD, { maxZoom:20 }).addTo(pinMap);
    pinSatLayer = L.tileLayer(TILE_SAT,   { maxZoom:20 });
    attachPinMapTileErrorHandlers();

    pinMap.on('move', function() {
      var c = pinMap.getCenter();
      document.getElementById('pinmap-coords').textContent = formatPinMapCoordLine(c.lat, c.lng);
      document.getElementById('pinmap-name').textContent = 'Locating…';
      clearTimeout(pinNominatimTimer);
    });

    pinMap.on('moveend', function() {
      var c = pinMap.getCenter();
      clearTimeout(pinNominatimTimer);
      pinNominatimTimer = setTimeout(function() {
        nominatimFetch('https://nominatim.openstreetmap.org/reverse?lat='+c.lat+'&lon='+c.lng+'&format=json')
          .then(function(r){ return r.json(); })
          .then(function(d) {
            var name = diaryReverseGeocodeLabel(d, c.lat.toFixed(4), c.lng.toFixed(4));
            document.getElementById('pinmap-name').textContent = name;
          }).catch(function() {
            var c2 = pinMap.getCenter();
            document.getElementById('pinmap-name').textContent = c2.lat.toFixed(4)+', '+c2.lng.toFixed(4);
          });
      }, 600); // debounce 600ms
      var _h = document.getElementById('pinmap-hint'); if(_h){ _h.style.opacity='0'; setTimeout(function(){ _h.style.display='none'; }, 300); }
    });
  } else {
    // Re-centre on last pin or current location
    var startLat = formPinLat || lastGpsLat || 52.5;
    var startLng = formPinLng || lastGpsLng || -1.5;
    pinMap.setView([startLat, startLng], 14);
    // Reset hint — remove inline style so CSS controls it
    var hint = document.getElementById('pinmap-hint');
    if (hint) { hint.style.display = ''; hint.style.opacity = ''; }
  }

  setTimeout(function(){ pinMap.invalidateSize(); }, 80);
  refreshPinMapFallbackBanner();
}

function closePinDrop() {
  document.getElementById('pinmap-overlay').style.display = 'none';
  document.body.style.overflow = '';
  var s = document.getElementById('pinmap-search');
  var r = document.getElementById('pinmap-search-results');
  if (s) s.value = '';
  if (r) r.style.display = 'none';
}

function setPinLayer(type) {
  if (!pinMap) return;
  if (type === 'sat') {
    pinMap.removeLayer(pinMapLayer); pinSatLayer.addTo(pinMap);
    document.getElementById('plt-map').className = 'lt-b off';
    document.getElementById('plt-sat').className = 'lt-b on';
  } else {
    pinMap.removeLayer(pinSatLayer); pinMapLayer.addTo(pinMap);
    document.getElementById('plt-map').className = 'lt-b on';
    document.getElementById('plt-sat').className = 'lt-b off';
  }
}

function confirmPinDrop() {
  var c = pinMap.getCenter();
  formPinLat = c.lat; formPinLng = c.lng;
  lastGpsLat = c.lat; lastGpsLng = c.lng;
  var name = document.getElementById('pinmap-name').textContent;
  if (name === 'Locating…') name = c.lat.toFixed(4) + ', ' + c.lng.toFixed(4);
  document.getElementById('f-location').value = name;
  showPinnedStrip(name, c.lat, c.lng);
  closePinDrop();
}

function showPinnedStrip(name, lat, lng) {
  var strip = document.getElementById('loc-pinned-strip');
  document.getElementById('loc-pinned-name').textContent = name;
  document.getElementById('loc-pinned-coords').textContent =
    Math.abs(lat).toFixed(4) + '°' + (lat>=0?'N':'S') +
    ' · ' + Math.abs(lng).toFixed(4) + '°' + (lng>=0?'E':'W');
  strip.style.display = 'flex';
}

function clearPinnedLocation() {
  formPinLat = null; formPinLng = null;
  lastGpsLat = null; lastGpsLng = null;
  var strip = document.getElementById('loc-pinned-strip');
  if (strip) strip.style.display = 'none';
}

// ── CULL MAP ──────────────────────────────────────────────────
var cullMap = null, cullMapLayer = null, cullSatLayer = null;
var cullMarkers = [];
var cullFilter = 'all';

function initCullMap() {
  if (cullMap) return;
  var container = document.getElementById('cull-map-div');
  if (!container) return;

  // Set container height
  container.style.height = '300px';

  cullMap = L.map('cull-map-div', { zoomControl:true, attributionControl:false })
    .setView([54.0, -2.0], 6); // UK overview

  cullMapLayer = L.tileLayer(TILE_OS_STD, { maxZoom:20 }).addTo(cullMap);
  cullSatLayer = L.tileLayer(TILE_SAT,   { maxZoom:20 });
}

function setCullLayer(type) {
  if (!cullMap) return;
  if (type === 'sat') {
    cullMap.removeLayer(cullMapLayer); cullSatLayer.addTo(cullMap);
    document.getElementById('clt-map').className = 'lt-b off';
    document.getElementById('clt-sat').className = 'lt-b on';
  } else {
    cullMap.removeLayer(cullSatLayer); cullMapLayer.addTo(cullMap);
    document.getElementById('clt-map').className = 'lt-b on';
    document.getElementById('clt-sat').className = 'lt-b off';
  }
}

function filterCullMap(filter, el) {
  cullFilter = filter;
  document.querySelectorAll('.cmf-chip').forEach(function(c){ c.classList.remove('on'); });
  el.classList.add('on');
  renderCullMapPins();
  // Rebuild all stats below with same species filter
  buildStats(filter === 'all' ? null : filter);
}

function renderCullMapPins() {
  if (!cullMap) return;
  // Remove existing markers
  cullMarkers.forEach(function(m){ cullMap.removeLayer(m); });
  cullMarkers = [];

  var entries = allEntries.filter(function(e) {
    return e.lat && e.lng && (cullFilter === 'all' || e.species === cullFilter);
  });

  var noGps = allEntries.filter(function(e){ return !e.lat || !e.lng; }).length;
  var spSet = new Set(allEntries.filter(function(e){ return e.lat&&e.lng; }).map(function(e){ return e.species; }));

  document.getElementById('cms-pinned').textContent = entries.length;
  document.getElementById('cms-nogps').textContent = noGps;
  document.getElementById('cms-species').textContent = spSet.size;

  // Show/hide empty state overlay (never destroy the map div)
  var emptyEl = document.getElementById('cull-map-empty-state');
  var mapDiv  = document.getElementById('cull-map-div');
  if (!emptyEl) {
    // Create overlay on first use
    emptyEl = document.createElement('div');
    emptyEl.id = 'cull-map-empty-state';
    emptyEl.className = 'cull-map-empty';
    emptyEl.style.cssText = 'position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;align-items:center;justify-content:center;background:white;';
    emptyEl.innerHTML = '<div class="cull-map-empty-icon" aria-hidden="true">' + SVG_CULL_MAP_EMPTY_PIN + '</div>' +
      '<div class="cull-map-empty-t">No mapped locations yet</div>' +
      '<div class="cull-map-empty-s">Use the <strong>Pin</strong> or <strong>GPS</strong> button when logging entries to build your location history.</div>';
    document.getElementById('cull-map-container').appendChild(emptyEl);
  } else {
    var _cw = emptyEl.querySelector('.cull-map-empty-icon');
    if (!_cw || !_cw.querySelector('svg')) {
      emptyEl.innerHTML = '<div class="cull-map-empty-icon" aria-hidden="true">' + SVG_CULL_MAP_EMPTY_PIN + '</div>' +
        '<div class="cull-map-empty-t">No mapped locations yet</div>' +
        '<div class="cull-map-empty-s">Use the <strong>Pin</strong> or <strong>GPS</strong> button when logging entries to build your location history.</div>';
    }
  }

  if (entries.length === 0) {
    emptyEl.style.display = 'flex';
    document.getElementById('cull-map-stats').style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  document.getElementById('cull-map-stats').style.display = 'flex';

  var bounds = [];
  entries.forEach(function(e) {
    var clr = SP_COLORS[e.species] || '#5a7a30';
    var sex = e.sex === 'm' ? '&#9794;' : '&#9792;';
    var popup = '<div style="font-size:13px;font-weight:700;color:#3d2b1f;">' + esc(e.species) + ' ' + sex + '</div>'
      + '<div style="font-size:11px;color:#a0988a;margin-top:2px;">' + esc(e.date||'') + (e.time ? ' · ' + esc(e.time) : '') + '</div>'
      + (e.weight_gralloch ? '<div style="font-size:11px;color:#3d2b1f;margin-top:4px;">' + esc(String(e.weight_gralloch)) + ' kg gralloch</div>' : '')
      + (e.shot_placement  ? '<div style="font-size:11px;color:#3d2b1f;">' + esc(e.shot_placement) + '</div>' : '')
      + (e.location_name ? '<div style="font-size:10px;color:#a0988a;margin-top:3px;display:flex;align-items:center;gap:4px;">'
        + '<span style="display:inline-flex;width:12px;height:12px;flex-shrink:0;" aria-hidden="true">' + SVG_FL_PIN + '</span>'
        + '<span>' + esc(e.location_name) + '</span></div>' : '');

    var marker = L.marker([e.lat, e.lng], { icon: makeMarkerIcon(clr) })
      .addTo(cullMap)
      .bindPopup(popup);
    cullMarkers.push(marker);
    bounds.push([e.lat, e.lng]);
  });

  if (bounds.length > 0) {
    cullMap.fitBounds(bounds, { padding:[32,32], maxZoom:14 });
  }

  setTimeout(function(){ if(cullMap) cullMap.invalidateSize(); }, 100);
}

// ── Calibre & Distance Stats ─────────────────────────────────
var CAL_COLORS = ['linear-gradient(90deg,#5a7a30,#7adf7a)','linear-gradient(90deg,#c8a84b,#f0c870)',
  'linear-gradient(90deg,#6a1b9a,#ab47bc)','linear-gradient(90deg,#1565c0,#42a5f5)',
  'linear-gradient(90deg,#c62828,#ef5350)','linear-gradient(90deg,#00695c,#26a69a)'];
var SP_COLORS_D = {'Red Deer':'#c8a84b','Roe Deer':'#5a7a30','Fallow':'#f57f17',
  'Muntjac':'#6a1b9a','Sika':'#1565c0','CWD':'#00695c'};

function buildCalibreDistanceStats(entries) {
  // ── Calibre chart ──
  var calCard = document.getElementById('calibre-card');
  var calChart = document.getElementById('calibre-chart');
  var calEntries = entries.filter(function(e){ return e.calibre; });

  if (calEntries.length === 0) {
    calCard.style.display = 'none';
  } else {
    calCard.style.display = 'block';
    // Count by calibre
    var calCount = {}, calDist = {};
    calEntries.forEach(function(e) {
      var c = e.calibre.trim();
      calCount[c] = (calCount[c]||0) + 1;
      if (e.distance_m) {
        if (!calDist[c]) calDist[c] = [];
        calDist[c].push(e.distance_m);
      }
    });
    var sorted = Object.keys(calCount).sort(function(a,b){ return calCount[b]-calCount[a]; });
    var maxCnt = calCount[sorted[0]] || 1;

    var html = '';
    sorted.slice(0,6).forEach(function(cal, i) {
      var cnt = calCount[cal];
      var pct = Math.round(cnt/maxCnt*100);
      var avgDist = calDist[cal] && calDist[cal].length
        ? Math.round(calDist[cal].reduce(function(s,v){return s+v;},0)/calDist[cal].length)
        : null;
      html += '<div class="cal-row">'
        + '<div class="cal-name">' + esc(cal) + '</div>'
        + '<div class="cal-bar-wrap"><div class="cal-bar" style="width:'+pct+'%;background:'+CAL_COLORS[i%CAL_COLORS.length]+';"></div></div>'
        + '<div class="cal-cnt">' + cnt + '</div>'
        + '<div class="cal-avg-lbl">' + (avgDist ? avgDist+'m' : '–') + '</div>'
        + '</div>';
    });
    calChart.innerHTML = html;
  }

  // ── Distance chart ──
  var distCard = document.getElementById('distance-card');
  var distChart = document.getElementById('distance-chart');
  var distEntries = entries.filter(function(e){ return e.distance_m && e.distance_m > 0; });

  if (distEntries.length === 0) {
    distCard.style.display = 'none';
  } else {
    distCard.style.display = 'block';

    // Overall average
    var totalDist = distEntries.reduce(function(s,e){ return s+e.distance_m; }, 0);
    var avgDist = Math.round(totalDist / distEntries.length);

    // Per species averages
    var spDist = {};
    distEntries.forEach(function(e) {
      if (!spDist[e.species]) spDist[e.species] = [];
      spDist[e.species].push(e.distance_m);
    });
    var spAvgs = Object.keys(spDist).map(function(sp) {
      var vals = spDist[sp];
      return { sp:sp, avg: Math.round(vals.reduce(function(s,v){return s+v;},0)/vals.length) };
    }).sort(function(a,b){ return b.avg - a.avg; });
    var maxAvg = spAvgs.length ? spAvgs[0].avg : 1;

    // Range bands
    var bands = [
      { label:'0 – 50m',    min:0,   max:50,  color:'var(--moss)' },
      { label:'51 – 100m',  min:51,  max:100, color:'var(--gold)' },
      { label:'101 – 150m', min:101, max:150, color:'#f57f17' },
      { label:'150m+',      min:151, max:9999,color:'#c62828' },
    ];
    var bandCounts = bands.map(function(b) {
      return distEntries.filter(function(e){ return e.distance_m>=b.min && e.distance_m<=b.max; }).length;
    });
    var totalBand = distEntries.length;

    var html = '<div class="dist-avg-box">'
      + '<div><div class="dist-avg-val">' + avgDist + '</div><div class="dist-avg-unit">metres avg</div></div>'
      + '<div><div class="dist-avg-lbl">Overall average</div>'
      + '<div class="dist-avg-sub">Based on ' + distEntries.length + ' entr' + (distEntries.length===1?'y':'ies') + ' with<br>distance recorded</div></div>'
      + '</div>';

    if (spAvgs.length > 1) {
      html += '<div class="scard-sub-t">By species</div>';
      spAvgs.forEach(function(s) {
        var clr = SP_COLORS_D[s.sp] || '#5a7a30';
        var pct = Math.round(s.avg/maxAvg*100);
        html += '<div class="dist-sp-row">'
          + '<div class="dist-sp-dot" style="background:'+clr+';"></div>'
          + '<div class="dist-sp-name">'+s.sp+'</div>'
          + '<div class="dist-bar-wrap"><div class="dist-bar" style="width:'+pct+'%;background:'+clr+';"></div></div>'
          + '<div class="dist-val">'+s.avg+'m</div>'
          + '</div>';
      });
    }

    html += '<div class="scard-sub-t" style="margin-top:14px;">Distance bands</div>'
      + '<div class="range-grid">';
    bands.forEach(function(b, i) {
      var cnt = bandCounts[i];
      var pct = totalBand ? Math.round(cnt/totalBand*100) : 0;
      html += '<div class="range-cell">'
        + '<div class="range-band">'+b.label+'</div>'
        + '<div class="range-cnt">'+cnt+'</div>'
        + '<div class="range-pct">'+pct+'% of culls</div>'
        + '<div class="range-bar"><div class="range-bar-fill" style="width:'+pct+'%;background:'+b.color+';"></div></div>'
        + '</div>';
    });
    html += '</div>';

    distChart.innerHTML = html;
  }
}


// ── Age Class Breakdown ───────────────────────────────────────
var AGE_CLASSES = ['Calf / Kid', 'Yearling', '2–4 years', '5–8 years', '9+ years'];
var AGE_COLORS  = ['#5a9a3a',   '#5a7a30',  '#c8a84b',   '#f57f17',   '#c62828'];
var AGE_GROUPS  = { 'Juvenile': ['Calf / Kid','Yearling'], 'Adult': ['2–4 years'], 'Mature': ['5–8 years','9+ years'] };

function buildAgeStats(entries) {
  var card  = document.getElementById('age-card');
  var chart = document.getElementById('age-chart');
  var aged  = entries.filter(function(e){ return e.age_class; });

  if (aged.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  // Overall counts
  var counts = {};
  AGE_CLASSES.forEach(function(a){ counts[a] = 0; });
  aged.forEach(function(e){ if (counts[e.age_class] !== undefined) counts[e.age_class]++; });
  var total = aged.length;
  var maxCnt = Math.max.apply(null, AGE_CLASSES.map(function(a){ return counts[a]; }).concat([1]));

  // Overall bars
  var html = '';
  AGE_CLASSES.forEach(function(ac, i) {
    var cnt = counts[ac];
    var pct = total ? Math.round(cnt/total*100) : 0;
    var barPct = Math.round(cnt/maxCnt*100);
    html += '<div class="age-row">'
      + '<div class="age-lbl">' + ac + '</div>'
      + '<div class="age-bar-wrap"><div class="age-bar" style="width:'+barPct+'%;background:'+AGE_COLORS[i]+';"></div></div>'
      + '<div class="age-cnt">' + cnt + '</div>'
      + '<div class="age-pct">' + (cnt ? pct+'%' : '–') + '</div>'
      + '</div>';
  });

  // Summary pills
  var notRecorded = entries.length - aged.length;
  html += '<div class="age-summary">';
  Object.keys(AGE_GROUPS).forEach(function(grp) {
    var grpCnt = AGE_GROUPS[grp].reduce(function(s,a){ return s+(counts[a]||0); }, 0);
    var grpPct = total ? Math.round(grpCnt/total*100) : 0;
    var dotClr = grp==='Juvenile' ? '#7adf7a' : grp==='Adult' ? '#c8a84b' : '#f57f17';
    html += '<div class="age-pill">'
      + '<div class="age-pill-dot" style="background:'+dotClr+';"></div>'
      + '<div class="age-pill-txt">'+grp+'</div>'
      + '<div class="age-pill-cnt">'+grpCnt+' · '+grpPct+'%</div>'
      + '</div>';
  });
  if (notRecorded > 0) {
    html += '<div class="age-pill">'
      + '<div class="age-pill-dot" style="background:#ccc;"></div>'
      + '<div class="age-pill-txt">Not recorded</div>'
      + '<div class="age-pill-cnt">'+notRecorded+'</div>'
      + '</div>';
  }
  html += '</div>';

  // Per-species breakdown
  var spSeen = {};
  aged.forEach(function(e){ spSeen[e.species] = true; });
  var species = Object.keys(spSeen);

  if (species.length > 1) {
    html += '<div class="scard-sub-t" style="margin-top:14px;">By species</div>';
    species.forEach(function(sp) {
      var spEntries = aged.filter(function(e){ return e.species === sp; });
      var spCounts = {};
      AGE_CLASSES.forEach(function(a){ spCounts[a] = 0; });
      spEntries.forEach(function(e){ if (spCounts[e.age_class] !== undefined) spCounts[e.age_class]++; });
      var spMax = Math.max.apply(null, AGE_CLASSES.map(function(a){ return spCounts[a]; }).concat([1]));
      var clr = SP_COLORS_D[sp] || '#5a7a30';

      html += '<div class="age-sp-section">';
      html += '<div class="age-sp-hdr"><div class="age-sp-dot" style="background:'+clr+';"></div><div class="age-sp-nm">'+sp+'</div></div>';
      AGE_CLASSES.forEach(function(ac, i) {
        var cnt = spCounts[ac];
        if (!cnt) return;
        var barPct = Math.round(cnt/spMax*100);
        html += '<div class="age-mini-row">'
          + '<div class="age-mini-lbl">'+ac+'</div>'
          + '<div class="age-mini-bw"><div class="age-mini-bf" style="width:'+barPct+'%;background:'+AGE_COLORS[i]+';"></div></div>'
          + '<div class="age-mini-cnt">'+cnt+'</div>'
          + '</div>';
      });
      html += '</div>';
    });
  }

  chart.innerHTML = html;
}


// ══════════════════════════════════════════════════════════════
// OFFLINE ENTRY QUEUE
// ══════════════════════════════════════════════════════════════
var OFFLINE_KEY = 'fl_offline_queue';
var OFFLINE_DB_NAME = 'firstlight-offline';
var OFFLINE_DB_STORE = 'queue_photos';

function openOfflineDb() {
  return new Promise(function(resolve, reject) {
    if (!('indexedDB' in window)) return resolve(null);
    var req = indexedDB.open(OFFLINE_DB_NAME, 1);
    req.onupgradeneeded = function(ev) {
      var db = ev.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_DB_STORE)) {
        db.createObjectStore(OFFLINE_DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error || new Error('IndexedDB unavailable')); };
  });
}

function dataUrlToBlob(dataUrl) {
  var arr = (dataUrl || '').split(',');
  var mimeMatch = arr[0] ? arr[0].match(/:(.*?);/) : null;
  if (!mimeMatch || !arr[1]) throw new Error('Malformed photo data URL');
  var mime = mimeMatch[1];
  var bstr = atob(arr[1]);
  var u8arr = new Uint8Array(bstr.length);
  for (var i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}

function saveOfflinePhotoBlob(photoId, blob) {
  return openOfflineDb().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_DB_STORE, 'readwrite');
      tx.objectStore(OFFLINE_DB_STORE).put({ id: photoId, blob: blob, createdAt: Date.now() });
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { reject(tx.error || new Error('Failed to save offline photo')); };
    });
  });
}

function getOfflinePhotoBlob(photoId) {
  return openOfflineDb().then(function(db) {
    if (!db) return null;
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_DB_STORE, 'readonly');
      var req = tx.objectStore(OFFLINE_DB_STORE).get(photoId);
      req.onsuccess = function() { resolve(req.result ? req.result.blob : null); };
      req.onerror = function() { reject(req.error || new Error('Failed to read offline photo')); };
    });
  });
}

function deleteOfflinePhotoBlob(photoId) {
  return openOfflineDb().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(OFFLINE_DB_STORE, 'readwrite');
      tx.objectStore(OFFLINE_DB_STORE).delete(photoId);
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { reject(tx.error || new Error('Failed to delete offline photo')); };
    });
  });
}

function getOfflineQueue() {
  try {
    var raw = localStorage.getItem(OFFLINE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

/** Remove photo payloads from queue entries for smaller JSON (blobs stay in IndexedDB until deleted). */
function stripOfflineQueuePhotos(entries) {
  return entries.map(function(entry) {
    var copy = Object.assign({}, entry);
    var changed = false;
    if (copy._photoDataUrl) {
      delete copy._photoDataUrl;
      changed = true;
    }
    if (copy._photoBlobId) {
      var bid = copy._photoBlobId;
      delete copy._photoBlobId;
      changed = true;
      deleteOfflinePhotoBlob(bid).catch(function() {});
    }
    if (changed) copy._photoStripped = true;
    return copy;
  });
}

/**
 * Persist offline queue to localStorage. On quota errors: strip photos, then drop oldest entries, then try [].
 * Mutates `queue` to match whatever was successfully written.
 * @returns {{ ok: boolean, clearedAll?: boolean }}
 */
function saveOfflineQueue(queue) {
  function writeAndSync(arr) {
    try {
      localStorage.setItem(OFFLINE_KEY, JSON.stringify(arr));
      queue.splice(0, queue.length);
      arr.forEach(function(x) { queue.push(x); });
      return true;
    } catch (err) {
      return false;
    }
  }

  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
    return { ok: true };
  } catch (e) { /* quota or private mode */ }

  var stripped = stripOfflineQueuePhotos(queue.slice());
  if (writeAndSync(stripped)) {
    showToast('⚠️ Storage full — photos removed from offline queue, entries saved');
    return { ok: true };
  }

  var slim = stripped.slice();
  var origLen = slim.length;
  while (slim.length > 0) {
    slim.shift();
    if (writeAndSync(slim)) {
      var dropped = origLen - slim.length;
      showToast('⚠️ Storage full — removed ' + dropped + ' oldest queued entr' + (dropped === 1 ? 'y' : 'ies') + ' to save the rest');
      return { ok: true };
    }
  }

  if (writeAndSync([])) {
    showToast('⚠️ Storage full — offline queue was cleared. Re-enter entries or free browser storage.');
    return { ok: true, clearedAll: true };
  }

  showToast('⚠️ Storage full — offline queue could not be saved');
  return { ok: false };
}

async function queueOfflineEntry(entry) {
  var queue = getOfflineQueue();
  entry._queuedAt = new Date().toISOString();
  entry._id = Date.now() + '-' + Math.random().toString(36).slice(2,7);
  // Keep queue lightweight: store photo blobs in IndexedDB, not localStorage JSON.
  if (entry._photoDataUrl) {
    try {
      var photoId = 'photo-' + entry._id;
      var blob = dataUrlToBlob(entry._photoDataUrl);
      var saved = await saveOfflinePhotoBlob(photoId, blob);
      if (saved) {
        entry._photoBlobId = photoId;
        delete entry._photoDataUrl;
      }
    } catch(e) {
      // Fallback to legacy inline photo data if IndexedDB conversion/storage fails.
    }
  }
  queue.push(entry);
  var persist = saveOfflineQueue(queue);
  if (!persist.ok) {
    queue.pop();
    updateOfflineBadge();
    renderList();
    showToast('⚠️ Could not save offline — storage full. Free space or sync, then try again.');
    return;
  }
  if (persist.clearedAll) {
    updateOfflineBadge();
    renderList();
    return;
  }
  updateOfflineBadge();
  showToast('📶 Saved offline · will sync when connected');
  flHapticSuccess();
  go('v-list');
  renderList();
}

function updateOfflineBadge() {
  var queue = getOfflineQueue();
  var cnt = queue.length;
  var badge = document.getElementById('offline-badge');
  var banner = document.getElementById('offline-banner');
  var bannerT = document.getElementById('offline-banner-t');
  var bannerS = document.getElementById('offline-banner-s');

  if (badge) {
    badge.textContent = cnt;
    badge.style.display = cnt > 0 ? 'block' : 'none';
  }
  if (banner && bannerT) {
    if (cnt > 0) {
      bannerT.textContent = cnt + ' entr' + (cnt===1?'y':'ies') + ' queued offline';
      // Estimate storage used
      var queueStr = localStorage.getItem(OFFLINE_KEY) || '';
      var kb = Math.round(queueStr.length / 1024);
      var hasPhotos = queue.some(function(e){ return e._photoDataUrl || e._photoBlobId; });
      var storageNote = kb > 0 ? ' · ~' + kb + 'KB used' : '';
      var photoNote = hasPhotos ? ' · photos queued' : '';
      if (bannerS) bannerS.textContent = 'Will sync when connection returns' + storageNote + photoNote;
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
    }
  }
}

async function syncOfflineQueue() {
  if (!navigator.onLine) { showToast('⚠️ Still offline — try again when connected'); return; }
  if (!sb || !currentUser) { showToast('⚠️ Please sign in first'); return; }

  var queue = getOfflineQueue();
  if (queue.length === 0) { showToast('✅ Nothing to sync'); return; }

  showToast('Syncing ' + queue.length + ' entr' + (queue.length === 1 ? 'y' : 'ies') + '…');

  var synced = 0, failed = 0, photosStripped = 0;
  var remaining = [];

  for (var i = 0; i < queue.length; i++) {
    var entry = queue[i];
    try {
      var payload = {
        user_id:         currentUser.id,
        species:         entry.species,
        sex:             entry.sex,
        date:            entry.date,
        time:            entry.time,
        location_name:   entry.location_name || null,
        lat:             entry.lat || null,
        lng:             entry.lng || null,
        weight_gralloch: entry.weight_gralloch || null,
        weight_clean:    entry.weight_clean    || null,
        weight_larder:   entry.weight_larder   || null,
        calibre:         entry.calibre         || null,
        distance_m:      entry.distance_m      || null,
        shot_placement:  entry.shot_placement  || null,
        age_class:       entry.age_class       || null,
        notes:           entry.notes           || null,
        shooter:         entry.shooter          || 'Self',
        ground:          entry.ground           || null,
        destination:     entry.destination      || null,
      };

      // Upload photo if queued (IndexedDB blob preferred, with dataURL fallback).
      if (entry._photoBlobId || entry._photoDataUrl) {
        try {
          var blob = null;
          if (entry._photoBlobId) {
            blob = await getOfflinePhotoBlob(entry._photoBlobId);
          }
          if (!blob && entry._photoDataUrl) {
            blob = dataUrlToBlob(entry._photoDataUrl);
          }
          if (!blob) throw new Error('No offline photo blob found');
          var file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
          var path = currentUser.id + '/' + Date.now() + '.jpg';
          var upload = await sb.storage.from('cull-photos').upload(path, file, { upsert: true, contentType: 'image/jpeg' });
          if (!upload.error) {
            payload.photo_url = path;
            if (entry._photoBlobId) {
              try { await deleteOfflinePhotoBlob(entry._photoBlobId); } catch(cleanErr) {}
            }
          }
        } catch(photoErr) { console.warn('Photo sync failed:', photoErr); }
      } else if (entry._existingPhotoUrl) {
        var ex = entry._existingPhotoUrl;
        var npath = cullPhotoStoragePath(ex);
        payload.photo_url = npath || ex;
      }

      var result = await sb.from('cull_entries').insert(payload).select('id');
      if (result.error) throw result.error;
      synced++;
      if (entry._photoStripped) photosStripped++;

      if (payload.lat && payload.lng && payload.date && result.data && result.data[0]) {
        attachWeatherToEntry(result.data[0].id, payload.date, payload.time, payload.lat, payload.lng);
      }
    } catch(e) {
      console.warn('Sync failed for entry:', e);
      failed++;
      remaining.push(entry);
    }
  }

  var persistRes = saveOfflineQueue(remaining);
  if (!persistRes.ok) {
    showToast('⚠️ Could not save sync state to device — free storage or try again (queue may retry after refresh)');
  }
  updateOfflineBadge();
  await loadEntries();

  if (failed === 0) {
    var msg = '✅ Synced ' + synced + ' entr' + (synced===1?'y':'ies');
    if (photosStripped > 0) {
      msg += ' · ' + photosStripped + ' without photo' + (photosStripped===1?'':'s') + ' (removed to save storage)';
    }
    showToast(msg, photosStripped > 0 ? 5000 : 2500);
    if (synced > 0) flHapticSuccess();
  } else {
    showToast('⚠️ Synced ' + synced + ', failed ' + failed);
  }
}

// Auto-sync when connection returns
window.addEventListener('online', function() {
  var queue = getOfflineQueue();
  if (queue.length > 0 && sb && currentUser) {
    setTimeout(syncOfflineQueue, 1500); // small delay to let connection stabilise
  }
  updateOfflineBadge();
  refreshPinMapFallbackBanner();
});

window.addEventListener('offline', function() {
  updateOfflineBadge();
  refreshPinMapFallbackBanner();
});

// Call on sign-in to restore badge state


// ── Shooter Stats ─────────────────────────────────────────────
function buildShooterStats(entries) {
  var card  = document.getElementById('shooter-card');
  var chart = document.getElementById('shooter-chart');

  // Count by shooter — normalise blank/undefined to 'Self'
  var counts = {};
  entries.forEach(function(e) {
    var s = (e.shooter && e.shooter.trim()) ? e.shooter.trim() : 'Self';
    counts[s] = (counts[s]||0) + 1;
  });

  var shooters = Object.keys(counts);

  // Hide card if everyone is Self (no point showing it)
  if (shooters.length <= 1 && shooters[0] === 'Self') {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  // Sort: Self first, then by count desc
  shooters.sort(function(a,b) {
    if (a === 'Self') return -1;
    if (b === 'Self') return 1;
    return counts[b] - counts[a];
  });

  var maxCnt = Math.max.apply(null, shooters.map(function(s){ return counts[s]; }));

  var html = '';
  shooters.forEach(function(s, i) {
    var cnt = counts[s];
    var pct = Math.round(cnt/maxCnt*100);
    var barClr = s === 'Self'
      ? 'linear-gradient(90deg,#5a7a30,#7adf7a)'
      : 'linear-gradient(90deg,#c8a84b,#f0c870)';
    html += '<div class="bar-row">'
      + '<div class="bar-lbl">' + esc(s) + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+barClr+';"></div></div>'
      + '<div class="bar-cnt">'+cnt+'</div>'
      + '</div>';
  });

  chart.innerHTML = html;
}

function buildDestinationStats(entries) {
  var card  = document.getElementById('destination-card');
  var chart = document.getElementById('destination-chart');

  var counts = {};
  entries.forEach(function(e) {
    if (e.destination) counts[e.destination] = (counts[e.destination]||0) + 1;
  });

  var dests = Object.keys(counts);

  // Hide if no entries have a destination set
  if (dests.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  // Sort by count descending
  dests.sort(function(a,b) { return counts[b] - counts[a]; });

  var maxCnt = Math.max.apply(null, dests.map(function(d){ return counts[d]; }));
  var destColors = {
    'Self / personal use': 'linear-gradient(90deg,#5a7a30,#7adf7a)',
    'Game dealer': 'linear-gradient(90deg,#c8a84b,#f0c870)',
    'Friend / family': 'linear-gradient(90deg,#1565c0,#42a5f5)',
    'Stalking client': 'linear-gradient(90deg,#6a1b9a,#ab47bc)',
    'Estate / landowner': 'linear-gradient(90deg,#00695c,#4db6ac)',
    'Left on hill': 'linear-gradient(90deg,#888,#aaa)',
    'Condemned': 'linear-gradient(90deg,#c62828,#ef5350)'
  };

  var html = '';
  dests.forEach(function(d) {
    var cnt = counts[d];
    var pct = Math.round(cnt/maxCnt*100);
    var barClr = destColors[d] || 'linear-gradient(90deg,#5a7a30,#7adf7a)';
    html += '<div class="bar-row">'
      + '<div class="bar-lbl">' + esc(d) + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+barClr+';"></div></div>'
      + '<div class="bar-cnt">'+cnt+'</div>'
      + '</div>';
  });

  chart.innerHTML = html;
}


// ══════════════════════════════════════════════════════════════
// GROUNDS SYSTEM
// ══════════════════════════════════════════════════════════════
var savedGrounds = []; // loaded from Supabase
var targetMode = 'season'; // 'season' or 'ground'
var groundTargets = {}; // { 'Farm A': { 'Roe Deer-m': 3, 'Roe Deer-f': 2 }, '__unassigned__': {...} }
var planGroundFilter = 'overview'; // 'overview' or a ground name

// ── Grounds CRUD ──────────────────────────────────────────────
async function loadGrounds() {
  if (!sb || !currentUser) return;
  try {
    var r = await sb.from('grounds')
      .select('name')
      .eq('user_id', currentUser.id)
      .order('name', { ascending: true });
    if (r.data) savedGrounds = r.data.map(function(g){ return g.name; });
    populateGroundDropdown();
  } catch(e) { console.warn('loadGrounds error:', e); }
}

async function saveGround(name) {
  if (!name || !sb || !currentUser) return;
  name = name.trim();
  if (!name || savedGrounds.indexOf(name) !== -1) return;
  try {
    await sb.from('grounds').upsert(
      { user_id: currentUser.id, name: name },
      { onConflict: 'user_id,name' }
    );
    if (savedGrounds.indexOf(name) === -1) savedGrounds.push(name);
    savedGrounds.sort();
    populateGroundDropdown();
  } catch(e) { console.warn('saveGround error:', e); }
}

// ── Ground field UI ───────────────────────────────────────────
function populateGroundDropdown() {
  var sel = document.getElementById('f-ground');
  if (!sel) return;
  var current = sel.value;
  sel.innerHTML = '<option value="">Select ground…</option>';
  savedGrounds.forEach(function(g) {
    var opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    sel.appendChild(opt);
  });
  var custom = document.createElement('option');
  custom.value = '__custom__';
  custom.textContent = 'Other / new ground…';
  sel.appendChild(custom);
  // Restore previous value if it exists
  if (current && current !== '__custom__') sel.value = current;
}

function handleGroundSelect(sel) {
  var customInput = document.getElementById('f-ground-custom');
  if (sel.value === '__custom__') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
    customInput.value = '';
  }
}

function getGroundValue() {
  var sel = document.getElementById('f-ground');
  if (sel.value === '__custom__') {
    return document.getElementById('f-ground-custom').value.trim() || null;
  }
  return sel.value || null;
}

function setGroundValue(val) {
  var sel = document.getElementById('f-ground');
  var customInput = document.getElementById('f-ground-custom');
  if (!sel) return;
  // Check if value exists in options
  var found = false;
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === val) { found = true; break; }
  }
  if (found) {
    sel.value = val;
    customInput.style.display = 'none';
  } else if (val) {
    sel.value = '__custom__';
    customInput.style.display = 'block';
    customInput.value = val;
  } else {
    sel.value = '';
    customInput.style.display = 'none';
  }
}

function renderGroundPills() {} // no-op, kept for compatibility
function showGroundPills() {}
function hideGroundPills() {}
function selectGroundPill() {}

// ── Ground Targets ────────────────────────────────────────────
async function loadGroundTargets(season) {
  if (!sb || !currentUser) return;
  try {
    var r = await sb.from('ground_targets')
      .select('ground, species, sex, target')
      .eq('user_id', currentUser.id)
      .eq('season', season);
    groundTargets = {};
    if (r.data) {
      r.data.forEach(function(row) {
        if (!groundTargets[row.ground]) groundTargets[row.ground] = {};
        groundTargets[row.ground][row.species + '-' + row.sex] = row.target;
      });
    }
  } catch(e) { console.warn('loadGroundTargets error:', e); }
}

/** Named permissions exist — season headline can be split across grounds + unassigned. */
function groundLedPlanActive() {
  return savedGrounds && savedGrounds.length > 0;
}

/** Sum every ground bucket (including __unassigned__) into one species/sex map. */
function sumGroundTargetsAgg(gt) {
  var out = {};
  Object.keys(gt || {}).forEach(function(g) {
    var bucket = gt[g];
    if (!bucket) return;
    Object.keys(bucket).forEach(function(k) {
      out[k] = (out[k] || 0) + (parseInt(bucket[k], 10) || 0);
    });
  });
  return out;
}

function summedGroundTargetsAnyPositive(agg) {
  return Object.keys(agg || {}).some(function(k) { return (agg[k] || 0) > 0; });
}

/** Sum targets on named grounds only (excludes __unassigned__). */
function sumNamedGroundsOnlyAgg(gt) {
  var out = {};
  (savedGrounds || []).forEach(function(g) {
    var bucket = (gt || {})[g] || {};
    Object.keys(bucket).forEach(function(k) {
      out[k] = (out[k] || 0) + (parseInt(bucket[k], 10) || 0);
    });
  });
  return out;
}

/**
 * Upsert cull_targets to match aggregated ground totals (headline season plan).
 * Call after By-ground save, or when seeding buffer from season.
 */
async function syncCullTargetsFromGroundTargetsAgg(gtAgg) {
  if (!sb || !currentUser) return;
  var rows = [];
  PLAN_SPECIES.forEach(function(sp) {
    var mKey = sp.name + '-m';
    var fKey = sp.name + '-f';
    var mVal = parseInt(gtAgg[mKey], 10) || 0;
    var fVal = parseInt(gtAgg[fKey], 10) || 0;
    rows.push({ user_id: currentUser.id, season: currentSeason, species: sp.name, sex: 'm', target: mVal });
    rows.push({ user_id: currentUser.id, season: currentSeason, species: sp.name, sex: 'f', target: fVal });
  });
  var r = await sb.from('cull_targets').upsert(rows, { onConflict: 'user_id,season,species,sex' });
  if (r.error) throw r.error;
  cullTargets = {};
  rows.forEach(function(row) { cullTargets[row.species + '-' + row.sex] = row.target; });
}

/** Season sheet steppers: when a ground split exists and has numbers, show that sum; else DB season row. */
function getSeasonSheetDisplayTotals() {
  if (groundLedPlanActive()) {
    var agg = sumGroundTargetsAgg(groundTargets);
    if (summedGroundTargetsAnyPositive(agg)) return agg;
  }
  return cullTargets;
}

/** Current Season total stepper values (used for By-ground preview before save). */
function readSeasonFormTargets() {
  var o = {};
  PLAN_SPECIES.forEach(function(sp) {
    var mEl = document.getElementById('tt-' + sp.key + 'm');
    var fEl = document.getElementById('tt-' + sp.key + 'f');
    o[sp.name + '-m'] = parseInt(mEl && mEl.value, 10) || 0;
    o[sp.name + '-f'] = parseInt(fEl && fEl.value, 10) || 0;
  });
  return o;
}

/** Unassigned row = season form headline minus saved named-ground totals (preview if not saved yet). */
function previewUnassignedFromSeasonForm() {
  var seasonForm = readSeasonFormTargets();
  var named = sumNamedGroundsOnlyAgg(groundTargets);
  var out = {};
  PLAN_SPECIES.forEach(function(sp) {
    ['m', 'f'].forEach(function(sx) {
      var k = sp.name + '-' + sx;
      var head = parseInt(seasonForm[k], 10) || 0;
      var onG = parseInt(named[k], 10) || 0;
      out[k] = Math.max(0, head - onG);
    });
  });
  return out;
}

/** With named grounds: keep Unassigned buffer steppers aligned to Season total minus saved named totals (dirty snapshot + By ground tab). */
function syncUnassignedSteppersFromSeasonFormDom() {
  if (!groundLedPlanActive()) return;
  if (!document.getElementById('gt_u_' + PLAN_SPECIES[0].key + 'm')) return;
  var u = previewUnassignedFromSeasonForm();
  PLAN_SPECIES.forEach(function(sp) {
    var mel = document.getElementById('gt_u_' + sp.key + 'm');
    var fel = document.getElementById('gt_u_' + sp.key + 'f');
    if (mel) mel.value = u[sp.name + '-m'] || 0;
    if (fel) fel.value = u[sp.name + '-f'] || 0;
  });
  updateGroundRollup();
}

function getUnassignedEffectiveTotal() {
  var u = groundLedPlanActive() ? previewUnassignedFromSeasonForm() : (groundTargets['__unassigned__'] || {});
  return Object.keys(u).reduce(function(s, k) { return s + (parseInt(u[k], 10) || 0); }, 0);
}

function hasGroundTargets() {
  return Object.keys(groundTargets).some(function(g) {
    return Object.keys(groundTargets[g]).some(function(k) {
      return groundTargets[g][k] > 0;
    });
  });
}

// ── Targets sheet mode ────────────────────────────────────────
function setTargetMode(mode) {
  targetMode = mode;
  document.getElementById('tmode-season').classList.toggle('on', mode === 'season');
  document.getElementById('tmode-ground').classList.toggle('on', mode === 'ground');
  document.getElementById('tmode-season-body').style.display = mode === 'season' ? 'block' : 'none';
  document.getElementById('tmode-ground-body').style.display = mode === 'ground' ? 'block' : 'none';
  if (mode === 'ground') {
    renderGroundSections();
    refreshSeasonGroundLedHint();
  } else {
    syncSeasonSteppersFromGroundDom();
    refreshTgroundModeHint();
    refreshSeasonGroundLedHint();
    updateSeasonTotalFooter();
  }
}

/** By ground tab: how split relates to headline season plan. */
function refreshTgroundModeHint() {
  var el = document.getElementById('tground-mode-hint');
  if (!el) return;
  if (targetMode !== 'ground') {
    el.setAttribute('hidden', 'hidden');
    el.innerHTML = '';
    return;
  }
  var html = '';
  if (groundLedPlanActive()) {
    html = '<p class="tground-mode-hint-line">Put your targets for <strong>each ground</strong> below. Tap a row to open it.</p>'
      + '<p class="tground-mode-hint-line"><strong>Unassigned</strong> tracks what is left after named grounds — it picks up the <strong>Season total</strong> tab when you switch here (before Save).</p>'
      + '<p class="tground-mode-hint-line">Saving updates <strong>Season total</strong> to match this tab.</p>';
  } else {
    html = '<p class="tground-mode-hint-line">Tap <strong>Add ground</strong> if you shoot on more than one place. Until then, use <strong>Season total</strong> for all your numbers.</p>';
  }
  el.innerHTML = html;
  el.removeAttribute('hidden');
}

function refreshSeasonGroundLedHint() {
  var el = document.getElementById('tseason-led-hint');
  if (!el) return;
  if (targetMode !== 'season' || !groundLedPlanActive()) {
    el.setAttribute('hidden', 'hidden');
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<p class="tseason-led-hint-line"><strong>Season total</strong> and <strong>By ground</strong> use the same figures — full totals here, split by place on the other tab.</p>';
  el.removeAttribute('hidden');
}

function makeSpeciesSteppers(prefix) {
  return PLAN_SPECIES.map(function(sp) {
    var mid = prefix + '_' + sp.key + 'm';
    var fid = prefix + '_' + sp.key + 'f';
    return '<div class="tgrid-row">'
      + '<div class="tgrid-sp"><div class="tgrid-dot" style="background:' + sp.color + ';"></div>' + sp.name + '</div>'
      + '<div class="tstepper"><button type="button" class="tstep-btn" data-fl-action="gt-step" data-gt-id="' + mid + '" data-gt-delta="-1">−</button>'
      + '<input class="tstep-val" id="' + mid + '" type="number" value="0" min="0">'
      + '<button type="button" class="tstep-btn" data-fl-action="gt-step" data-gt-id="' + mid + '" data-gt-delta="1">+</button></div>'
      + '<div class="tstepper"><button type="button" class="tstep-btn" data-fl-action="gt-step" data-gt-id="' + fid + '" data-gt-delta="-1">−</button>'
      + '<input class="tstep-val" id="' + fid + '" type="number" value="0" min="0">'
      + '<button type="button" class="tstep-btn" data-fl-action="gt-step" data-gt-id="' + fid + '" data-gt-delta="1">+</button></div>'
      + '</div>';
  }).join('');
}

function gtStep(id, delta) {
  var el = document.getElementById(id);
  if (el) { el.value = Math.max(0, (parseInt(el.value)||0) + delta); updateGroundRollup(); }
  syncSeasonSteppersFromGroundDom();
}

function getUnassignedStoreTotal() {
  var u = groundTargets['__unassigned__'] || {};
  return Object.keys(u).reduce(function(s, k) { return s + (parseInt(u[k], 10) || 0); }, 0);
}

function renderUnassignedSteppersFromStore() {
  var uSteppers = document.getElementById('tunassigned-steppers');
  if (!uSteppers) return;
  uSteppers.innerHTML = makeSpeciesSteppers('gt_u');
  var uTargets = groundLedPlanActive()
    ? previewUnassignedFromSeasonForm()
    : (groundTargets['__unassigned__'] || {});
  PLAN_SPECIES.forEach(function(sp) {
    var mel = document.getElementById('gt_u_' + sp.key + 'm');
    var fel = document.getElementById('gt_u_' + sp.key + 'f');
    if (mel) mel.value = uTargets[sp.name + '-m'] || 0;
    if (fel) fel.value = uTargets[sp.name + '-f'] || 0;
  });
}

function updateUnassignedBarSummary() {
  var sumEl = document.getElementById('tunassigned-summary');
  if (!sumEl || !document.getElementById('gt_u_' + PLAN_SPECIES[0].key + 'm')) return;
  var parts = [];
  var uTotal = 0;
  PLAN_SPECIES.forEach(function(sp) {
    var mel = document.getElementById('gt_u_' + sp.key + 'm');
    var fel = document.getElementById('gt_u_' + sp.key + 'f');
    if (!mel || !fel) return;
    var m = parseInt(mel.value, 10) || 0;
    var f = parseInt(fel.value, 10) || 0;
    uTotal += m + f;
    if (m + f > 0) parts.push(sp.name.split(' ')[0] + ': ♂' + m + ' ♀' + f);
  });
  sumEl.textContent = uTotal === 0 ? 'None set — tap to add optional targets' : parts.join(' · ');
}

function setUnassignedBufferExpanded(open) {
  var body = document.getElementById('tunassigned-body');
  var chev = document.getElementById('tunassigned-chev');
  var hdr = document.getElementById('tunassigned-hdr');
  if (!body) return;
  body.classList.toggle('open', !!open);
  if (chev) chev.classList.toggle('open', !!open);
  if (hdr) hdr.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleUnassignedBuffer() {
  var body = document.getElementById('tunassigned-body');
  if (!body) return;
  setUnassignedBufferExpanded(!body.classList.contains('open'));
}

function syncUnassignedExpandedFromStore() {
  setUnassignedBufferExpanded(getUnassignedEffectiveTotal() > 0);
}

function renderGroundSections() {
  var container = document.getElementById('tground-sections');
  if (!container) return;

  if (savedGrounds.length === 0) {
    // Update label
  var lbl = document.getElementById('ground-mgmt-lbl');
  if (lbl) lbl.textContent = 'No grounds yet';
  container.innerHTML = '<div style="padding:12px 0 8px;text-align:center;font-size:12px;color:var(--muted);">No grounds yet — add one above.</div>';
  refreshTgroundModeHint();
  renderUnassignedSteppersFromStore();
  syncUnassignedExpandedFromStore();
  updateGroundRollup();
  return;
  }

  // Update ground count label
  var lbl = document.getElementById('ground-mgmt-lbl');
  if (lbl) lbl.textContent = savedGrounds.length + ' ground' + (savedGrounds.length === 1 ? '' : 's');

  var html = '';
  savedGrounds.forEach(function(g, i) {
    var gTargets = groundTargets[g] || {};
    var total = Object.values(gTargets).reduce(function(s,v){ return s+v; }, 0);
    var summary = total > 0
      ? PLAN_SPECIES.filter(function(sp){ return (gTargets[sp.name+'-m']||0)+(gTargets[sp.name+'-f']||0)>0; })
          .map(function(sp){ return sp.name.split(' ')[0]+': ♂'+(gTargets[sp.name+'-m']||0)+' ♀'+(gTargets[sp.name+'-f']||0); })
          .join(' · ')
      : 'No targets set';
    var prefix = 'gt_' + i;
    var dotColor = ['#5a7a30','#c8a84b','#f57f17','#6a1b9a','#1565c0'][i % 5];

    html += '<div class="tground-section">'
      + '<div class="tground-bar">'
      + '<div class="tground-hdr" tabindex="0" role="button" data-fl-action="toggle-ground" data-ground-prefix="' + prefix + '" aria-expanded="false" aria-label="Show targets for ' + esc(g) + '">'
      + '<div class="tground-hdr-l"><div class="tground-dot" style="background:' + dotColor + ';"></div>'
      + '<div><div class="tground-name">' + esc(g) + '</div>'
      + '<div class="tground-summary">' + esc(summary) + '</div></div></div>'
      + '<span class="tground-chev-wrap" aria-hidden="true"><span class="tground-chev" id="' + prefix + '_chev">▾</span></span>'
      + '</div>'
      + '<button type="button" class="tground-del" data-gi="' + i + '" data-fl-action="delete-ground-idx" title="Remove this saved ground">Remove</button>'
      + '</div>'
      + '<div class="tground-body" id="' + prefix + '_body">'
      + '<div class="tgrid-hdr"><div class="tgrid-col">Species</div>'
      + '<div class="tgrid-col tgrid-hdr-col"><span class="tg-sym">♂</span>Stag / Buck</div>'
      + '<div class="tgrid-col tgrid-hdr-col"><span class="tg-sym">♀</span>Hind / Doe</div></div>'
      + makeSpeciesSteppers(prefix)
      + '</div></div>';
  });
  container.innerHTML = html;

  refreshTgroundModeHint();

  // Populate with existing targets
  savedGrounds.forEach(function(g, i) {
    var gTargets = groundTargets[g] || {};
    var prefix = 'gt_' + i;
    PLAN_SPECIES.forEach(function(sp) {
      var mel = document.getElementById(prefix + '_' + sp.key + 'm');
      var fel = document.getElementById(prefix + '_' + sp.key + 'f');
      if (mel) mel.value = gTargets[sp.name+'-m'] || 0;
      if (fel) fel.value = gTargets[sp.name+'-f'] || 0;
    });
  });

  renderUnassignedSteppersFromStore();
  syncUnassignedExpandedFromStore();
  updateGroundRollup();
}

function toggleGroundSection(prefix) {
  var body = document.getElementById(prefix + '_body');
  var chev = document.getElementById(prefix + '_chev');
  if (!body) return;
  var open = body.classList.contains('open');
  body.classList.toggle('open', !open);
  if (chev) chev.classList.toggle('open', !open);
  var hdr = document.querySelector('[data-fl-action="toggle-ground"][data-ground-prefix="' + prefix + '"]');
  if (hdr) hdr.setAttribute('aria-expanded', !open ? 'true' : 'false');
}

function updateGroundRollup() {
  updateUnassignedBarSummary();
  var rollup = document.getElementById('trollup');
  if (!rollup) return;
  var lines = '';
  var grandTotal = 0;
  savedGrounds.forEach(function(g, i) {
    var prefix = 'gt_' + i;
    var total = 0;
    PLAN_SPECIES.forEach(function(sp) {
      var m = parseInt((document.getElementById(prefix+'_'+sp.key+'m')||{}).value||0);
      var f = parseInt((document.getElementById(prefix+'_'+sp.key+'f')||{}).value||0);
      total += m + f;
    });
    grandTotal += total;
    lines += '<div class="trollup-row"><span class="trollup-lbl">' + esc(g) + '</span><span class="trollup-val">' + total + '</span></div>';
  });
  // Unassigned
  var uTotal = 0;
  PLAN_SPECIES.forEach(function(sp) {
    var m = parseInt((document.getElementById('gt_u_'+sp.key+'m')||{}).value||0);
    var f = parseInt((document.getElementById('gt_u_'+sp.key+'f')||{}).value||0);
    uTotal += m + f;
  });
  if (uTotal > 0) {
    grandTotal += uTotal;
    lines += '<div class="trollup-row"><span class="trollup-lbl">Unassigned</span><span class="trollup-val">' + uTotal + '</span></div>';
  }
  rollup.innerHTML = lines
    + '<div class="trollup-total"><span class="trollup-total-lbl">Season total</span><span class="trollup-total-val">' + grandTotal + ' targets</span></div>';
}

// ── Save targets (both modes) ─────────────────────────────────
async function saveGroundTargets() {
  if (!sb || !currentUser) return;
  var rows = [];

  // Per-ground targets
  savedGrounds.forEach(function(g, i) {
    var prefix = 'gt_' + i;
    PLAN_SPECIES.forEach(function(sp) {
      var m = parseInt((document.getElementById(prefix+'_'+sp.key+'m')||{}).value||0);
      var f = parseInt((document.getElementById(prefix+'_'+sp.key+'f')||{}).value||0);
      rows.push({ user_id:currentUser.id, season:currentSeason, ground:g, species:sp.name, sex:'m', target:m });
      rows.push({ user_id:currentUser.id, season:currentSeason, ground:g, species:sp.name, sex:'f', target:f });
    });
  });

  // Unassigned buffer
  PLAN_SPECIES.forEach(function(sp) {
    var m = parseInt((document.getElementById('gt_u_'+sp.key+'m')||{}).value||0);
    var f = parseInt((document.getElementById('gt_u_'+sp.key+'f')||{}).value||0);
    rows.push({ user_id:currentUser.id, season:currentSeason, ground:'__unassigned__', species:sp.name, sex:'m', target:m });
    rows.push({ user_id:currentUser.id, season:currentSeason, ground:'__unassigned__', species:sp.name, sex:'f', target:f });
  });

  var r = await sb.from('ground_targets')
    .upsert(rows, { onConflict: 'user_id,season,ground,species,sex' });
  if (r.error) throw r.error;
  await loadGroundTargets(currentSeason);
  var aggAfter = sumGroundTargetsAgg(groundTargets);
  if (groundLedPlanActive() || summedGroundTargetsAnyPositive(aggAfter)) {
    await syncCullTargetsFromGroundTargetsAgg(aggAfter);
  }
}

// ── Plan card ground filter ───────────────────────────────────
function renderPlanGroundFilter() {
  var bar = document.getElementById('plan-ground-filter');
  if (!bar) return;

  if (!savedGrounds || savedGrounds.length === 0) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  var grounds = savedGrounds.slice();
  var hasUnassigned = groundTargets['__unassigned__'] &&
    Object.values(groundTargets['__unassigned__']).some(function(v){ return v > 0; });

  var chips = [{key:'overview', label:'Overview'}];
  grounds.forEach(function(g) { chips.push({key:g, label:g}); });
  if (hasUnassigned) chips.push({key:'__unassigned__', label:'Unassigned'});

  bar.innerHTML = chips.map(function(c) {
    var on = c.key === planGroundFilter;
    return '<div class="pgf-chip' + (on?' on':'') + '" tabindex="0" role="button" data-fl-action="plan-ground-filter" data-plan-key="' + encodeURIComponent(c.key) + '">' + esc(c.label) + '</div>';
  }).join('');
}

function setPlanGroundFilter(key) {
  planGroundFilter = key;
  renderPlanGroundFilter();
  renderPlanCard(allEntries, currentSeason);
}

// ══════════════════════════════════════════════════════════════
// SYNDICATES (Supabase: syndicates, targets, invites, RPCs)
// ══════════════════════════════════════════════════════════════
var syndicateEditingId = null;
var syndicateAllocMemberId = null;

/** Label shown in syndicate UI — matches account name / email local-part. */
function syndicateDisplayNameFromUser(user) {
  if (!user) return 'Member';
  var meta = user.user_metadata || {};
  var n = (meta.full_name || '').trim();
  if (n) return n;
  var em = user.email || '';
  var at = em.indexOf('@');
  return at > 0 ? em.slice(0, at) : 'Member';
}

/** Backfill syndicate_members.display_name for the signed-in user (after DB migration). */
async function ensureMySyndicateDisplayNames() {
  if (!sb || !currentUser) return;
  var name = syndicateDisplayNameFromUser(currentUser);
  try {
    var r = await sb.from('syndicate_members')
      .update({ display_name: name })
      .eq('user_id', currentUser.id)
      .is('display_name', null);
    if (r.error) return;
  } catch (e) { /* column not migrated yet */ }
}

function syndicateRandomToken() {
  var a = new Uint8Array(24);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, function(b) { return ('0' + b.toString(16)).slice(-2); }).join('');
}

function openSynModal() {
  var ov = document.getElementById('syn-ov');
  if (ov) { ov.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closeSynModal() {
  var ov = document.getElementById('syn-ov');
  if (ov) { ov.classList.remove('open'); document.body.style.overflow = ''; }
  syndicateEditingId = null;
  syndicateAllocMemberId = null;
}

function syndKeyToInputId(key) { return 'syntt-' + key; }

function buildSyndicateStepperGrid(valuesObj, prefix) {
  var p = prefix || 'syntt';
  var rows = '';
  PLAN_SPECIES.forEach(function(sp) {
    var mk = sp.key + 'm';
    var fk = sp.key + 'f';
    var mv = (valuesObj && valuesObj[sp.name + '-m']) || 0;
    var fv = (valuesObj && valuesObj[sp.name + '-f']) || 0;
    rows += '<div class="tgrid-row">'
      + '<div class="tgrid-sp"><div class="tgrid-dot" style="background:' + sp.color + ';"></div>' + esc(sp.name) + '</div>'
      + '<div class="tstepper">'
      + '<button type="button" class="tstep-btn" data-fl-action="synd-tstep" data-step-id="' + p + '-' + mk + '" data-step-delta="-1">−</button>'
      + '<input class="tstep-val" id="' + p + '-' + mk + '" type="number" value="' + mv + '" min="0">'
      + '<button type="button" class="tstep-btn" data-fl-action="synd-tstep" data-step-id="' + p + '-' + mk + '" data-step-delta="1">+</button>'
      + '</div>'
      + '<div class="tstepper">'
      + '<button type="button" class="tstep-btn" data-fl-action="synd-tstep" data-step-id="' + p + '-' + fk + '" data-step-delta="-1">−</button>'
      + '<input class="tstep-val" id="' + p + '-' + fk + '" type="number" value="' + fv + '" min="0">'
      + '<button type="button" class="tstep-btn" data-fl-action="synd-tstep" data-step-id="' + p + '-' + fk + '" data-step-delta="1">+</button>'
      + '</div>'
      + '</div>';
  });
  return '<div class="tgrid-hdr"><div class="tgrid-col">Species</div>'
    + '<div class="tgrid-col tgrid-hdr-col">Stags/Bucks</div>'
    + '<div class="tgrid-col tgrid-hdr-col">Hinds/Does</div></div>' + rows;
}

function syndTstep(stepId, delta) {
  var el = document.getElementById(stepId);
  if (el) el.value = Math.max(0, (parseInt(el.value, 10) || 0) + delta);
}

function readSyndicateSteppers(prefix) {
  var p = prefix || 'syntt';
  var o = {};
  PLAN_SPECIES.forEach(function(sp) {
    var em = document.getElementById(p + '-' + sp.key + 'm');
    var ef = document.getElementById(p + '-' + sp.key + 'f');
    o[sp.name + '-m'] = em ? Math.max(0, parseInt(em.value, 10) || 0) : 0;
    o[sp.name + '-f'] = ef ? Math.max(0, parseInt(ef.value, 10) || 0) : 0;
  });
  return o;
}

async function loadMySyndicateRows() {
  if (!sb || !currentUser) return [];
  var mr = await sb.from('syndicate_members').select('syndicate_id, role').eq('user_id', currentUser.id).eq('status', 'active');
  if (mr.error || !mr.data || !mr.data.length) return [];
  var ids = mr.data.map(function(x) { return x.syndicate_id; });
  if (!ids.length) return [];
  var roles = {};
  mr.data.forEach(function(r) { roles[r.syndicate_id] = r.role; });
  var sr = await sb.from('syndicates').select('*').in('id', ids);
  if (sr.error || !sr.data || !sr.data.length) return [];
  return sr.data.map(function(s) { return { syndicate: s, role: roles[s.id] }; });
}

async function fetchSyndicateSummaryRpc(syndicateId, season) {
  var r = await sb.rpc('syndicate_season_summary', { p_syndicate_id: syndicateId, p_season: season });
  if (!r.error && r.data) return { ok: true, rows: r.data };
  if (r.error && typeof console !== 'undefined' && console.warn) {
    console.warn('syndicate_season_summary RPC failed (deploy scripts/syndicate-summary-rpc.sql):', r.error.message || r.error);
  }
  return { ok: false, error: r.error };
}

/**
 * Used when syndicate_season_summary is missing or errors. Group mode is accurate.
 * Individual mode: syndicate-wide targets need summed allocations — managers can read all rows (RLS);
 * members only see their own rows, so target totals may show 0 until the RPC is deployed.
 */
async function fetchSyndicateSummaryFallback(syndicate, season, isManager) {
  var targets = {};
  var tr = await sb.from('syndicate_targets').select('species, sex, target').eq('syndicate_id', syndicate.id).eq('season', season);
  if (tr.data) tr.data.forEach(function(row) { targets[row.species + '-' + row.sex] = row.target; });
  var ar = await sb.rpc('syndicate_aggregate_actuals_for_user', { p_syndicate_id: syndicate.id, p_season: season });
  var actuals = {};
  if (!ar.error && ar.data) ar.data.forEach(function(row) { actuals[row.species + '-' + row.sex] = parseInt(row.actual_count, 10) || 0; });
  var myr = await sb.rpc('my_syndicate_actuals', { p_syndicate_id: syndicate.id, p_season: season });
  var mine = {};
  if (!myr.error && myr.data) myr.data.forEach(function(row) { mine[row.species + '-' + row.sex] = parseInt(row.actual_count, 10) || 0; });
  var allocMine = {};
  if (syndicate.allocation_mode === 'individual') {
    var al = await sb.from('syndicate_member_allocations').select('species, sex, allocation')
      .eq('syndicate_id', syndicate.id).eq('season', season).eq('user_id', currentUser.id);
    if (al.data) al.data.forEach(function(row) { allocMine[row.species + '-' + row.sex] = row.allocation; });
  }
  var allocSum = {};
  if (syndicate.allocation_mode === 'individual' && isManager) {
    var alAll = await sb.from('syndicate_member_allocations').select('species, sex, allocation')
      .eq('syndicate_id', syndicate.id).eq('season', season);
    if (alAll.data) {
      alAll.data.forEach(function(row) {
        var kk = row.species + '-' + row.sex;
        allocSum[kk] = (allocSum[kk] || 0) + (parseInt(row.allocation, 10) || 0);
      });
    }
  }
  var keys = {};
  Object.keys(targets).forEach(function(k) { keys[k] = 1; });
  Object.keys(actuals).forEach(function(k) { keys[k] = 1; });
  Object.keys(mine).forEach(function(k) { keys[k] = 1; });
  Object.keys(allocMine).forEach(function(k) { keys[k] = 1; });
  Object.keys(allocSum).forEach(function(k) { keys[k] = 1; });
  var rows = [];
  Object.keys(keys).forEach(function(k) {
    var parts = k.split('-');
    var sx = parts.pop();
    var sp = parts.join('-');
    var tgtGroup = syndicate.allocation_mode === 'group' ? (targets[k] || 0) : 0;
    var tgtIndiv = syndicate.allocation_mode === 'individual' ? (allocSum[k] || 0) : 0;
    rows.push({
      species: sp,
      sex: sx,
      target_total: syndicate.allocation_mode === 'group' ? tgtGroup : tgtIndiv,
      actual_total: actuals[k] || 0,
      my_allocation: allocMine[k] || 0,
      my_actual: mine[k] || 0
    });
  });
  return { ok: true, rows: rows, fallback: true };
}

function renderSyndicateProgressBars(s, summaryRows, season) {
  var mode = s.allocation_mode;
  var bySp = {};
  (summaryRows || []).forEach(function(row) {
    var sp = row.species;
    if (!sp) return;
    if (!bySp[sp]) bySp[sp] = { m: null, f: null };
    if (row.sex === 'm') bySp[sp].m = row;
    else bySp[sp].f = row;
  });
  var ordered = [];
  PLAN_SPECIES.forEach(function(ps) {
    if (bySp[ps.name]) ordered.push(ps.name);
  });
  Object.keys(bySp).forEach(function(name) {
    if (ordered.indexOf(name) < 0) ordered.push(name);
  });

  var totalTarget = 0;
  var totalActual = 0;
  var html = '';
  var rendered = 0;

  ordered.forEach(function(spName) {
    var pair = bySp[spName];
    var sp = planSpeciesMeta(spName);
    var mTarget = pair.m ? parseInt(pair.m.target_total, 10) || 0 : 0;
    var fTarget = pair.f ? parseInt(pair.f.target_total, 10) || 0 : 0;
    var mActual = pair.m ? parseInt(pair.m.actual_total, 10) || 0 : 0;
    var fActual = pair.f ? parseInt(pair.f.actual_total, 10) || 0 : 0;
    if (mTarget === 0 && fTarget === 0 && mActual === 0 && fActual === 0) return;

    var spTarget = mTarget + fTarget;
    var spActual = mActual + fActual;
    totalTarget += spTarget;
    totalActual += spActual;

    if (rendered > 0) html += '<div class="plan-divider"></div>';
    rendered++;

    html += '<div class="plan-sp-section">';
    html += '<div class="plan-sp-hdr">';
    html += '<div class="plan-sp-dot" style="background:' + sp.color + ';"></div>';
    html += '<div class="plan-sp-name">' + esc(sp.name) + '</div>';
    html += '<div class="plan-sp-total">' + spActual + '/' + spTarget + '</div>';
    html += '</div>';

    if (mTarget > 0 || mActual > 0) {
      var mPct = mTarget > 0 ? Math.min(100, Math.round(mActual / mTarget * 100)) : (mActual > 0 ? 100 : 0);
      var mDone = mTarget > 0 && mActual >= mTarget;
      var mBar = mTarget === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : mDone ? 'linear-gradient(90deg,#2d7a1a,#7adf7a)' : 'linear-gradient(90deg,#5a7a30,#7adf7a)';
      html += '<div class="plan-sex-row">';
      html += '<div class="plan-sex-icon">♂</div>';
      html += '<div class="plan-sex-lbl">' + esc(sp.mLbl) + '</div>';
      html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + mPct + '%;background:' + mBar + ';"></div></div>';
      html += '<div class="plan-count ' + (mDone ? 'plan-count-done' : mActual === 0 ? 'plan-count-zero' : '') + '">' + mActual + '/' + mTarget + (mDone ? ' ✓' : '') + '</div>';
      html += '</div>';
      if (mode === 'individual' && pair.m) {
        var ma = parseInt(pair.m.my_allocation, 10) || 0;
        var my = parseInt(pair.m.my_actual, 10) || 0;
        var yPct = ma > 0 ? Math.min(100, Math.round(my / ma * 100)) : (my > 0 ? 100 : 0);
        var yDone = ma > 0 && my >= ma;
        var yBar = ma === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : yDone ? 'linear-gradient(90deg,#b8860b,#f0c870)' : 'linear-gradient(90deg,#c8a84b,#f0c870)';
        html += '<div class="plan-sex-row synd-plan-yours">';
        html += '<div class="plan-sex-icon"></div>';
        html += '<div class="plan-sex-lbl">Yours</div>';
        html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + yPct + '%;background:' + yBar + ';"></div></div>';
        html += '<div class="plan-count ' + (yDone ? 'plan-count-done' : my === 0 ? 'plan-count-zero' : '') + '" style="font-size:10px;">' + my + '/' + (ma || '–') + (yDone ? ' ✓' : '') + '</div>';
        html += '</div>';
      }
    }
    if (fTarget > 0 || fActual > 0) {
      var fPct = fTarget > 0 ? Math.min(100, Math.round(fActual / fTarget * 100)) : (fActual > 0 ? 100 : 0);
      var fDone = fTarget > 0 && fActual >= fTarget;
      var fBar = fTarget === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : fDone ? 'linear-gradient(90deg,#2d7a1a,#7adf7a)' : 'linear-gradient(90deg,#5a7a30,#7adf7a)';
      html += '<div class="plan-sex-row">';
      html += '<div class="plan-sex-icon">♀</div>';
      html += '<div class="plan-sex-lbl">' + esc(sp.fLbl) + '</div>';
      html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + fPct + '%;background:' + fBar + ';"></div></div>';
      html += '<div class="plan-count ' + (fDone ? 'plan-count-done' : fActual === 0 ? 'plan-count-zero' : '') + '">' + fActual + '/' + fTarget + (fDone ? ' ✓' : '') + '</div>';
      html += '</div>';
      if (mode === 'individual' && pair.f) {
        var fa = parseInt(pair.f.my_allocation, 10) || 0;
        var fy = parseInt(pair.f.my_actual, 10) || 0;
        var fyPct = fa > 0 ? Math.min(100, Math.round(fy / fa * 100)) : (fy > 0 ? 100 : 0);
        var fyDone = fa > 0 && fy >= fa;
        var fyBar = fa === 0 ? 'linear-gradient(90deg,#a0988a,#c0b8a8)' : fyDone ? 'linear-gradient(90deg,#b8860b,#f0c870)' : 'linear-gradient(90deg,#c8a84b,#f0c870)';
        html += '<div class="plan-sex-row synd-plan-yours">';
        html += '<div class="plan-sex-icon"></div>';
        html += '<div class="plan-sex-lbl">Yours</div>';
        html += '<div class="plan-bar-wrap"><div class="plan-bar" style="width:' + fyPct + '%;background:' + fyBar + ';"></div></div>';
        html += '<div class="plan-count ' + (fyDone ? 'plan-count-done' : fy === 0 ? 'plan-count-zero' : '') + '" style="font-size:10px;">' + fy + '/' + (fa || '–') + (fyDone ? ' ✓' : '') + '</div>';
        html += '</div>';
      }
    }
    html += '</div>';
  });

  if (!rendered) {
    return '<div style="font-size:11px;color:var(--muted);padding:4px 0;">No targets for ' + esc(season) + ' yet.</div>';
  }
  var totalPct = totalTarget > 0 ? Math.min(100, Math.round(totalActual / totalTarget * 100)) : 0;
  html += '<div class="plan-total-row">';
  html += '<div class="plan-total-lbl">Total</div>';
  html += '<div class="plan-total-bar"><div class="plan-total-fill" style="width:' + totalPct + '%;"></div></div>';
  html += '<div class="plan-total-count">' + totalActual + '/' + totalTarget + '</div>';
  html += '</div>';
  return html;
}

async function renderOneSyndicateCard(row) {
  var s = row.syndicate;
  var isMgr = row.role === 'manager';
  var season = currentSeason;
  var sum = await fetchSyndicateSummaryRpc(s.id, season);
  var rows = [];
  if (sum.ok) rows = sum.rows || [];
  else {
    var fb = await fetchSyndicateSummaryFallback(s, season, isMgr);
    rows = fb.rows || [];
  }
  var sub = (s.allocation_mode === 'group' ? 'Group targets' : 'Individual allocations') +
    (s.ground_filter ? ' · ' + s.ground_filter : '');
  var btn = isMgr
    ? '<button type="button" class="plan-edit-btn" data-fl-action="open-syndicate-manage" data-syndicate-id="' + esc(s.id) + '">Manage</button>'
    : '<button type="button" class="plan-edit-btn" data-fl-action="open-syndicate-manage" data-syndicate-id="' + esc(s.id) + '">View</button>';
  return '<div class="synd-block">'
    + '<div class="synd-block-hdr">'
    + '<div><div class="synd-block-title">' + esc(s.name) + '</div>'
    + '<div class="synd-block-meta">' + esc(sub) + '</div></div>' + btn + '</div>'
    + renderSyndicateProgressBars(s, rows, season)
    + '</div>';
}

async function renderSyndicateSection() {
  var body = document.getElementById('syndicate-body');
  var outer = document.getElementById('syndicate-card-outer');
  var btn = document.getElementById('syndicate-new-btn');
  if (!body || !outer) return Promise.resolve();
  if (!sb) {
    outer.style.display = 'none';
    return Promise.resolve();
  }
  outer.style.display = '';
  if (!currentUser) {
    try {
      var ses = await sb.auth.getSession();
      if (ses.data && ses.data.session && ses.data.session.user) {
        currentUser = ses.data.session.user;
      }
    } catch (e) { /* ignore */ }
  }
  if (!currentUser) {
    body.innerHTML = '<div class="plan-empty" style="padding:12px 0;"><div class="plan-empty-s" style="font-size:12px;">Sign in to manage syndicate cull targets.</div></div>';
    if (btn) btn.style.display = 'none';
    return Promise.resolve();
  }
  if (btn) btn.style.display = '';
  body.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:12px;">Loading syndicates…</div>';
  try {
    var list = await loadMySyndicateRows();
    if (!list.length) {
      body.innerHTML = '<div class="plan-empty"><div class="plan-empty-t">No syndicates yet</div>'
        + '<div class="plan-empty-s">Create a group, set shared targets, and invite members with a link.</div>'
        + '<button type="button" class="plan-set-btn" data-fl-action="open-syndicate-create">Create syndicate</button></div>';
      enhanceKeyboardClickables(body);
      return;
    }
    var parts = [];
    for (var i = 0; i < list.length; i++) {
      parts.push(await renderOneSyndicateCard(list[i]));
    }
    body.innerHTML = parts.join('');
    enhanceKeyboardClickables(body);
  } catch (e) {
    body.innerHTML = '<div style="padding:12px;font-size:12px;color:#c62828;">' + esc(e.message || 'Failed to load syndicates') + '</div>';
  }
}

async function openSyndicateCreateSheet() {
  if (!sb) { showToast('⚠️ Supabase not configured'); return; }
  if (!currentUser) {
    try {
      var ses = await sb.auth.getSession();
      if (ses.data && ses.data.session && ses.data.session.user) {
        currentUser = ses.data.session.user;
      }
    } catch (e) { /* ignore */ }
  }
  if (!currentUser) { showToast('⚠️ Sign in first'); return; }
  syndicateEditingId = null;
  var tEl = document.getElementById('syn-modal-title');
  var sEl = document.getElementById('syn-modal-sub');
  var bEl = document.getElementById('syn-modal-body');
  if (!tEl || !sEl || !bEl) {
    showToast('⚠️ UI not ready — refresh the page');
    console.warn('Syndicate modal nodes missing');
    return;
  }
  tEl.textContent = 'New syndicate';
  sEl.textContent = 'Create a group and set targets';
  var groundOpts = '<option value="">All grounds (no filter)</option>';
  (savedGrounds || []).forEach(function(g) { groundOpts += '<option value="' + esc(g) + '">' + esc(g) + '</option>'; });
  bEl.innerHTML =
    '<label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Name</label>'
    + '<input type="text" id="syn-inp-name" style="width:100%;padding:10px 12px;border:1.5px solid #e0dcd6;border-radius:10px;margin-bottom:14px;font-size:14px;" placeholder="e.g. North Block syndicate">'
    + '<label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Allocation</label>'
    + '<select id="syn-inp-mode" style="width:100%;padding:10px 12px;border:1.5px solid #e0dcd6;border-radius:10px;margin-bottom:14px;font-size:14px;">'
    + '<option value="group">Group total (shared pool)</option>'
    + '<option value="individual">Per-member allocations</option></select>'
    + '<label style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:6px;">Ground filter (optional)</label>'
    + '<select id="syn-inp-ground" style="width:100%;padding:10px 12px;border:1.5px solid #e0dcd6;border-radius:10px;margin-bottom:16px;font-size:13px;">' + groundOpts + '</select>'
    + '<p style="font-size:11px;color:var(--muted);margin-bottom:14px;">Entries must match this ground label to count. Leave empty to count all entries from members.</p>'
    + '<button type="button" class="tsheet-save" style="width:100%;" data-fl-action="save-syndicate-create">Create syndicate</button>';
  enhanceKeyboardClickables(bEl);
  openSynModal();
}

async function saveSyndicateCreate() {
  if (!sb || !currentUser) return;
  var name = document.getElementById('syn-inp-name') && document.getElementById('syn-inp-name').value.trim();
  var mode = document.getElementById('syn-inp-mode') && document.getElementById('syn-inp-mode').value;
  var g = document.getElementById('syn-inp-ground') && document.getElementById('syn-inp-ground').value;
  if (!name) { showToast('⚠️ Enter a name'); return; }
  var btn = document.querySelector('[data-fl-action="save-syndicate-create"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
  try {
    var r = await sb.rpc('create_syndicate', {
      p_name: name,
      p_allocation_mode: mode,
      p_ground_filter: g || null
    });
    if (r.error) throw r.error;
    showToast('✅ Syndicate created');
    closeSynModal();
    statsNeedsFullRebuild = true;
    await renderSyndicateSection();
    openSyndicateManageSheet(r.data);
  } catch (e) {
    showToast('⚠️ ' + (e.message || 'Could not create'));
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Create syndicate'; }
}

async function openSyndicateManageSheet(sid) {
  if (!sb || !currentUser) return;
  syndicateEditingId = sid || syndicateEditingId;
  if (!syndicateEditingId) return;
  var sr = await sb.from('syndicates').select('*').eq('id', syndicateEditingId).single();
  if (sr.error || !sr.data) { showToast('⚠️ Syndicate not found'); return; }
  var s = sr.data;
  var isMgr = false;
  var mr = await sb.from('syndicate_members').select('role').eq('syndicate_id', s.id).eq('user_id', currentUser.id).eq('status', 'active').limit(1);
  if (mr.data && mr.data[0] && mr.data[0].role === 'manager') isMgr = true;

  var memberRows = null;
  var memberNameById = {};
  if (isMgr) {
    var mfetch = await sb.from('syndicate_members').select('user_id, role, display_name, joined_at').eq('syndicate_id', s.id).eq('status', 'active');
    memberRows = mfetch.data;
    if (memberRows) {
      memberRows.forEach(function(m) {
        memberNameById[m.user_id] = (m.display_name && String(m.display_name).trim())
          ? String(m.display_name).trim()
          : ('Member ' + (m.user_id || '').slice(0, 8));
      });
    }
  }

  document.getElementById('syn-modal-title').textContent = s.name;
  document.getElementById('syn-modal-sub').textContent = (isMgr ? 'Manager' : 'Member') + ' · ' + currentSeason;

  var targets = {};
  var tr = await sb.from('syndicate_targets').select('species, sex, target').eq('syndicate_id', s.id).eq('season', currentSeason);
  if (tr.data) tr.data.forEach(function(row) { targets[row.species + '-' + row.sex] = row.target; });

  var bodyHtml = '';
  if (isMgr && memberRows && memberRows.length) {
    var sortedMembers = memberRows.slice().sort(function(a, b) {
      if (a.role !== b.role) return a.role === 'manager' ? -1 : 1;
      var na = memberNameById[a.user_id] || '';
      var nb = memberNameById[b.user_id] || '';
      return na.localeCompare(nb, undefined, { sensitivity: 'base' });
    });
    bodyHtml += '<div style="font-size:11px;font-weight:700;margin-bottom:8px;color:var(--bark);">Members</div>'
      + '<p style="font-size:11px;color:var(--muted);margin:0 0 10px 0;">Everyone in this syndicate right now. Managers cannot be removed here — transfer responsibility before leaving.</p>'
      + '<div id="syn-member-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">';
    sortedMembers.forEach(function(m) {
      var label = memberNameById[m.user_id] || ('Member ' + (m.user_id || '').slice(0, 8));
      var isSelf = m.user_id === currentUser.id;
      var roleLbl = m.role === 'manager' ? 'Manager' : 'Member';
      var joined = m.joined_at
        ? new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '';
      var rmCell = '';
      if (m.role === 'member' && !isSelf) {
        rmCell = '<button type="button" class="syn-member-rm" data-fl-action="synd-remove-member" data-member-user-id="' + esc(m.user_id) + '" style="flex-shrink:0;padding:6px 10px;font-size:11px;border:1.5px solid #c62828;color:#c62828;border-radius:8px;background:transparent;font-weight:600;cursor:pointer;">Remove</button>';
      } else if (m.role === 'member' && isSelf) {
        rmCell = '<span style="font-size:10px;color:var(--muted);white-space:nowrap;">Use Leave below</span>';
      } else {
        rmCell = '<span style="font-size:10px;color:var(--muted);white-space:nowrap;">—</span>';
      }
      bodyHtml += '<div class="syn-member-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:#faf8f4;border:1.5px solid #ece8e2;border-radius:10px;">'
        + '<div style="min-width:0;">'
        + '<div style="font-weight:600;font-size:13px;color:var(--bark);">' + esc(label)
        + (isSelf ? ' <span style="color:var(--muted);font-weight:500;">(you)</span>' : '')
        + '</div>'
        + '<div style="font-size:10px;color:var(--muted);">' + esc(roleLbl) + (joined ? ' · Joined ' + esc(joined) : '') + '</div>'
        + '</div>' + rmCell + '</div>';
    });
    bodyHtml += '</div>';
  }

  if (s.allocation_mode === 'group' && isMgr) {
    bodyHtml += '<div style="font-size:11px;font-weight:700;margin-bottom:8px;color:var(--bark);">Group targets · ' + esc(currentSeason) + '</div>'
      + buildSyndicateStepperGrid(targets, 'syntt')
      + '<button type="button" class="tsheet-save" style="width:100%;margin-top:14px;" data-fl-action="save-syndicate-targets">Save targets</button>';
  } else if (s.allocation_mode === 'group' && !isMgr) {
    bodyHtml += '<p style="font-size:12px;color:var(--muted);">Group totals are set by the manager. You see syndicate-wide progress on the Stats card.</p>';
  }

  if (s.allocation_mode === 'individual' && isMgr) {
    var opts = '<option value="">Choose member…</option>';
    if (memberRows) {
      memberRows.forEach(function(m) {
        if (m.role === 'manager') return;
        var label = memberNameById[m.user_id] || ('Member ' + (m.user_id || '').slice(0, 8));
        opts += '<option value="' + esc(m.user_id) + '">' + esc(label) + '</option>';
      });
    }
    var allocVals = {};
    syndicateAllocMemberId = null;
    bodyHtml += '<div style="font-size:11px;font-weight:700;margin-bottom:8px;">Per-member allocations</div>'
      + '<select id="syn-alloc-member" style="width:100%;padding:10px;margin-bottom:10px;border:1.5px solid #e0dcd6;border-radius:10px;font-size:13px;">' + opts + '</select>'
      + '<div id="syn-alloc-grid"></div>'
      + '<button type="button" class="tsheet-save" style="width:100%;margin-top:12px;display:none;" id="syn-alloc-save" data-fl-action="save-syndicate-alloc">Save allocations for member</button>';
  } else if (s.allocation_mode === 'individual' && !isMgr) {
    bodyHtml += '<p style="font-size:12px;color:var(--muted);">Your personal allocation is set by the manager. Syndicate totals are on the Stats card.</p>';
  }

  if (isMgr) {
    bodyHtml += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #ece8e2;">'
      + '<div style="font-size:11px;font-weight:700;margin-bottom:8px;">Invite link</div>'
      + '<p style="font-size:11px;color:var(--muted);margin-bottom:8px;">Generate a link and send it to members. They must be signed in to accept.</p>'
      + '<button type="button" class="copy-targets-btn" style="width:100%;margin-bottom:8px;" data-fl-action="synd-generate-invite">Generate new invite link</button>'
      + '<div id="syn-invite-out" class="synd-invite-box" style="display:none;"></div></div>';

    var br = await sb.rpc('syndicate_member_actuals_for_manager', { p_syndicate_id: s.id, p_season: currentSeason });
    if (!br.error && br.data && br.data.length) {
      bodyHtml += '<div style="margin-top:16px;"><div style="font-size:11px;font-weight:700;margin-bottom:6px;">Manager · culled by member</div>'
        + '<p style="font-size:10px;color:var(--muted);margin:0 0 6px 0;">Each line is one cull, newest first.</p>'
        + '<div style="font-size:11px;font-family:DM Sans,sans-serif;color:var(--bark);max-height:220px;overflow:auto;line-height:1.45;">';
      br.data.forEach(function(row) {
        var nm = row.user_id
          ? (memberNameById[row.user_id] || ('Member ' + (row.user_id || '').slice(0, 8)))
          : 'Former members (account removed)';
        var sexLbl = row.sex === 'm' ? 'Stags/Bucks' : 'Hinds/Does';
        var dateStr = row.cull_date ? fmtDate(row.cull_date) : '—';
        bodyHtml += '<span style="font-weight:600;">' + esc(nm) + '</span>'
          + ' <span style="color:var(--muted);">·</span> ' + esc(row.species)
          + ' <span style="color:var(--muted);">' + esc(sexLbl) + '</span>'
          + ' <span style="color:var(--muted);">·</span> ' + esc(dateStr)
          + '<br>';
      });
      bodyHtml += '</div></div>';
    }

    bodyHtml += '<div style="margin-top:20px;"><button type="button" style="width:100%;padding:12px;background:none;border:1.5px solid #c62828;color:#c62828;border-radius:12px;font-weight:700;" data-fl-action="synd-delete">Delete syndicate</button></div>';
  }

  bodyHtml += '<div style="margin-top:16px;"><button type="button" style="width:100%;padding:12px;border:1.5px solid #e0dcd6;border-radius:12px;background:#faf8f4;font-weight:600;" data-fl-action="synd-leave">'
    + (isMgr ? 'Close' : 'Leave syndicate') + '</button></div>';

  var smb = document.getElementById('syn-modal-body');
  if (smb) {
    smb.innerHTML = bodyHtml;
    enhanceKeyboardClickables(smb);
  }

  if (s.allocation_mode === 'individual' && isMgr) {
    var sel = document.getElementById('syn-alloc-member');
    if (sel) {
      sel.addEventListener('change', function() {
        syndicateAllocMemberId = sel.value || null;
        loadSyndicateAllocGrid(s.id, currentSeason, syndicateAllocMemberId);
      });
    }
  }

  openSynModal();
}

async function loadSyndicateAllocGrid(syndicateId, season, memberUserId) {
  var grid = document.getElementById('syn-alloc-grid');
  var saveBtn = document.getElementById('syn-alloc-save');
  if (!grid || !memberUserId) {
    if (grid) grid.innerHTML = '';
    if (saveBtn) saveBtn.style.display = 'none';
    return;
  }
  var ar = await sb.from('syndicate_member_allocations').select('species, sex, allocation')
    .eq('syndicate_id', syndicateId).eq('season', season).eq('user_id', memberUserId);
  var vals = {};
  if (ar.data) ar.data.forEach(function(row) { vals[row.species + '-' + row.sex] = row.allocation; });
  grid.innerHTML = buildSyndicateStepperGrid(vals, 'synalloc');
  if (saveBtn) saveBtn.style.display = 'block';
  enhanceKeyboardClickables(grid);
}

async function saveSyndicateTargets() {
  if (!sb || !currentUser || !syndicateEditingId) return;
  var o = readSyndicateSteppers('syntt');
  var rows = [];
  PLAN_SPECIES.forEach(function(sp) {
    rows.push({ syndicate_id: syndicateEditingId, season: currentSeason, species: sp.name, sex: 'm', target: o[sp.name + '-m'] || 0 });
    rows.push({ syndicate_id: syndicateEditingId, season: currentSeason, species: sp.name, sex: 'f', target: o[sp.name + '-f'] || 0 });
  });
  var r = await sb.from('syndicate_targets').upsert(rows, { onConflict: 'syndicate_id,season,species,sex' });
  if (r.error) { showToast('⚠️ ' + (r.error.message || 'Save failed')); return; }
  showToast('✅ Targets saved');
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
}

async function saveSyndicateAlloc() {
  if (!sb || !syndicateEditingId || !syndicateAllocMemberId) { showToast('⚠️ Pick a member'); return; }
  var rows = [];
  var o = readSyndicateSteppers('synalloc');
  PLAN_SPECIES.forEach(function(sp) {
    rows.push({
      syndicate_id: syndicateEditingId,
      user_id: syndicateAllocMemberId,
      season: currentSeason,
      species: sp.name,
      sex: 'm',
      allocation: o[sp.name + '-m'] || 0
    });
    rows.push({
      syndicate_id: syndicateEditingId,
      user_id: syndicateAllocMemberId,
      season: currentSeason,
      species: sp.name,
      sex: 'f',
      allocation: o[sp.name + '-f'] || 0
    });
  });
  var r = await sb.from('syndicate_member_allocations').upsert(rows, { onConflict: 'syndicate_id,user_id,season,species,sex' });
  if (r.error) { showToast('⚠️ ' + (r.error.message || 'Save failed')); return; }
  showToast('✅ Allocations saved');
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
}

async function syndGenerateInvite() {
  if (!sb || !syndicateEditingId) return;
  var tok = syndicateRandomToken();
  var exp = new Date(Date.now() + 7 * 864e5).toISOString();
  var r = await sb.from('syndicate_invites').insert({
    syndicate_id: syndicateEditingId,
    token: tok,
    created_by: currentUser.id,
    expires_at: exp,
    max_uses: 100,
    used_count: 0
  });
  if (r.error) { showToast('⚠️ ' + (r.error.message || 'Could not create invite')); return; }
  var url = window.location.origin + window.location.pathname + (window.location.pathname.endsWith('.html') ? '' : '') + '?syndicate_invite=' + encodeURIComponent(tok);
  var out = document.getElementById('syn-invite-out');
  if (out) {
    out.style.display = 'block';
    out.innerHTML = '<span style="color:var(--muted);">Link (7 days):</span><br>' + esc(url)
      + '<br><button type="button" class="copy-targets-btn" style="margin-top:8px;" data-fl-action="synd-copy-invite" data-invite-url="' + esc(url) + '">Copy link</button>';
  }
  showToast('✅ Invite link ready');
}

function syndCopyInvite(el) {
  var u = el.getAttribute('data-invite-url');
  if (!u || !navigator.clipboard) { showToast('⚠️ Copy manually'); return; }
  navigator.clipboard.writeText(u).then(function() { showToast('📋 Copied'); }).catch(function() { showToast('⚠️ Copy failed'); });
}

async function syndLeaveOrClose() {
  if (!sb || !syndicateEditingId) { closeSynModal(); return; }
  var sr = await sb.from('syndicate_members').select('role').eq('syndicate_id', syndicateEditingId).eq('user_id', currentUser.id).eq('status', 'active').limit(1);
  var isMgr = sr.data && sr.data[0] && sr.data[0].role === 'manager';
  if (isMgr) {
    closeSynModal();
    return;
  }
  if (!confirm('Leave this syndicate?')) return;
  var r = await sb.from('syndicate_members').update({ status: 'left' }).eq('syndicate_id', syndicateEditingId).eq('user_id', currentUser.id);
  if (r.error) { showToast('⚠️ Could not leave'); return; }
  showToast('✅ Left syndicate');
  closeSynModal();
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
}

async function syndDelete() {
  if (!sb || !syndicateEditingId) return;
  if (!confirm('Delete this syndicate for everyone? This cannot be undone.')) return;
  var r = await sb.from('syndicates').delete().eq('id', syndicateEditingId);
  if (r.error) { showToast('⚠️ ' + (r.error.message || 'Delete failed')); return; }
  showToast('🗑 Syndicate deleted');
  closeSynModal();
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
}

async function syndRemoveMember(userId) {
  if (!sb || !syndicateEditingId || !userId) return;
  if (userId === currentUser.id) {
    showToast('⚠️ Use “Leave syndicate” at the bottom to remove yourself');
    return;
  }
  if (!confirm('Remove this member from the syndicate? Their diary entries stay private; syndicate totals will no longer include their current kills. They can rejoin with a new invite if you send one.')) return;
  var r = await sb.from('syndicate_members').update({ status: 'left' }).eq('syndicate_id', syndicateEditingId).eq('user_id', userId);
  if (r.error) {
    showToast('⚠️ ' + (r.error.message || 'Could not remove member'));
    return;
  }
  showToast('✅ Member removed');
  statsNeedsFullRebuild = true;
  await renderSyndicateSection();
  await openSyndicateManageSheet(syndicateEditingId);
}

async function tryRedeemSyndicateInviteFromUrl() {
  if (!sb || !currentUser) return;
  var sp = new URLSearchParams(window.location.search);
  var tok = sp.get('syndicate_invite');
  if (!tok) return;
  try {
    var r = await sb.rpc('redeem_syndicate_invite', { p_token: tok });
    if (r.error) throw r.error;
    showToast('✅ Joined syndicate');
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    statsNeedsFullRebuild = true;
    if (document.getElementById('v-stats') && document.getElementById('v-stats').classList.contains('active')) buildStats();
    await renderSyndicateSection();
  } catch (e) {
    showToast('⚠️ Invite: ' + (e.message || 'invalid'));
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
}


// ── Ground Stats ───────────────────────────────────────────────
function buildGroundStats(entries) {
  var card  = document.getElementById('ground-card');
  var chart = document.getElementById('ground-chart');
  if (!card || !chart) return;

  // Group by ground — blank ground = 'Untagged'
  var counts = {};
  entries.forEach(function(e) {
    var g = (e.ground && e.ground.trim()) ? e.ground.trim() : null;
    if (g) counts[g] = (counts[g]||0) + 1;
    else   counts['__untagged__'] = (counts['__untagged__']||0) + 1;
  });

  var grounds = Object.keys(counts).filter(function(g){ return g !== '__untagged__'; });

  // Hide if only one ground or no grounds at all
  if (grounds.length === 0) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  grounds.sort(function(a,b){ return counts[b]-counts[a]; });
  var maxCnt = Math.max.apply(null, grounds.map(function(g){ return counts[g]; }).concat([1]));

  var html = '';
  grounds.forEach(function(g, i) {
    var cnt = counts[g];
    var pct = Math.round(cnt/maxCnt*100);
    var barClr = i === 0
      ? 'linear-gradient(90deg,#5a7a30,#7adf7a)'
      : 'linear-gradient(90deg,#c8a84b,#f0c870)';
    html += '<div class="bar-row">'
      + '<div class="bar-lbl">' + esc(g) + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+barClr+';"></div></div>'
      + '<div class="bar-cnt">'+cnt+'</div>'
      + '</div>';
  });

  // Untagged at bottom in grey if any
  if (counts['__untagged__']) {
    var uCnt = counts['__untagged__'];
    var uPct = Math.round(uCnt/maxCnt*100);
    html += '<div class="bar-row">'
      + '<div class="bar-lbl" style="color:var(--muted);font-style:italic;">Untagged</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+uPct+'%;background:#e0dcd6;"></div></div>'
      + '<div class="bar-cnt" style="color:var(--muted);">'+uCnt+'</div>'
      + '</div>';
  }

  chart.innerHTML = html;
}


// ── Ground Management (add / delete from targets sheet) ───────
function showAddGroundInput() {
  var row = document.getElementById('ground-add-row');
  var inp = document.getElementById('ground-add-inp');
  if (row) { row.style.display = 'flex'; }
  if (inp) { inp.value = ''; inp.focus(); }
}

function hideAddGroundInput() {
  var row = document.getElementById('ground-add-row');
  if (row) row.style.display = 'none';
}

async function seedUnassignedBufferFromCullIfNeeded() {
  if (!sb || !currentUser || savedGrounds.length !== 1) return;
  var named = savedGrounds[0];
  var namedBucket = groundTargets[named] || {};
  var namedSum = Object.keys(namedBucket).reduce(function(s, k) {
    return s + (parseInt(namedBucket[k], 10) || 0);
  }, 0);
  var u = groundTargets['__unassigned__'] || {};
  var uSum = Object.keys(u).reduce(function(s, k) {
    return s + (parseInt(u[k], 10) || 0);
  }, 0);
  if (namedSum > 0 || uSum > 0) return;
  var cullSum = Object.keys(cullTargets || {}).reduce(function(s, k) {
    return s + (parseInt(cullTargets[k], 10) || 0);
  }, 0);
  if (cullSum === 0) return;
  var rows = [];
  PLAN_SPECIES.forEach(function(sp) {
    var m = cullTargets[sp.name + '-m'] || 0;
    var f = cullTargets[sp.name + '-f'] || 0;
    rows.push({ user_id: currentUser.id, season: currentSeason, ground: '__unassigned__', species: sp.name, sex: 'm', target: m });
    rows.push({ user_id: currentUser.id, season: currentSeason, ground: '__unassigned__', species: sp.name, sex: 'f', target: f });
  });
  try {
    var r = await sb.from('ground_targets').upsert(rows, { onConflict: 'user_id,season,ground,species,sex' });
    if (r.error) throw r.error;
    await loadGroundTargets(currentSeason);
    await syncCullTargetsFromGroundTargetsAgg(sumGroundTargetsAgg(groundTargets));
  } catch (e) {
    console.warn('seedUnassignedBufferFromCullIfNeeded:', e);
  }
}

async function confirmAddGround() {
  var inp = document.getElementById('ground-add-inp');
  var name = inp ? inp.value.trim() : '';
  if (!name) { showToast('⚠️ Enter a ground name'); return; }
  if (savedGrounds.indexOf(name) !== -1) { showToast('⚠️ Ground already exists'); return; }

  await saveGround(name);
  hideAddGroundInput();
  await seedUnassignedBufferFromCullIfNeeded();
  renderGroundSections();
  renderPlanGroundFilter();
  renderPlanCard(allEntries, currentSeason);
  showToast('✅ ' + name + ' added');
}

// Called from dynamically generated buttons using data-gi index attribute
function deleteGroundByIdx(btn) {
  var idx = parseInt(btn.getAttribute('data-gi'));
  if (isNaN(idx) || idx < 0 || idx >= savedGrounds.length) return;
  deleteGround(savedGrounds[idx]);
}

async function deleteGround(name) {
  if (!confirm('Remove "' + name + '" from your saved grounds?\n\nTargets for this ground will be deleted. Diary entries are kept, but any entry tagged with this ground will no longer have a ground shown.')) return;
  if (!sb || !currentUser) return;

  try {
    // Clear ground on existing diary rows (entries are not deleted)
    var clearRes = await sb.from('cull_entries')
      .update({ ground: null })
      .eq('user_id', currentUser.id)
      .eq('ground', name);
    if (clearRes.error) throw clearRes.error;

    // Remove from grounds table
    await sb.from('grounds')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('name', name);

    // Remove ground targets for this ground
    await sb.from('ground_targets')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('ground', name);

    // Remove from local array
    savedGrounds = savedGrounds.filter(function(g){ return g !== name; });
    delete groundTargets[name];

    if (planGroundFilter === name) planGroundFilter = 'overview';

    await loadGroundTargets(currentSeason);
    if (savedGrounds.length === 0) {
      var aggDel = sumGroundTargetsAgg(groundTargets);
      if (summedGroundTargetsAnyPositive(aggDel)) await syncCullTargetsFromGroundTargetsAgg(aggDel);
    }

    populateGroundDropdown();
    renderGroundSections();
    renderPlanGroundFilter();
    await loadEntries();
    renderPlanCard(allEntries, currentSeason);
    if (document.getElementById('v-stats') && document.getElementById('v-stats').classList.contains('active')) buildStats();

    showToast('🗑 ' + name + ' removed');
  } catch(e) {
    showToast('⚠️ Could not remove ground');
    console.warn('deleteGround error:', e);
  }
}


// ── Summary Filter ──────────────────────────────────────────
function closeSummaryFilterModal() {
  var sm = document.getElementById('summary-filter-modal');
  if (sm) sm.style.display = 'none';
  summaryEntryPool = null;
}

async function openSummaryFilter() {
  if (!sb || !currentUser) {
    showToast('⚠️ Sign in to export');
    return;
  }

  summaryEntryPool = null;

  if (navigator.onLine) {
    try {
      showToast('⏳ Loading diary…');
      var r = await sb.from('cull_entries')
        .select(CULL_ENTRY_LIST_COLUMNS)
        .eq('user_id', currentUser.id)
        .order('date', { ascending: false });
      if (r.error) throw r.error;
      summaryEntryPool = r.data || [];
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('openSummaryFilter fetch:', err);
      summaryEntryPool = allEntries.slice();
      showToast('⚠️ Could not load full history — using current season only');
    }
  } else {
    summaryEntryPool = allEntries.slice();
    if (summaryEntryPool.length) {
      showToast('📶 Offline — summary uses loaded season only');
    }
  }

  if (!summaryEntryPool.length) {
    showToast('⚠️ No entries to export');
    return;
  }

  var modal = document.getElementById('summary-filter-modal');

  // Populate season dropdown from full pool (not current-season slice)
  var seasonSel = document.getElementById('summary-season-sel');
  seasonSel.innerHTML = '<option value="__all__">All Seasons</option>';
  var seasonSet = {};
  summaryEntryPool.forEach(function(e) {
    var s = buildSeasonFromEntry(e.date);
    seasonSet[s] = true;
  });
  seasonSet[currentSeason] = true;
  var seasons = Object.keys(seasonSet).sort().reverse();
  seasons.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s;
    opt.textContent = seasonLabel(s);
    if (s === currentSeason) opt.selected = true;
    seasonSel.appendChild(opt);
  });

  var groundSel = document.getElementById('summary-ground-sel');
  groundSel.innerHTML = '<option value="__all__">All grounds</option>';
  var groundSet = {};
  summaryEntryPool.forEach(function(e) {
    if (e.ground && e.ground.trim()) groundSet[e.ground.trim()] = true;
  });
  Object.keys(groundSet).sort().forEach(function(g) {
    var opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    groundSel.appendChild(opt);
  });

  function updateCount() {
    var sel = getFilteredSummaryEntries();
    document.getElementById('summary-count').textContent = sel.length;
  }
  seasonSel.onchange = updateCount;
  groundSel.onchange = updateCount;
  updateCount();

  modal.style.display = 'flex';
}

function getFilteredSummaryEntries() {
  var pool = summaryEntryPool && summaryEntryPool.length ? summaryEntryPool : allEntries;
  var season = document.getElementById('summary-season-sel').value;
  var ground = document.getElementById('summary-ground-sel').value;
  return pool.filter(function(e) {
    var inSeason = season === '__all__' || buildSeasonFromEntry(e.date) === season;
    var inGround = ground === '__all__' || (e.ground && e.ground.trim() === ground);
    return inSeason && inGround;
  });
}

async function doExportSummaryFiltered() {
  var entries = getFilteredSummaryEntries();
  if (!entries.length) { showToast('⚠️ No entries match selection'); return; }

  var season = document.getElementById('summary-season-sel').value;
  var ground = document.getElementById('summary-ground-sel').value;
  var groundLabel = ground === '__all__' ? 'All Grounds' : ground;
  var seasonForPdf = season === '__all__' ? currentSeason : season;
  /** Match cull plan targets to this season; skip plan section for “All Seasons” */
  var planSeasonKey = season === '__all__' ? null : season;

  closeSummaryFilterModal();

  window._summarySeasonLabel = season === '__all__' ? 'All Seasons' : null;
  window._summaryGroundOverride = groundLabel !== 'All Grounds' ? groundLabel : null;

  var _allEntries = allEntries;
  var _currentSeason = currentSeason;
  allEntries = entries;
  currentSeason = seasonForPdf;

  try {
    cullTargets = {};
    if (planSeasonKey && sb && currentUser) {
      await loadTargets(planSeasonKey);
    }
    exportSeasonSummary();
  } finally {
    allEntries = _allEntries;
    currentSeason = _currentSeason;
    delete window._summarySeasonLabel;
    delete window._summaryGroundOverride;
    if (sb && currentUser) {
      await loadTargets(_currentSeason);
    }
  }
}


// ── Offline photo storage warning ──────────────────────────
function offlinePhotoWarn(callback) {
  if (navigator.onLine) { callback(); return; }
  // Estimate current offline queue size
  var queueStr = localStorage.getItem(OFFLINE_KEY) || '';
  var kb = Math.round(queueStr.length / 1024);
  var remaining = Math.max(0, 5000 - kb);
  if (remaining < 400) {
    // Under 400KB remaining — warn strongly
    if (!confirm('Low offline storage (' + remaining + 'KB left). Adding a photo may prevent this entry from being saved offline. Continue without photo instead?')) {
      return;
    }
  } else {
    showToast('📶 Offline — photo will be stored locally (~200KB) until synced');
  }
  callback();
}

// ── UK place labels (aligned with app.js / index Nominatim handling) ──
function normalizeUkPlaceName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  var s = raw.trim();
  s = s.replace(
    /^(Metropolitan Borough of |London Borough of |Royal Borough of |Borough of |City of |County of |District of |Unitary Authority of )/i,
    ''
  );
  return s.trim();
}
function primaryPlaceFromAddress(a, displayNameFirstPart) {
  a = a || {};
  var p =
    a.neighbourhood ||
    a.suburb ||
    a.village ||
    a.hamlet ||
    a.locality ||
    a.isolated_dwelling ||
    a.town ||
    a.city ||
    a.municipality ||
    '';
  if (p) return p;
  return (displayNameFirstPart || '').trim();
}
function formatUkLocationLabel(addr, displayNameFirstPart) {
  var a = addr || {};
  var rawPrimary = primaryPlaceFromAddress(a, displayNameFirstPart);
  var primary = normalizeUkPlaceName(rawPrimary);
  var county = normalizeUkPlaceName(a.county || a.state_district || '');
  var parts = [];
  if (primary) parts.push(primary);
  if (county) parts.push(county);
  return parts.join(', ') || normalizeUkPlaceName(displayNameFirstPart) || '';
}
function diaryReverseGeocodeLabel(d, latFallback, lngFallback) {
  var a = d.address || {};
  var displayFirst = (d.display_name || '').split(',')[0].trim();
  var raw = primaryPlaceFromAddress(a, displayFirst) || a.county || '';
  if (!raw) return latFallback + ', ' + lngFallback;
  return normalizeUkPlaceName(raw);
}
function diaryEscHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function diaryEscAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ── Pin map location search ──────────────────────────────────
var _pinSearchTimer = null;

function pinmapSearchDebounce(val) {
  clearTimeout(_pinSearchTimer);
  if (!val.trim()) { document.getElementById('pinmap-search-results').style.display = 'none'; return; }
  _pinSearchTimer = setTimeout(function() { pinmapSearchNow(val); }, 500);
}

function pinmapSearchNow(val) {
  if (!val.trim()) return;
  var resultsEl = document.getElementById('pinmap-search-results');
  resultsEl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.5);">Searching…</div>';
  resultsEl.style.display = 'block';
  nominatimFetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(val) + '&format=json&countrycodes=gb&limit=5&addressdetails=1')
    .then(function(r) { return r.json(); })
    .then(function(results) {
      if (!results.length) {
        resultsEl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.4);">No results found</div>';
        return;
      }
      resultsEl.innerHTML = results.map(function(r) {
        var displayFirst = (r.display_name || '').split(',')[0].trim();
        var name = formatUkLocationLabel(r.address || {}, displayFirst) || displayFirst || 'Location';
        var enc = encodeURIComponent(name);
        var tip = r.display_name ? ' title="' + diaryEscAttr(r.display_name) + '"' : '';
        return '<div tabindex="0" role="button" data-fl-action="pinmap-select" data-lat="' + r.lat + '" data-lng="' + r.lon + '" data-place-name="' + enc + '" '
          + tip
          + ' style="padding:10px 14px;font-size:12px;color:white;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);">'
          + '<div style="font-weight:600;">' + diaryEscHtml(name) + '</div>'
          + '</div>';
      }).join('');
    })
    .catch(function() {
      resultsEl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:rgba(255,255,255,0.4);">Search failed or timed out — check connection</div>';
    });
}

function pinmapSelectResult(lat, lng, name) {
  document.getElementById('pinmap-search-results').style.display = 'none';
  document.getElementById('pinmap-search').value = name;
  if (pinMap) {
    pinMap.setView([lat, lng], 14);
  }
}


function openPhotoLightbox(url) {
  var lb = document.getElementById('photo-lightbox');
  var img = document.getElementById('photo-lightbox-img');
  img.src = url;
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closePhotoLightbox() {
  document.getElementById('photo-lightbox').style.display = 'none';
  document.getElementById('photo-lightbox-img').src = '';
  document.body.style.overflow = '';
}

