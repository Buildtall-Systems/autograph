# autograph

A browser extension for sovereign identity on the web. Firefox and Chromium.

The first delivered feature is a NIP-07 signer: web applications request
signatures via `window.nostr`, and autograph signs on the user's behalf with
keys that never leave the extension. From there it grows into an interface to
the personal ontology — adding content to lists of lists and viewing it.

## Status

NIP-07 signer implemented on `feature/nip07-signer`: `window.nostr` provider,
multi-profile vault with keys encrypted at rest, per-origin permission grants
with expiry, prompt/popup/options/unlock UI.

## Installation

### Firefox (signed, self-updating)

Download the signed `.xpi` from
`https://buildtall.systems/autograph/` and open it with Firefox (File →
Open, or drag it onto a window); confirm the install prompt. The extension
carries an `update_url` pointing at
`https://buildtall.systems/autograph/updates.json`, so Firefox checks for
and applies new versions automatically (or on demand via
`about:addons` → gear menu → Check for Updates).

### Chromium (unpacked, developer mode)

Chromium installs run from a local build:

1. `make build`
2. `chrome://extensions` → enable Developer mode → Load unpacked →
   select `.output/chrome-mv3/`

Unpacked installs do not auto-update; rebuild and reload to upgrade.

### Building from source

`make build` produces both targets under `.output/` (requires Nix; the
devShell provides Node). See Development below for temporary loading
during development.

## Release

The add-on's AMO listing (unlisted channel) is managed at
<https://addons.mozilla.org/en-US/developers/addon/bd20a5d1f1544cc2b922/versions>
— signing status, submitted versions, and signed-file downloads live there
(AMO slug `bd20a5d1f1544cc2b922`, addon id `autograph@buildtall.systems`).

### Credentials

Signing needs AMO API credentials, supplied to `web-ext sign` from the
system keyring via [secretspec](https://secretspec.dev). Set them once per
machine (the devShell provides the `secretspec` binary):

```
secretspec set WEB_EXT_API_KEY --provider keyring
secretspec set WEB_EXT_API_SECRET --provider keyring
```

`make sign` runs `web-ext sign` under `secretspec run --provider keyring`,
which injects the two values as environment variables for the duration of
the command. The declared secrets live in `secretspec.toml`; the values
never touch the repo or the shell environment.

### Signing

`make release` bumps the version (`BUMP=patch|minor|major`, default patch),
builds and zips both targets, and submits the Firefox build for AMO
unlisted signing. AMO returns the signed `.xpi` into `dist/`.

### Publication

Distribution is content-addressed: the signed `.xpi` is uploaded to a
Blossom server (addressed by its SHA-256 hash) and announced by two signed
Nostr events — a NIP-94 file-metadata event (kind 1063) and an addressable
release event (kind 30063) that carries the current version. Publication is
performed from the buildtall.systems admin releases page, which signs the
events with the operator's key via NIP-07:

1. Run `make release BUMP=patch|minor|major` here; AMO signs the `.xpi`
   into `dist/`.
2. Open the admin releases page on `buildtall.systems`, select the
   **autograph** app, and upload the signed `.xpi`. The page stores the
   blob on Blossom and publishes the kind 1063 and kind 30063 events.

Firefox update checks hit `https://buildtall.systems/autograph/updates.json`,
served by a dynamic handler that derives the manifest — including the
`update_link` (the raw Blossom blob URL) and the `update_hash`
(`sha256:<hash>`) — from the published release events. No monorepo commit,
no `deploy-prod`, and no hand-placed host files are part of a release;
installed Firefox profiles pick up the new version on their next update
check.

## Development

Tooling runs inside the Nix devShell; the Makefile wraps everything:

```
make help          list targets
make dev-firefox   dev mode with live reload (Firefox)
make dev           dev mode (Chromium)
make lint          eslint + prettier + typecheck
make test          vitest
make build         production build of both targets
```

Built extensions land in `.output/`. To load temporarily:

- **Firefox**: `about:debugging` → This Firefox → Load Temporary Add-on →
  `.output/firefox-mv2/manifest.json`
- **Chromium**: `chrome://extensions` → enable Developer mode → Load
  unpacked → `.output/chrome-mv3/`

The stack is WXT (one TypeScript codebase, Firefox MV2 + Chromium MV3
builds), nostr-tools for all cryptography, and Tailwind CSS v4 with the
btk buildtall theme tokens (`buildtall-dark` default, `buildtall-light`).

## Roadmap

1. **NIP-07 signer** — `window.nostr` provider (`getPublicKey`, `signEvent`,
   `getRelays`, NIP-04/NIP-44 encryption), per-origin permission grants,
   local key storage.
2. **List of lists** — capture content from the browser into kind 30101
   lists of lists and NIP-51 leaf lists; browse and read the collected
   content.

## License

MIT — see [LICENSE](LICENSE).
