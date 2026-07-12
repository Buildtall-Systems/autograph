# autograph — context registry

Registry of external context sources for this project. Consult before using
any library, API, or tool for the first time in a session. Context7 IDs and
clones live in the meta-repo registry (`../../ai/context.md`); this file maps
autograph's dependencies to those entries.

## Registered

| Library Name Searched | Context7 ID        | Local Reference Path (meta-repo)   |
|-----------------------|--------------------|------------------------------------|
| nos2x-fox             |                    | ai/context/nos2x-fox/              |
| nostr-nips            | /websites/e2encrypted | ai/context/nips/                |
| nostr-tools           | /nbd-wtf/nostr-tools | ai/context/nostr-tools/          |
| wxt                   | /wxt-dev/wxt       |                                    |
| webextension-polyfill | /mozilla/webextension-polyfill |                        |

Notes:
- **nos2x-fox** is the functional reference only; UI look and feel is NOT
  adopted (autograph uses the buildtall iceberg dark/light themes).
- Theme canon: **btk** — `projects/buildtall-users/btk/themes/buildtall/`
  (`assets/main.css` copied verbatim into `assets/css/main.css` here;
  theme IDs `buildtall-dark` default / `buildtall-light` from `theme.go`).
  drss-legacy is deprecated — never source theme or fonts from it.
