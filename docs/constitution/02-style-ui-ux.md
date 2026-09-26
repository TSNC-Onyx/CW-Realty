# Style (UI/UX) Constitution

> Section 2 of 4. Binding for all work in this repo. Supplied by the owner on 2026-09-25; do not edit without owner approval. Section 11 added by owner directive on 2026-09-25. §11.7, §11.9, and §11.13 (admin frame, dark headers, logo) amended with owner approval on 2026-09-25 (`docs/cwr-admin-console-header-redesign-plan.md`).

## 1. Brand Identity

- Palette: black and white base, gold reserved for CTAs, icons, and accents
- Gold text only on black or dark surfaces; gold on white fails WCAG AA contrast
- Serif display font for headings (matches logo), clean sans-serif for body text
- Maximum two font families; use variable fonts to reduce load weight
- Logo always has clear space equal to the height of the house icon
- Imagery: real properties and people, warm natural light, no generic stock

## 2. Readability (WCAG 2.2 AA)

- Body text 16px minimum; line height 1.5 to 1.6
- Line length 45 to 75 characters for comfortable reading
- Contrast 4.5:1 for normal text, 3:1 for large text and UI borders
- Never use color alone to convey meaning; pair it with text or an icon
- Left aligned body text in sentence case; no justified paragraphs
- Size headings with a consistent type scale so hierarchy is obvious at a glance

## 3. Layout and Spacing

- Mobile first design, then enhance for tablet and desktop
- 8px spacing grid; spacing inside a group smaller than between groups
- One primary action per section, placed where the thumb reaches easily
- No horizontal scrolling at 320px width or at 400% zoom
- Reserve space for images to prevent content from shifting
- Cards for listings use the same structure: photo, price, address, key details

## 4. Navigation (NN/g, WAI-ARIA APG)

- Five or fewer top level items; keep primary links visible where possible
- Label menu items with words; icons alone are unclear to many users
- Sticky, compact mobile header between 56px and 64px tall
- Show the current page visually and with aria-current
- Add breadcrumbs on pages three or more levels deep and a consistent footer menu
- Mobile menu traps focus, closes on Escape, and returns focus to its trigger
- Include a skip to content link as the first focusable element

## 5. Touch and Interaction (Apple HIG, Material 3)

- Tap targets 44px minimum with at least 8px between them
- Call and text buttons stay reachable on mobile
- Every control shows hover, focus, active, disabled, and loading states
- Visible focus ring on all controls, never hidden by sticky elements
- No actions that only work on hover or by dragging
- Provide feedback within 100ms of every tap or click

## 6. Forms

- Labels above fields; placeholders are never used as labels
- Correct input types and autocomplete for phone, email, and address
- Single column layout with large, full width submit buttons on mobile
- Validate on blur with clear, specific error messages beside the field
- Ask only for what is needed; never request the same information twice

## 7. Motion

- Transitions between 150ms and 300ms that explain a change of state
- Honor reduced motion settings; nothing flashes more than three times per second
- Animate only transform and opacity to keep scrolling smooth

## 8. Performance (Google Core Web Vitals)

- Largest Contentful Paint under 2.5 seconds
- Interaction to Next Paint under 200ms
- Cumulative Layout Shift under 0.1, all measured at the 75th percentile
- Serve AVIF or WebP images and lazy load anything below the fold
- Preload the hero image and primary font; limit third party scripts

## 9. Content

- Lead with the key point; write short, scannable paragraphs
- Keep mobile paragraphs to three or four lines with clear subheadings
- Plain language, descriptive link text, action verbs on every button
- Every empty state explains what belongs there and the next step to take

## 10. Verification (before every release)

- Test on phones at 320px, 375px, and 768px plus desktop at 1440px
- Complete a full keyboard pass and a screen reader pass with VoiceOver or NVDA
- Confirm Core Web Vitals targets using field data from PageSpeed Insights

## 11. Modern Editorial Design System (binding)

> Chosen by the owner on 2026-09-25. Every public page and component uses these exact values; anything not listed here needs owner approval before use. Reference screens: `docs/reference/design/modern-editorial/` (frozen copy; start with `index.html`) and the live canvas https://claude.ai/artifact/LJhgevhUqm32iyS6pksRnP (Theme C). Where a screen and this section differ, this section wins.

### 11.1 Color tokens

