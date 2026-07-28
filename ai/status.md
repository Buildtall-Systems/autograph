# autograph — work log

## 2026-07-28

- operations#53 Phase 4 CWS submission: operator registered the Chrome
  Web Store developer account and uploaded
  `.output/autograph-0.2.1-chrome.zip` via "+ New item". Privacy
  practices completed from docs/store-listing.md: single purpose,
  justifications for storage, clipboardWrite, and host permissions, "no
  remote code", empty data-collection matrix with all three
  certifications, privacy policy URL
  https://buildtall.systems/autograph/privacy; publisher contact email
  verified on the Settings page; 440x280 small promo tile attached.
  Submitted for review, visibility public (the console offered no
  publish-mode choice at submission; current CWS publishes automatically
  after review unless deferred publishing is pre-enabled). Awaiting CWS
  review. Remaining: record the item ID and store URL for Phase 5.

  Also received the AMO auto-approval email for unlisted 0.2.1.1
  ("automatic validation"); the listed 0.2.1 review is still pending,
  and the public AMO page still answers 401 via the API, confirming no
  public listing yet.

- operations#53 Phase 3 parity release: operator ran `make sign` (AMO
  signed the unlisted 0.2.1.1 into `dist/`) and published the signed
  `.xpi` through the /admin/releases page (Blossom upload plus kind
  1063/30063 events; release notes state parity, no functional changes
  since 0.1.3). Prod verified: `/autograph/updates.json` serves 0.2.1.1
  with `update_hash` sha256:9839b8e1eb0ef158017e3eb66c0afee26f798ea540
  36d306930fd9cda6f1ae64 and a Blossom `update_link`;
  `/autograph/install` answers 200 `application/x-xpinstall`; the served
  `.xpi`'s sha256 matches the advertised hash, its manifest reads
  0.2.1.1 with `update_url` back at updates.json, and META-INF
  signature files confirm the AMO-signed build. Remaining in #53: AMO
  review of listed 0.2.1 (operator watches email), Phase 4 CWS
  registration and submission, Phase 5 copy flip after both listings
  are live.

