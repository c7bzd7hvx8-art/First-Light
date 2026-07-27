// Calculator bootstrap. Loaded as `<script type="module" src="..."></script>`
// from ballistics.html. Lives here rather than as an inline script because
// ballistics.html's CSP forbids inline execution (`script-src 'self'
// https://cdnjs.cloudflare.com`, no `'unsafe-inline'`) — same posture as
// index.html / diary.html / deerschool.html. An inline `<script type="module">`
// gets blocked with the same CSP violation as any other inline script.
import { initBallisticsUi } from './ballistics-ui.js';
import { LAW_VERIFIED_ON, verifiedOnLabel } from '../lib/fl-deer-law.js';

// The footer disclaimer says the thresholds reflect the law "as encoded at the
// data version shown", which was a promise the strip did not keep — it showed
// an app version and no data date. Stamped from the module so the two cannot
// drift apart.
function stampLawVersion() {
  try {
    const el = document.getElementById('bx-law-verified');
    const label = verifiedOnLabel(LAW_VERIFIED_ON);
    if (el && label) el.textContent = label;
  } catch (e) { /* the strip is provenance, never load-bearing */ }
}

// Surface a helpful message instead of a silent dead shell if init ever throws
// or rejects. The profile-loading path is now validated (audit B4), but a bare
// async init that rejects would otherwise leave a blank, unrecoverable page.
function showInitError(err) {
  console.error('[ballistics] calculator failed to start', err);
  try {
    const msg = '<div class="bx-output-empty">The calculator hit an error starting up. '
      + 'Try reloading the page. If it keeps happening, your saved rifle data may be '
      + 'corrupted — clear this site\'s data in your browser settings and set the rifle up again.</div>';
    const out = document.getElementById('bx-output');
    if (out) out.innerHTML = msg;
    else document.body.insertAdjacentHTML('afterbegin', msg);
  } catch (e) { /* last resort — nothing more we can safely do */ }
}

function boot() {
  stampLawVersion();
  try {
    const maybePromise = initBallisticsUi();
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(showInitError);
    }
  } catch (err) {
    showInitError(err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