| Token | Hex | Use | Never |
|---|---|---|---|
| `page` | `#FAF8F3` | Main page background | — |
| `surface-soft` | `#F0ECE3` | Alternating sections, resource cards, AI chat replies | — |
| `surface` | `#FFFFFF` | Form fields, panels on `surface-soft` | Page background |
| `ink` | `#141414` | Headings, body text, main button fill on light, card top rules | — |
| `muted` | `#4D4A44` | Secondary text, captions, helper text (8.3:1 on `page`) | Body paragraphs |
| `line` | `#D9D3C7` | Decorative dividers only (1.4:1) | The only edge of a control or field |
| `field-border` | `#6E6A62` | Input borders, dashed empty-state border (5.1:1) | — |
| `dark` | `#121212` | Headers (public, admin, sign-in), admin sidebar, footer, dark bands, callouts, mobile menu, action bar, chat header, status tags, text on gold | — |
| `dark-alt` | `#1E1E1E` | Current item in mobile menu | — |
| `on-dark` | `#FFFFFF` | Text on `dark` | — |
| `on-dark-muted` | `#CFCFCF` | Secondary text on `dark` | — |
| `gold` | `#E6BD35` | Buttons, icons, eyebrow rules, column headings, status dots on `dark` only (10.4:1) | Any light background, as text, fill, or icon (1.7:1) |
| `gold-hover` / `gold-active` | `#F0CD55` / `#C9A227` | Gold button hover / pressed | — |
| `ink-hover` / `ink-active` | `#3A3A3A` / `#000000` | Black button hover / pressed | — |
| `on-dark-hover` | White at 10% | Hover tint on `dark`: secondary buttons and menu links | — |
| `photo-placeholder` | `#DCD5C7` (light) / `#2B2B2B` (dark) | Image space before the photo loads | — |
| `divider-dark` | `#333333` | Dividers on `dark` (`#2A2A2A` between mobile menu items) | — |

Status colors (always with an icon and words, never color alone):

| Status | Text/border/icon | Background tint | Contrast |
|---|---|---|---|
| Success | `#1E6B34` | `#E7F2E7` | 5.7:1 |
| Error | `#A8261C` | `#F9E9E6` | 6.0:1 |
| Warning | `#6E4600` | `#FBF0D6` | 7.3:1 |
| Info and focus ring | `#1F4E8C` | `#E6EEF8` | 7.1:1 |

### 11.2 Typography

- Headings: **Fraunces** (variable, optical size 9–144), weight 500, letter spacing −0.02em, line height 1.15 (1.05 for Display)
- Body and interface: **Manrope** (variable 400–700); body weight 400, labels and links 600–700
- Both self-hosted as WOFF2 variable files; Manrope preloaded; `font-display: swap`
- Minimum text size is 14px anywhere, including tags, captions, and chat source lines; body text 16px minimum
- Headings are sentence case; eyebrows are the only uppercase text

| Style | Desktop | Mobile (<768px) | Font / weight | Line height | Where |
|---|---|---|---|---|---|
| Display | 80px | 40px | Fraunces 500 | 1.05 | Home page hero headline only |
| H1 | 56px | 38px | Fraunces 500 | 1.15 | One per page title |
| H2 (section) | 44px | 30px | Fraunces 500 | 1.15 | Section headings |
| H2 (article) | 32px | 26px | Fraunces 500 | 1.2 | Subheadings inside long text |
| H3 | 28px | 22px | Fraunces 500 | 1.2 | Card titles, sub-sections |
| Price | 28px | 26px | Fraunces 500 | 1.2 | Listing price |
| Lead | 20px | 18px | Manrope 400, `ink` | 1.6 | First paragraph under H1 |
| Body | 18px | 17px | Manrope 400 | 1.6 | Paragraphs, lists |
| Small | 15px | 15px | Manrope 400, `muted` | 1.5 | Helper text, captions, legal links |
| Eyebrow | 14px | 14px | Manrope 600, uppercase, +0.12em | 1.4 | Label above a heading, after a 32×2px rule (`ink` on light, `gold` on dark), 12px gap |
| Button | 17 / 16 / 15px (L/M/S) | same | Manrope 700, +0.01em | 1 | Buttons |

### 11.3 Shape, borders, and elevation

