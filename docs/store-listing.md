# Store Listings

Source of record for every field entered in the AMO Developer Hub and the
Chrome Web Store developer dashboard. Console entries copy from this file;
change this file first, then the consoles.

## Identity

- **Name**: autograph
- **Add-on id (Firefox)**: `autograph@buildtall.systems`
- **Version (this submission)**: 0.2.0 listed and Chrome Web Store; 0.2.0.1
  unlisted parity release on the self-hosted channel
- **Homepage**: <https://buildtall.systems/autograph/>
- **Support**: <https://github.com/Buildtall-Systems/autograph/issues>
- **Privacy policy URL**: <https://buildtall.systems/autograph/privacy>
- **License**: MIT

## Slug (AMO)

Proposed public slug: `autograph`. Set in the Developer Hub before the first
listed publication; the current auto-generated slug is
`bd20a5d1f1544cc2b922`. If `autograph` is taken, the operator picks the
fallback. The final public URL feeds the Phase 5 copy flip.

## Summary

AMO summary (250 character limit) and CWS short description (132 character
limit), identical text, taken from the package.json description:

> NIP-07 signer for sovereign identity: sign Nostr events without your keys
> ever leaving the extension.

## Full Description

AMO "About this extension" and CWS "Description":

> autograph is a browser extension for sovereign identity on the web.
>
> It implements NIP-07, the Nostr signing interface. Web applications
> request signatures through window.nostr, and autograph signs on your
> behalf with keys that never leave the extension. Your keys live in the
> extension, never on a website: sites request signatures, you approve
> them.
>
> Features:
>
> - window.nostr provider: getPublicKey, signEvent, getRelays, and NIP-04
>   and NIP-44 encryption
> - multi-profile vault with keys encrypted at rest
> - per-origin permission grants with expiry
> - approval prompt for every new origin, popup for day-to-day status, and
>   an options page for profile management
>
> autograph collects no data and makes no network requests. Everything
> stays in your browser.

## Categories

- **AMO**: Privacy & Security
- **CWS**: Privacy & Security

## AMO Reviewer Notes

- Build from the submitted sources zip with Node 24 and npm: `npm ci`, then
  `npx wxt build -b firefox` (output in `.output/firefox-mv2/`). The
  `README.md` inside the zip carries the same instructions.
- The bundle contains only declared npm dependencies; `nostr-tools` is the
  sole runtime dependency. There is no code generation outside WXT, no
  remote code, and no eval.
- The extension makes no network requests. Private keys are generated or
  imported locally, encrypted at rest, and never leave the device.
- The listed build carries no `update_url`. Self-distribution continues on
  the unlisted channel under the same add-on id with a four-segment version
  (listed 0.2.0, unlisted 0.2.0.1).

## CWS Single Purpose

> autograph signs Nostr events in the browser. It provides the window.nostr
> (NIP-07) interface so web applications can request the user's public key,
> event signatures, and NIP-04/NIP-44 encryption, with the private keys
> held inside the extension.

## Permission Justifications

- **storage**: persists the encrypted key vault, profile metadata, and
  per-origin permission grants in extension storage. Nothing is
  transmitted anywhere.
- **clipboardWrite**: copies the user's public key (npub) to the clipboard
  when the user clicks a copy button in the popup or the options page.
- **Content script on `<all_urls>`**: any website may be a Nostr client, so
  the NIP-07 provider (window.nostr) must be available on every origin. The
  content script bridges request and response messages between the page and
  the extension; it does not read or modify page content.
- **web_accessible_resources `nostr-provider.js` on `*://*/*`**: the
  page-world script that defines window.nostr, injected by the content
  script on the same open-ended set of origins.

## Data Use (CWS Privacy Practices)

- The extension collects no user data. All state (keys, profiles,
  permission grants) is local to the browser profile. No telemetry, no
  analytics, no remote endpoints.
- Certifications: data is not sold to third parties; data is not used or
  transferred for purposes unrelated to the single purpose; data is not
  used or transferred to determine creditworthiness or for lending
  purposes.

## Imagery

- **Icon**: 128 px PNG at `public/icon/128.png`, rasterized from
  `assets/icon.svg` (`make icons`).
- **CWS small promo tile**: 440x280 PNG at
  `assets/store/promo-440x280.png`, rendered from `assets/store-promo.svg`
  (`make tile`).
- **Screenshots**: 1280x800, dark theme (`buildtall-dark`), stored in
  `assets/store/`. Shot list:
  1. `screenshot-1-unlock.png`: popup in the locked state / unlock flow
  2. `screenshot-2-approval.png`: approval prompt over a real site
  3. `screenshot-3-options.png`: options page, profile management
