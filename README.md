# autograph

A browser extension for sovereign identity on the web. Firefox and Chromium.

The first delivered feature is a NIP-07 signer: web applications request
signatures via `window.nostr`, and autograph signs on the user's behalf with
keys that never leave the extension. From there it grows into an interface to
the personal ontology — adding content to lists of lists and viewing it.

## Status

Phase 1 (toolchain and scaffold) in progress on `feature/nip07-signer`.

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