- Corner radius is **0** on every component: buttons, cards, fields, images, messages, panels, chat bubbles, tags
- Circles only for the logo, 64px round icon badges, and the 8px status dot
- Borders: 1px `field-border` on inputs; 2px on buttons and invalid/valid fields; 2px `ink` rule on top of cards
- No shadows and no gradients; depth comes from `dark` bands and `surface-soft` sections

### 11.4 Spacing and layout

- Layout spacing uses the 8px scale: 8, 16, 24, 32, 40, 48, 64, 96; 4px and 12px half steps only inside a component (icon gaps, label gaps)
- Breakpoints: mobile under 768px (designed at 390, tested at 320), tablet 768–1023px, desktop 1024px and up (designed at 1440)
- Desktop: 12-column grid, 24px gutters, 64px side margins, content max width 1312px centered
- Tablet: 8-column grid, 24px gutters, 32px side margins; listing cards two per row
- Mobile: single column, 16px side margins; photos in the hero run edge to edge
- Section padding: 96px top and bottom on desktop, 48px on mobile; section heading to content 40px desktop / 24px mobile
- Grids: listings 3 columns with 32px gaps; team 4 columns with 32px gaps (2 columns, 16px gaps on mobile); resources 2 columns with 32px gaps
- Long text pages: max width 680px (about 70 characters); 16px between paragraphs, 32px above an article H2

### 11.5 Buttons

| Size | Height | Side padding | Text | Use |
|---|---|---|---|---|
| L | 56px | 28px | 17px | Main page actions; full width on mobile |
| M | 48px | 22px | 16px | Default |
| S | 44px | 22px | 15px | Header, messages, cookie banner, chat |

| Variant | Light background | Dark background |
|---|---|---|
| Main (one per section) | `ink` fill, white text, 2px `ink` border | `gold` fill, `dark` text, 2px `gold` border |
| Secondary | Transparent, 2px `ink` border, `ink` text | Transparent, 2px white border, white text |
| Text link | `ink`, 600, underlined (4px offset), optional 18px arrow, 44px tall | Same in white |

| State | Treatment |
|---|---|
| Hover | Main: `ink-hover` / `gold-hover`; Secondary: 6% black tint (10% white on dark); 200ms |
| Focus | 3px gap in the background color, then a 2px ring (`#1F4E8C` on light, white on dark); never hidden |
| Pressed | Main: `ink-active` / `gold-active`; Secondary: 12% tint (18% white on dark); moves down 1px |
| Disabled | Light: `#D6D6D6` fill, `#5E5E5E` text; dark: `#3A3A3A` fill, `#9A9A9A` text; `disabled` attribute |
| Loading | 20px spinner plus a verb ("Sending…"); button keeps its width; `aria-busy="true"`; cannot be clicked twice |

- Every button label starts with an action verb; icons are 20px with an 8px gap and are never the only label (except Close/Dismiss, which carry `aria-label`)

### 11.6 Icons

- Outline style: 24px grid, 2px stroke, round ends and corners, `currentColor` (Lucide icon set)
- Sizes: 16 (chevrons), 18 (inline details and links), 20 (buttons), 22 (action bar, callouts), 24 (messages), 30–32 (badges)
- Gold icons only on `dark`; on light backgrounds icons use `ink` or the status color

### 11.7 Logo

- Always the full round CWR mark from `docs/reference/brand/`; never recolored, stretched, or redrawn
- On dark surfaces (every header, the footer, the mobile menu) the mark sits in a circle with a 2px `gold` ring; the image is scaled 104% inside it so the source file's light edge is clipped. No other cropping
- Sizes: 75px desktop header, 55px mobile header, 88px desktop footer, 72px mobile footer, 32px chat header
- Clear space on all sides equals the house icon height (22% of the logo diameter); in headers the gold ring provides the separation
- Links to the home page with alt text "CWR Real Estate"; inside the admin portal it links to the admin dashboard

### 11.8 Images and image containers

| Container | Ratio | Notes |
|---|---|---|
| Home hero, desktop | 21:9 | Full content width below the headline |
| Hero, mobile | 4:3 | Edge to edge |
| Listing card photo | 3:2 | Status tag at top left |
| Feature photo (e.g., TouchUp band) | 3:2 | On a `dark` band |
| Team portrait | 4:5 | Same size for all members |

