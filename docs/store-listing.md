# Store Listings

Source of record for every field entered in the AMO Developer Hub and the
Chrome Web Store developer dashboard. Console entries copy from this file;
change this file first, then the consoles.

## Identity

- **Name**: autograph
- **Add-on id (Firefox)**: `autograph@buildtall.systems`
- **Version (this submission)**: 0.2.1 listed and Chrome Web Store; 0.2.1.1
  unlisted parity release on the self-hosted channel. (0.2.0 is burned: it
  was submitted to the self-distribution channel by mistake, and AMO never
  frees version numbers.)
- **Homepage**: <https://buildtall.systems/autograph/>
- **Support**: <https://github.com/Buildtall-Systems/autograph/issues>
- **Privacy policy URL**: <https://buildtall.systems/autograph/privacy>
- **License**: MIT

## Slug (AMO)

Public slug: `autograph-nostr`, set during the 0.2.1 listed submission
(`autograph` was already taken). Public URL:
<https://addons.mozilla.org/firefox/addon/autograph-nostr>. This URL feeds
the Phase 5 copy flip.

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
> - approval prompt for every new origin, opening as a window on desktop and
>   as a tab on Firefox for Android, with a popup for day-to-day status and
>   an options page for profile management
> - desktop and mobile: Firefox, Firefox for Android, and Chromium, from one
>   codebase with the same approval semantics on each
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
  (listed 0.2.1, unlisted 0.2.1.1).
- Version floors: `140.0` for desktop and `142.0` for Android, which are the
  first releases on each platform that support
  `data_collection_permissions`. The extension declares
  `required: ["none"]`, because it collects and transmits nothing: keys are
  generated or imported locally, signing happens inside the extension, and
  the only data leaving it goes to the requesting page in the same browser.
- Android support: the manifest declares `gecko_android`, which is what makes
  AMO list for Android. Firefox for Android provides no `windows` API,
  so the approval prompt and the unlock page are opened with `tabs.create`
  there and with `windows.create` on desktop. The choice is made by feature
  detection at runtime, not by build target, and both paths carry identical
  semantics: closing the surface denies every request it was holding,
  observed through `tabs.onRemoved` and `windows.onRemoved` respectively.

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
- **Screenshots (desktop)**: 1280x800, dark theme (`buildtall-dark`), stored
  in `assets/store/`. Shot list:
  1. `screenshot-1-unlock.png`: popup in the locked state / unlock flow
  2. `screenshot-2-approval.png`: approval prompt over a real site
  3. `screenshot-3-options.png`: options page, profile management
- **Screenshots (Android)**: portrait, dark theme (`buildtall-dark`), stored
  alongside the desktop set in `assets/store/`. Not yet captured. The same
  three scenes as the desktop set, so AMO can show the mobile surface for
  each:
  1. `screenshot-android-1-unlock.png`: unlock page as a tab
  2. `screenshot-android-2-approval.png`: approval prompt as a tab
  3. `screenshot-android-3-options.png`: options page, profile management

  Capture on a physical device, not on an emulator. `adb exec-out screencap
  -p` works against the `buildtall` AVD and yields 1280x2856, but Firefox on
  that AVD reports `pointer: fine` and renders the base sizing rather than
  the coarse treatment, so emulator shots would show desktop-sized controls
  and misrepresent the mobile UI.
