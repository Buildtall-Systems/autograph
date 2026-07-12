# autograph — work log

## 2026-07-12

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
