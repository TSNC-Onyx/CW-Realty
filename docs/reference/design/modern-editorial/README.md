# Modern Editorial — frozen reference (Theme C)

Snapshot of the owner-approved design screens from 2026-09-25, kept to prevent design drift. The binding rules are `docs/constitution/02-style-ui-ux.md` §11; where these files and §11 differ, §11 wins. Change these files only together with an owner-approved change to §11.

| File | What it is |
|---|---|
| `index.html` | Start here: all three screens side by side with numbered explanations tied to §11, plus known differences |
| `desktop-home.html` / `.png` | Home page at 1440px |
| `mobile-home.html` / `.png` | Home page at 390px, including the fixed Call / Text / Chat bar |
| `components-messages-content.html` / `.png` | Colors, type, buttons in every state, messages, form states, page formatting, empty state, AI chat, cookie banner, mobile menu, mobile error and success screens |
| `cwr-logo.png` | Round logo with a transparent background (cropped from `docs/reference/brand/CWR-Image-Refresh.png`) |
| `canvas-source/` | The original design-canvas files, for re-importing into the live canvas |

The `.html` files open in any browser (fonts load from Google Fonts). The `.png` files are exact full-size captures and need no internet.

Live canvas (private to the owner): https://claude.ai/artifact/LJhgevhUqm32iyS6pksRnP

## Known differences from §11

- Hero lead text is 19px desktop / 17px mobile on the screens; §11.2 sets 20px / 18px.
- The name field shows "Looks good" without a prior error; §11.11 allows it only after an error is fixed.
- The desktop header does not draw the current-page underline or the desktop "Chat with us" launcher (§11.9, §11.13).
- Bracketed text (`[PRICE]`, `[PHONE]`, `[Status]`, `[Role]`) is placeholder content, not a design choice.
