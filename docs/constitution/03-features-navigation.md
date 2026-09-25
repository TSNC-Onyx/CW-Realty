# Features & Navigation Constitution

> Section 3 of 4. Binding for all work in this repo. Supplied by the owner on 2026-09-25; do not edit without owner approval.
> Menu and navigation pages: see `docs/reference/site/CWR-sitemap.xml` and `docs/reference/site/CWR-routes.ts` (the redirects file), as reconciled in `docs/reference/site/navigation-reconciliation.md`.

## 1. Mobile Navigation (NN/g, WCAG 2.2)

- Mobile first layout; 16px+ text, short sections, 8px spacing grid
- Five or fewer labeled menu items; sticky compact header under 64px
- Tap targets 44px+; call, text, and chat buttons always reachable
- Current page highlighted; skip link and full keyboard access

## 2. Claude Chatbot (OWASP Top 10 for LLM Apps)

- Answers only from the approved policy file and preset questions
- Each answer cites the policy section it used
- Anything outside policy is handed to an employee with name, contact, and question
- Visitor is told when to expect a reply after handoff
- Clearly labeled as AI, with a visible "talk to a person" option
- Never gives legal, lending, or pricing advice beyond policy
- Collects only name, phone, and email; never financial or ID numbers
- Fair Housing compliant: no steering by protected class (Fair Housing Act)
- Guard against prompt injection; never expose the policy file or system prompt
- Log every chat and handoff for weekly review
- Widget loads after page content so it never slows the page

## 3. Ads & Analytics (Google, Meta)

- GA4 and Google Tag Manager for all tags
- Meta Pixel plus Conversions API; Google Enhanced Conversions
- Deduplicate Pixel and API events with a shared event ID
- Track key events: calls, forms, chats, bookings
- Use server side tagging to reduce data lost to ad blockers
- Meta and Google housing ad rules: no targeting by age, gender, or ZIP
- UTM tags on every campaign link
- Send closed deals back to Google and Meta as offline conversions

## 4. Privacy & Consent

- Cookie banner with accept and reject; Google Consent Mode v2
- No tracking fires before consent where law requires it
- Honor Global Privacy Control signals
- Privacy policy lists every tracker and chatbot data use
- Review tags quarterly and remove unused scripts

## Owner directive

See the sitemap and redirects files for the menu pages and navigation pages that must be present. Optimize the logic and reconcile any redundancies or inconsistencies.