- operations#53 Phase 3 AMO submission: the first upload of the listed
  0.2.0 artifact went to the self-distribution channel (the new-version
  flow inherits the add-on's existing channel and never showed a chooser);
  AMO auto-signed it and the version number is permanently consumed.
  Recovery: operator deleted the stray 0.2.0 in the Developer Hub; version
  bumped to 0.2.1 (listed/CWS) with 0.2.1.1 unlisted parity; artifacts
  rebuilt and divergence re-asserted; docs/store-listing.md and README
  version references updated. Resubmitted via the explicit listed-channel
  route (/versions/submit/upload-listed, verified against addons-server
  urls.py): validation passed (0 errors, 1 warning), sources zip attached,
  listing fields entered from docs/store-listing.md, slug `autograph-nostr`
  (`autograph` taken; public URL
  addons.mozilla.org/firefox/addon/autograph-nostr), icon 128 uploaded,
  three captioned screenshots added, listing saved. Status: Version
  Submitted, awaiting AMO review/publication. Firefox for Android left
  unticked: the prompt and unlock flows depend on browser.windows.create,
  absent on Android.

- operations#53 Phase 3 screenshots: three store screenshots captured at
  1280x800 dark theme into `assets/store/` (unlock flow, approval prompt
  over npub.dev, options page), operator-approved. Capture method: headless
  Firefox driven over raw WebDriver (geckodriver, curl+jq), the 0.2.0
  listed `.xpi` installed as a temporary add-on, throwaway vault and
  generated key in a temp profile; prompt flow exercised end to end
  (postMessage through content script to background, prompt window, 1 hour
  grant). Compositing with ImageMagick; driver scripts in gitignored
  `scratch/shots/`.

- operations#53 Phase 3 repo side (AMO listed submission prep) on
  `feature/store-listings`: version bumped 0.1.3 to 0.2.0 (minor; the
  listing milestone takes the minor bump, 0.1.3 is consumed on the unlisted
  channel). New `docs/store-listing.md` holds every console field for both
  stores: identity, proposed AMO slug `autograph`, summary and full
  description, categories (Privacy & Security both stores), AMO reviewer
  notes (plain-npm build, no remote code, no network requests), CWS single
  purpose, per-permission justifications (`storage`, `clipboardWrite`,
  content script `<all_urls>`, `web_accessible_resources`), data-use
  declarations, privacy policy URL, imagery inventory with screenshot shot
  list. New `assets/store-promo.svg` composes the 440x280 CWS small promo
  tile from `assets/icon.svg`; new Makefile `tile` target renders it to
  `assets/store/promo-440x280.png` (committed). Artifacts rebuilt:
  `dist/autograph-0.2.0-listed.xpi` + sources zip,
  `.output/autograph-0.2.0-chrome.zip`, unlisted firefox at 0.2.0.1.
  Verified: lint/test/build green; manifest divergence asserted on built
  output (listed 0.2.0 no update_url; unlisted 0.2.0.1 with update_url;
  chrome 0.2.0). Remaining Phase 3 is operator choreography: Developer Hub
  listed upload + sources zip + listing fields + slug, screenshots, then
  `make sign` 0.2.0.1 and the admin-page parity release.

- operations#53 Phase 1 (dual-channel build machinery) on
  `feature/store-listings`: `lib/dist.ts` gains Channel type,
  `AUTOGRAPH_CHANNEL` parsing (default unlisted), and `unlistedVersion`
  (canonical + fourth segment `.1`, because AMO consumes version numbers per
  add-on across channels); the vestigial `buildUpdatesManifest`/`xpiUrl` and
  `scripts/gen-updates.ts` are gone (live updates.json is the monorepo's
  dynamic handler). `wxt.config.ts` manifest factory is channel-aware:
  listed firefox build drops `update_url` and keeps the canonical version;
  unlisted keeps `update_url` and stamps the suffixed version; chrome-mv3
  untouched. Makefile: `build-listed`, `zip-listed` (listed .xpi + sources
  zip into dist/), `release` re-choreographed (bump, zip-listed, build, zip,
  sign), `updates` target deleted. README: three-channel release model,
  version scheme, plain-npm reviewer build instructions (Node 24). Verified:
  lint/test/build green; built manifests assert listed (0.1.3, no
  update_url), unlisted (0.1.3.1 + update_url), chrome (0.1.3, no gecko);
  listed xpi + sources zip land in dist/ and the sources zip carries the
  README build instructions.

## 2026-07-12

- Phase 5 (packaging + self-hosted distribution) implemented, gates green.
  Operator verified Phase 4 on both browsers (options live-update + Chromium
  parity) → committed `073120d`. Distribution decision: signed `.xpi` +
  `updates.json` served from `https://buildtall.systems/autograph/` (new
  `locations."/autograph/"` carve-out on the existing vhost, alias to
  /var/www/autograph — nginx change pending in monorepo deploy config).
  Single source for distribution literals: `lib/dist.ts` (ADDON_ID
  autograph@buildtall.systems, strict_min_version 128.0, base URL,
  buildUpdatesManifest) — imported by wxt.config.ts, the generator, and
  tests. wxt.config.ts manifest is now a per-browser function: gecko
  id/strict_min_version/update_url in the firefox-mv2 build only (verified
  in built manifests: present in firefox, zero gecko refs in chrome-mv3).
  `scripts/gen-updates.ts` emits dist/updates.json with versioned
  update_link (autograph-<version>.xpi — versioned names, not a mutable
  stable name, so update round-trips can't be defeated by caches); runs on
  bare node 24 type-stripping (tsconfig gains allowImportingTsExtensions).
  Makefile: `sign` (web-ext sign --channel unlisted, WEB_EXT_API_KEY/SECRET
  from operator env, never in-repo), `updates`, `release` (npm version
  $(BUMP) --no-git-tag-version + build + zip + sign + updates). web-ext
  ^10.5.0 devDependency. README: installation (Firefox signed/self-updating,
  Chromium unpacked), release choreography. Remaining (operator-gated): AMO
  credentials for first signing, nginx carve-out + /var/www/autograph on
  prod, then the four manual distribution verifications from the plan.

- Customer-zero gate feedback: the options page went stale when grants were
  added (background writes on prompt approval) or revoked until manually
  refreshed. Fixed event-driven, no polling: the page now subscribes to
  browser.storage.onChanged and re-renders when any of its render sources
  change — `profiles`, `activePubkey`, `vaultMeta` (local) or
  `vaultSession` (session); the storage-key constants are now exported from
  lib/profiles.ts and lib/vault.ts (vault keys renamed to
  VAULT_META_STORAGE_KEY / VAULT_SESSION_STORAGE_KEY on export). Renders
  are serialized through a promise chain so a change event arriving
  mid-render cannot interleave two rebuilds. The manual
  `.then(() => render())` refresh chains after each mutation were removed —
  onChanged fires in the writing context too, so the watcher is the single
  refresh path; error handling at each call site kept (and tightened:
  delete/revoke/switch now surface failures instead of assuming success).
  Bonus of the same mechanism: lock/unlock/vault-creation from another
  page or the background now update an open options page live. Gates green.

- Phase 4 (UI: prompt, popup, options, unlock) implemented, gates green,
  awaiting the customer-zero manual gate. New internal UI message protocol
  (`lib/ui-messages.ts`: answerPrompt / unlock / createVault / lock, guarded
  by isUiMessage) handled in the background beside the three-hop listener —
  prompt answers must reach the background because the approval resolvers
  live in its memory; the listener honors UI messages only from
  extension-origin senders. Prompt-queue storage helpers extracted to
  `lib/prompts.ts` (pages read the queue without importing the background
  entrypoint); QueuedPrompt gains an optional signEvent detail (kind +
  200-char content preview). Locked-vault path now opens `/unlock.html` in
  an on-demand window mirroring the prompt-window machinery (shared outcome
  for concurrent waiters, close-as-reject, storage.local `unlockRequest`
  record); createVault serves the first-run flow. Fixed a latent
  answerPrompt defect: an invalid custom duration used to throw after the
  queue entry was removed but before the requester settled, stranding the
  page request forever — grant construction now happens inside the queue
  lock before dequeuing. Pages are plain-TS DOM over `components/`
  (dom.ts el helper, theme.ts data-theme in storage.local with
  onChanged live-apply, format.ts view-model: truncateMiddle,
  capability/condition labels, parseDurationInput, grantExpiryLabel).
  Prompt page renders queued cards with once/5m/1h/8h/custom/forever/deny;
  popup shows vault state + lock-now, active profile with copyable npub,
  profile switcher, options link; options page (open_in_tab) has vault
  create/lock/unlock, auto-lock minutes, change-passphrase (rewraps every
  profile key via changePassphrase + replaceEncryptedKey), profile CRUD
  (generate, import hex/nsec, rename, export nsec behind reveal/hide,
  delete with confirm), wss://-validated relay editor with read/write
  toggles, permission table with revoke, theme toggle. autographDevSeed
  and the placeholder prompt page are gone. clipboardWrite permission
  added for the copyable npub. 40 new tests (149 total): ui-message
  guards, prompt/unlock storage, format view-models, handleUiMessage
  integration (grant persisted, invalid-duration regression, unlock
  completes a waiting sign, wrong passphrase leaves it waiting, lock),
  and the round-trip suite now proves sign-after-unlock-on-demand
  end-to-end plus dismissed-unlock-window rejection.

- Phase 3 (provider, relay, background dispatch) implemented: the NIP-07
  pipeline works end-to-end mechanically. `entrypoints/nostr-provider/`
  (defineUnlistedScript: window.nostr with getPublicKey/signEvent/getRelays/
  nip04.*/nip44.*, pending-promise map keyed by crypto.getRandomValues ids,
  factory form so correlation logic tests without a DOM),
  `entrypoints/autograph.content/` (ISOLATED, <all_urls>, document_end,
  injectScript('/nostr-provider.js'), relays page→background with
  location.host stamped by the content script, responds to message.origin),
  `entrypoints/background/` (dispatch table keyed by capability with
  per-entry needsSecret so getPublicKey/getRelays skip the vault; flow =
  grant → prompt → unlocked vault → execute via withSecretKey; prompt queue
  persisted in storage.local with host+capability dedup, single popup
  window, close-as-reject, mutex-guarded queue writes; answerPrompt stores
  grants per condition, 'single' never persisted, 'no' persists a deny; no
  onMessageExternal). lib/protocol.ts gains newRequestId + message/param
  type guards shared by all three hops. wxt.config.ts declares
  web_accessible_resources (MV3 object form). Placeholder
  entrypoints/prompt/index.html added beyond the plan's file list —
  windows.create needs a real typed page target; Phase 4 replaces it.
  Phase-3 scaffolding to remove in Phase 4: background console helper
  `autographDevSeed(passphrase, host)` seeds vault + generated profile +
  forever grant for manual checks. 52 new tests (109 total) including the
  full provider→relay→background round-trip asserting a verified signature.
  Learned: WXT rejects flat entrypoint files sharing a name with test
  siblings — directory entrypoints (index.ts + tests alongside) are the
  sanctioned form; WXT 0.20 ships no polyfill, so the background onMessage
  listener must use native sendResponse + `return true` (a returned Promise
  is polyfill-only), while fakeBrowser models only the polyfill convention —
  integration tests bridge with an adapter listener and the native path
  lands in the manual browser check. All gates green.
- Manual verification: operator seeded a grant via autographDevSeed in the
  background inspect console (dev-firefox) and confirmed
  `window.nostr.getPublicKey()` on drss.io resolves the seeded pubkey.
  First attempt failed with ReferenceError because the helper was invoked
  from the global Browser Console — the helper exists only in the extension
  background's own console (about:debugging → Inspect). The failed attempt
  itself proved the pipeline: `autograph: no active profile` originated in
  background dispatch and propagated back through relay and provider.

- Phase 2 (core domain modules) implemented: lib/protocol.ts (capability
  names, message envelopes), lib/permissions.ts (ladder 1/5/10/20, grant
  conditions forever/5m/1h/8h/custom/single/no, expiry + pruning),
  lib/vault.ts (AES-GCM-256 + PBKDF2-SHA256 600k, verifier blob,
  storage.session unlock cache with lazy auto-lock deadline, passphrase
  change rewraps blobs, no plaintext-at-rest path), lib/profiles.ts
  (multi-profile CRUD keyed by hex pubkey, active pointer with successor
  promotion, wss://-only relays, per-profile grants with persisted pruning),
  lib/nostr.ts (nostr-tools 2.23.9 boundary: finalize+verify with pubkey
  guard, nip04 legacy, nip44 with zeroed LRU conversation-key cache, nip19,
  withSecretKey zeroing helper). 57 unit tests. tsconfig gains
  noUncheckedIndexedAccess. All gates green.

- Project inaugurated. Standalone repository (not part of the monorepo) at
  `projects/autograph`, published to `Buildtall-Systems/autograph`, MIT
  license, git-flow (master/develop).
- Scope settled: browser extension, Firefox first with Chromium support from
  the start. Phase one is a solid NIP-07 signer; subsequent phases turn the
  extension into an interface for adding content to lists of lists and
  viewing it.
- Reference implementation designated: nos2x-fox
  (https://github.com/diegogurpegui/nos2x-fox) — functionality only. Look
  and feel follows the buildtall iceberg dark/light themes, not nos2x.
- Research phase complete and approved. Documents:
  `thoughts/research/2026-07-12_08-32-24_autograph-nip07-browser-extension.md`
  (+ `-synthesis.md`). nos2x-fox cloned to `ai/context/nos2x-fox/` and
  registered; WXT + webextension-polyfill added to the Context7 index.
- Recommended and approved approach: WXT (one TS codebase, Firefox MV2 +
  Chromium MV3 builds), nos2x-fox mechanics as functional spec (three-hop
  relay, capability ladder, per-origin expiring grants), nostr-tools for all
  crypto, plain TS + Tailwind v4 iceberg tokens + vendored Avenir Next UI.
- Design decisions resolved by operator: keys encrypted-at-rest by DEFAULT
  (passphrase, not opt-in PIN); distribution self-hosted first (AMO unlisted
  signing + self-hosted .xpi update feed, Chromium dev-mode); FULL
  multi-profile support in phase 1; modern Firefox floor (declarative
  MAIN-world injection, ~128+, pin exact version at plan time).
- Phase 1 (toolchain and scaffold) implemented on `feature/nip07-signer`:
  flake.nix devShell (node 24.18.0), WXT 0.20.27 scaffold (vanilla template,
  demo debris removed), ESLint 10 strictTypeChecked + Prettier + tsc, vitest
  4 + WxtVitest + fakeBrowser smoke test, Tailwind v4 via @tailwindcss/vite,
  iceberg @theme copied verbatim from monorepo canon, AvenirNextLTPro
  {Regular,Bold,It,Demi} vendored, Makefile (help/lint/fmt/test/build/dev/
  dev-firefox/zip), README dev-loop docs. All gates green: make lint, test,
  build (chrome-mv3 + firefox-mv2). Noted: npm audit reports 8 dev-time
  vulnerabilities all inside wxt's web-ext-run dev chain (not shipped code;
  only "fix" is a wxt downgrade — declined); monorepo fonts.css declares
  family 'Avenir Next' while @theme uses 'AvenirNextLTPro', and references
  two font files that don't exist (drift in monorepo, not touched).
- Manual verification: operator loaded dev-firefox; popup renders
  buildtall-dark ("autograph / NIP-07 signer"). scratch/ template debris
  removed by operator (was breaking Vite dependency scan); all gates re-run
  green. Phase 1 accepted pending Chromium spot-check.
- CORRECTION (operator): theme must come from btk, not drss-legacy
  (deprecated). Re-sourced verbatim from
  `projects/buildtall-users/btk/themes/buildtall/assets/main.css` — token
  namespace `--color-dark-*`, richer semantic set (surface, primary-hover,
  border, error-*), theme IDs `buildtall-dark`/`buildtall-light`, system
  sans-serif stack. Vendored Avenir fonts REMOVED (btk theme has none).
- Plan written:
  `thoughts/plans/2026-07-12_08-54-16_autograph-nip07-signer.md` — 5 phases
  (toolchain/scaffold, core domain modules, provider+relay+background, UI,
  packaging+self-hosted distribution). Zero open questions. Injection
  refinement: WXT `injectScript()` + unlisted script on both browsers
  (declarative world:MAIN is Chromium-only). Awaiting plan review.