- Square corners, `object-fit: cover`, width and height set so space is reserved before loading
- `photo-placeholder` background with the image-outline icon shows until the photo loads
- Alt text required on every photo; decorative images use empty alt text
- AVIF with WebP fallback; hero preloaded; everything below the fold lazy loaded
- Status tag: `dark` fill, white 14px Manrope 700 uppercase (+0.06em), 6×10px padding, 12px from the top-left corner, gold 8px dot, word "Active", "Pending", or "Sold"

### 11.9 Header and navigation

- Desktop header: 88px tall, `dark` background, white text, 1px `divider-dark` bottom border, 64px side padding, sticky; logo left, five menu items center (Manrope 600 16px, 44px tall, 12px side padding, 16px chevron for items with sub-pages; sub-page lists are `dark` panels with a 2px `gold` top rule), phone link with an 18px `gold` icon plus S gold main button "Contact us" right
- Current page: 2px `gold` bar under the menu label plus `aria-current="page"`
- Menu hover (owner choice 2026-09-26): every link on `dark` — header menu, sub-page lists, header phone link, mobile menu, footer, admin sidebar and admin mobile menu — fades in an `on-dark-hover` tint over 200ms; mouse only (never sticks after a tap), same tint on keyboard focus, never on the current page, outline in high-contrast mode
- Mobile header: 62px tall (meets Style §4 56–64px and Features §1 under 64px), `dark`, 16px side padding, sticky; 55px logo left; "Menu" button right (20px icon plus the word "Menu", 44px tall, 2px white border)
- Mobile menu: full-screen `dark` panel; 62px top bar with logo and "Close" button; items are Fraunces 24px white, 56px tall, `#2A2A2A` dividers; current item has a 4px gold left bar and `dark-alt` background; sub-pages in Manrope 17px, 44px tall, indented 32px; L gold "Call" and L secondary "Text us" buttons pinned at the bottom
- Mobile action bar: fixed to the bottom on every public page; `dark` background, `divider-dark` top border; three equal items Call, Text, Chat, each 60px tall with a 22px gold icon over a 14px white bold label; 14px bottom padding for phone home bars
- Pages keep 88px (desktop) / 62px (mobile) top scroll padding and 80px bottom padding on mobile so focus is never hidden
- Breadcrumbs: Manrope 15px; links `ink` underlined, 44px tall; 16px chevron separators in `muted`; current page bold with `aria-current="page"`

### 11.10 Cards

- **Listing card**: no box or background; 2px `ink` top rule; 3:2 photo; 16px gap below the photo; price, then address (Manrope 17px 600) and city (400, `muted`), then details row (Manrope 15px `muted`, 18px icons, 16px gaps): beds, baths, square feet; the whole card is one link; hover zooms the photo to 1.03 over 200ms and underlines the address
- **Team card**: 4:5 portrait, name in Fraunces 24px (19px mobile), role in Manrope 16px `muted`; whole card is one link
- **Resource card**: `surface-soft` fill, 2px `ink` top rule, 40px padding, eyebrow, H3 at 32px, body, "Read more" text link

### 11.11 Forms

- Labels above fields: Manrope 700 16px `ink`; optional fields add "(optional)" in 400 `muted`; required fields are the default and are not starred
- Fields: 52px minimum height, 12×14px padding, `surface` fill, 1px `field-border`, text 17px (never below 16px, so phones do not zoom)
- Text areas: 3 rows, 104px minimum height, resize vertical only
- 24px between fields; single column; 520px max width on desktop, full width on mobile; submit is an L main button, full width on mobile
- Helper text: 15px `muted` below the field
- Error: 2px error border, `aria-invalid="true"`, 18px error icon plus a specific message in 15px 600 error color below the field, linked with `aria-describedby`; shown when the visitor leaves the field
- Valid: 2px success border plus a 18px check icon and short confirmation only on fields that were previously in error
- Focus: the standard focus ring (11.5)
- On submit with errors: an error message at the top lists each problem as a link that jumps to its field, and focus moves to that message

### 11.12 Messages and feedback

- Layout: 24px status icon, bold 16px title, 15px body (1.5 line height), optional S secondary action, 44×44px dismiss button; tint background, 1px status border, 16px padding, square corners
- Errors use `role="alert"` and stay until dismissed; success, warning, and info use `role="status"`; success toasts close after 6 seconds, but pause while hovered or focused
- Placement: pop-up messages appear top right on desktop (24px from the edges, 400px max width) and above the action bar on mobile (16px side margins); banners about a whole page sit at the top of the content
- Wording: title says what happened; body says what to do next; errors never blame the visitor and never lose what they typed
- Success page (after a form): 64px round success badge (success tint fill, 2px success border, 32px check), H1 thanking the visitor by name, what happens next and when, an L main button, and an L secondary button
- Callout: `dark` panel, 16×24px padding, 22px gold icon, 17px white text

