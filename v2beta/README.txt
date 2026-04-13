First Light — static deploy bundle for beta testing
====================================================

Upload the CONTENTS of this folder (not the folder name itself, unless you want /v2beta/v2beta/) to:

  https://firstlightdeer.co.uk/v2beta/

So that these URLs work:
  /v2beta/              -> index.html
  /v2beta/diary.html
  /v2beta/sw.js

Paths in HTML, manifests, and the service worker are relative — they resolve under /v2beta/ automatically.

Requires HTTPS for the service worker and PWA features.

Not included: SQL under scripts/, local preview HTML files, Cursor config.
