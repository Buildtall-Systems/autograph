# autograph

A browser extension for sovereign identity on the web. Firefox and Chromium.

The first delivered feature is a NIP-07 signer: web applications request
signatures via `window.nostr`, and autograph signs on the user's behalf with
keys that never leave the extension. From there it grows into an interface to
the personal ontology — adding content to lists of lists and viewing it.

## Status

Pre-implementation. Research and planning in progress.

## Roadmap

1. **NIP-07 signer** — `window.nostr` provider (`getPublicKey`, `signEvent`,
   `getRelays`, NIP-04/NIP-44 encryption), per-origin permission grants,
   local key storage.
2. **List of lists** — capture content from the browser into kind 30101
   lists of lists and NIP-51 leaf lists; browse and read the collected
   content.

## License

MIT — see [LICENSE](LICENSE).
