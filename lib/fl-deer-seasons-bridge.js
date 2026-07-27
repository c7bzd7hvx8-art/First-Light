// Bridges lib/fl-deer-seasons.js — the single statutory source for UK deer
// close seasons — onto the global, because app.js is a classic script and
// cannot import an ES module.
//
// This must stay an external file. The Content-Security-Policy in index.html
// is script-src 'self' with no 'unsafe-inline', so an inline <script
// type="module"> doing the same job is silently refused: the page loads, no
// exception reaches app.js, and every season row and badge quietly falls back
// to the static markup. That failure is invisible in a screenshot, so
// tests/fl-deer-seasons.test.mjs now asserts index.html carries no inline
// script at all.
//
// A module script is deferred by default, so this runs after parsing but
// before DOMContentLoaded, which is when app.js initialises. The event is a
// belt-and-braces re-render for any browser that orders the two differently.
//
// It also bridges lib/fl-deer-law.js, for the same reason and by the same
// route. app.js needs LAW_VERIFIED_ON to date the legal-times tab, and adding
// a second one-line bridge file would mean a second module fetch and a second
// sw.js precache entry for one constant.
import * as FLDeerSeasons from './fl-deer-seasons.js';
import * as FLDeerLaw from './fl-deer-law.js';

window.FL_DEER_SEASONS = FLDeerSeasons;
window.FL_DEER_LAW = FLDeerLaw;
document.dispatchEvent(new CustomEvent('fl-deer-seasons-ready'));
