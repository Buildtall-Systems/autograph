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

`make release` bumps the version (`BUMP=patch|minor|major`, default patch),
builds and zips both targets, submits the Firefox build for AMO unlisted
signing (`web-ext sign`; credentials come from `WEB_EXT_API_KEY` /
`WEB_EXT_API_SECRET` in the operator's environment, never the repo), and
generates `dist/updates.json`. The signed `.xpi` and `updates.json` are then
published to `https://buildtall.systems/autograph/` — the `.xpi` under its
versioned name `autograph-<version>.xpi` as linked from `updates.json`.

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