### 11.13 Other components

- **Empty state**: 1px dashed `field-border` box, 40×24px padding, centered; 64px round `dark` badge with a 30px gold icon; H3 at 24px; one line on what belongs here and the next step (16px, 420px max width); one M main button
- **AI chat window**: 380px wide panel (full screen on mobile); `dark` header with 32px logo, "CWR Assistant", and "AI · NOT A PERSON" in 14px gold bold; visitor messages on `dark` with white text, right aligned; assistant messages on `surface-soft`, left aligned, ending with a 14px `muted` "Source: Policy [section]" line; "Talk to a person" S secondary button always visible; on desktop, an M gold "Chat with us" launcher sits 32px from the bottom-right corner
- **Cookie banner**: `dark` panel at the bottom of the screen above the action bar; 16px white text; "Accept all" and "Reject all" as equal S gold main buttons, plus a "Cookie settings" text link
- **Admin top bar**: same `dark` header as the public site (88px desktop, 62px mobile, sticky). Desktop: logo (links to the admin dashboard), "CWR Real Estate" in Fraunces 20px over an "ADMIN" eyebrow, breadcrumb "Admin › [area]" in 15px `on-dark-muted`, then right-aligned "View website" text link (opens a new tab, says so to screen readers) and an S secondary "Sign out" button. Mobile and tablet: logo, "Admin", a 44px Inbox icon link with the unread badge, and the "Menu" button
- **Admin sidebar** (1024px and up): 256px `dark` column, sticky under the top bar and scrolling on its own; links grouped under 14px `gold` uppercase headings "Daily", "Website", "Settings" (empty groups hidden by role); each link is a 20px icon plus the word, Manrope 600 16px, 44px tall; current page has a 4px `gold` left bar on `dark-alt` plus `aria-current="page"`; the signed-in email (15px, cut with "…", full address on hover) and role (14px uppercase with the 8px gold dot) sit at the bottom above a `divider-dark` line
- **Admin mobile menu**: the mobile menu pattern above with the same groups (Fraunces 20px items, 56px tall), then the email (wrapping), role, and an L secondary "Sign out" button at the bottom
- **Unread badge**: `gold` fill, `dark` 14px bold number, 24px tall, capped at "99+"; screen readers hear "(N new)" after "Inbox"
- **Admin dashboard**: date and greeting H1; owner-only error message when a required server setting is missing; a `dark` "Today" strip of numbered figures (four for owners and managers, two for staff; figures that need action turn `gold` with an arrow and the words "needs attention" for screen readers), 1px `divider-dark` gaps; "Latest messages" (five newest open requests) beside a `surface-soft` "Quick actions" panel with a 2px `ink` top rule (one M main button, the rest M secondary; only actions the role may use); "Manage the website" area cards: `surface` fill, 2px `ink` top rule, 16px padding, 40px square `dark` icon badge with a 20px `gold` icon, Fraunces 20px title, 14px `muted` description, 14px bold status line, as many 240px+ columns as fit
- **Footer**: `dark` background; 72×64px padding with 40px bottom on desktop, 48×16px with 120px bottom on mobile (room for the action bar); logo, then phone, email, and office address with 18px gold icons; five link columns with 14px gold uppercase headings and 16px white links, each 44px tall (two columns on mobile); bottom row above a `divider-dark` line with the gold Equal Housing icon and text, plus underlined 15px `on-dark-muted` links for Privacy policy, Cookie settings, and NC "Working with Real Estate Agents"

### 11.14 Motion

- 200ms ease-out for hover and color changes; 250ms for the mobile menu and chat panel opening; messages fade and slide 8px in 200ms
- Animate only transform and opacity; with reduced motion turned on, changes happen instantly

### 11.15 Enforcement

- All values above live in one shared design-token file; components use tokens only, never raw hex, pixel, or font values
- Automated checks before every merge: no raw colors outside the token file, no border radius above 0 except the listed circles, no text under 14px, no tap target under 44px (except links inside sentences), no gold on light backgrounds, and a passing axe accessibility scan
- A new component or variant must be added to this section, with owner approval, before it ships
