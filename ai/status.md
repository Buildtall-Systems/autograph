# autograph — work log

## 2026-07-12

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
