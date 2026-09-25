# Style (UI/UX) Constitution

> Section 2 of 4. Binding for all work in this repo. Supplied by the owner on 2026-09-25; do not edit without owner approval.

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
