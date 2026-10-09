# Addendum A to the reliability round plan: old pages and the Quick Check

Status: APPROVED rev 4 (2026-10-02) — owner said "build it"; DA1 = refresh automatically. Audit: rev 1 B+, rev 2 A-, rev 3 A-. rev 4 fixes all findings (changelog at
the end). This addendum joins `cwr-reliability-round-plan.md` as Phase 2b, under the same rules (scope,
DO NOT TOUCH, gates, verification).
**Built and merged** into `build1` with the reliability round by PR #23 (`f82e5ff`) on 2026-10-02.

## Goal
No one stays stuck on a Quick Check message because their page is old. The page either fixes itself
or offers a one-tap fix that keeps what they typed. Each case is recorded with a code that says why.

## What happened (evidence)
- **Owner report:** a sign-in page left open said "Please complete the quick check, then sign in again" on every try until it was refreshed.
- **Production log** (`cwr.problem_events`, read-only query, 2026-10-02):
  - two `auth.sign_in` / `captcha_failed` / `info` records, at 22:21:39 and 22:21:59 UTC;
  - detail: `captcha protection: request disallowed (invalid-input-response)`;
  - same release id on both;
  - minutes after the rebuild that replaced the test site key (`1x0000…AA`) with the real one (`0x4AAAA…`).
- **Root cause:**
  1. Next.js writes `NEXT_PUBLIC_TURNSTILE_SITE_KEY` into the JavaScript at build time, for both the browser and server bundles (Next.js environment-variables guide, v16.3).
  2. A page loaded before the rebuild kept the test key, so its widget produced Cloudflare's dummy token every time.
  3. Supabase checks tokens with the new real secret and refused each one.
  4. A widget reset reloads the same old key, so only a full refresh fixed it.
- **Second cause:** tokens expire after 300 s. A sleeping laptop or frozen tab can wake up holding an expired token. Supabase then answers `captcha protection: request disallowed (timeout-or-duplicate)`, with code `captcha_failed` (supabase/auth issue #1751; same format as the production rows).
- **Third, nearby cause:** if a release changes a server action's code, an old page's action ID no longer exists and the call throws.
  - Admin sign-in and forgot-password are already wrapped in `withCallReporting` (`login-form.tsx:14`, `password-forms.tsx:12`). They show "The site was just updated. Refresh the page…", which is text only, with no button and nothing kept.
  - The public contact, booking and hand-off forms are not wrapped, so a visitor gets a crash screen.
- **Logging gap:** the event *was* recorded and counted in the dashboard's 24-hour total (`health/queries.ts:26`), but only as `info`. That means no reference code, it is not in "serious", and its code doesn't say "old page".
  - The repo's own scale (`docs/cwr-error-tracking-plan.md:107`) defines `warning` as "stale or tampered input". That is this case.
  - `captcha_failed` never spikes (`:145`). That stays.
- **Wording gap:** with an invisible check there is nothing to "complete", so staff don't know to refresh.

## Sources
| Source | Used for |
|---|---|
| Cloudflare Turnstile: server-side validation | 300 s lifetime, single use, error codes |
| Cloudflare Turnstile: client rendering | `refresh-expired`, `expired-callback`, `reset()` |
| Cloudflare Turnstile: testing | the dummy token is rejected by real secrets |
| Next.js environment variables (v16.3) | build-time inlining |
| supabase/auth issue #1751 | the captcha error text |
| MDN | Page Visibility (`visibilitychange`), `sessionStorage` |
| WCAG 2.2 | 3.3.1, 3.3.3, 4.1.3, 2.2.1, 3.2.2 |
| OWASP Logging Cheat Sheet | log reasons; no secrets or PII |

## Design

### 1. The page tells the server which check key it has
- **Hidden field.** Each Quick Check adds a hidden `botCheckKey` field holding the site key that its own JavaScript was built with. A site key is public. This covers Phase 2's `TurnstileField` and `use-bot-check.ts`, and `SignInBotCheck`.
- **Helper.** New `src/lib/security/bot-check-key.ts`, function `isOutdatedBotCheckKey(formValue)`:
  - true when the server has a site key and the page sent a different, non-empty one;
  - empty (an old page from before this release) falls through to the normal check.
- **Order of checks** in each action:
  1. field validation;
  2. rate limit (`isOverFormLimit` / `isOverChatLimit`; admin sign-in relies on Supabase's limits);
  3. **key check**;
  4. token check (siteverify or Supabase).

  So a forged field can't skip the limiter or produce unlimited records. A forged field can only cause a refresh, never a pass.
- **Where it runs:**
  - admin `signIn` and `requestReset` (`src/lib/admin/auth-actions.ts`);
  - public `submitRequestForm` (`submit-actions.ts`);
  - `submitChatHandoff` (`chat-handoff.ts`);
  - the new-chat path in `sendChatMessage` (`send-chat-message.ts`).
- **Result types: no shared union is widened.**
  - Admin: `ActionState` (`src/lib/admin/action-state.ts`) keeps its status values and gains one optional field, `recovery?: "refresh"`. Only sign-in and forgot-password set it; other forms ignore it. This is a usage rule, not something the type enforces. `refresh` is shared with §2's stale-action case.
  - Public: `RequestFormState` (`form-state.ts`) gains the same optional field. An old check key gives `blocked` + `recovery`; an old server action (§2) gives `failed` + `recovery`. No new status.
  - Chat: `SendChatResult` (`chat-results.ts`) uses the same optional field on its existing `error` result. `use-chat-conversation.ts` gets an explicit branch for it, with a unit test.
- **Records:** server-side, code `outdated_page`, **severity `warning`** (stale input, per the repo's scale), stage `validate`, no visitor text, and Supabase or siteverify is never called. Warning means a reference code is stored and it counts as serious on the dashboard. Visitors still never see reference codes (Phase 1 rule).

### 2. Old server action after a release (the crash case)
- **One wrapper for both kinds of form.** `withCallReporting` in `src/lib/observability/call-server-action.ts` becomes generic:

  ```ts
  withCallReporting<S>(action, serverAction, { mode: "member" | "visitor", onFailure(failure, formData): S })
  ```

  The current admin call signature stays as a thin overload with the same behaviour, so all other existing callers don't change.
- **Two-argument admin overload: untouched.** `use-admin-form.ts` (every admin form), `mfa-form.tsx`, `mfa-setup.tsx` and set-password keep it and behave exactly as today, with no `recovery` field.
- **Member mode with `onFailure`:** only `login-form.tsx` (sign-in) and `password-forms.tsx` (the reset form) move to it. Their `onFailure` returns today's error state plus `recovery: "refresh"` for `stale_page`.
- **Pinning tests first:** before any refactor, new tests in `call-server-action.test.ts` pin the two-argument overload:
  - a thrown error gives `status: "error"`, a message ending in `(Ref X)` when a reference comes back, and the form values kept;
  - a Next.js redirect is re-thrown, not recorded;
  - stale-page and network failures keep their current messages;
  - no `recovery` field is set.

  `typecheck` must also pass for the `mfa-setup` lambda callers, whose parameter types come from the signature.
- **Visitor mode (new):**
  - reports through Phase 1's visitor reporting (no localStorage queue);
  - **never appends a reference code** (Phase 1 rule);
  - wraps contact, booking and hand-off.
  - Their `onFailure` maps `stale_page` to status `failed` with `recovery: "refresh"`, and a network drop to `failed` with no recovery. These are not "blocked", because a stale action is not a failed bot check.
- **Phase 1 allow-list change:** the main plan's `VISITOR_BROWSER_ACTIONS` gains `site.contact_form`, `site.booking_form` and `site.chat_handoff`. They stay capped at warning and carry no text, and Phase 1 gets a matching test. Without this, these reports, including `outdated_page_loop` from public forms, would be refused.

### 3. What the person sees when `recovery: "refresh"`
- **Sign-in and forgot-password** (no long typing to lose), per decision DA1:
  1. A status line (`role="status"`) says "This page was out of date. Refreshing it for you…", with a **Refresh now** button.
  2. The email is saved to `sessionStorage` (`cwr-form-restore:admin-login`, never the password).
  3. The page reloads after **3 s**, so a screen reader can finish the announcement. Refresh now reloads at once.
  4. After reload, the email is filled in. Focus moves to the password field only if it is still empty, so a password manager's autofill is respected.
- **Public forms and chat** (long messages):
  - No automatic reload. The message is "This page was out of date. Tap Refresh page and what you typed will be kept.", with a **Refresh page** button.
  - The button saves the visible fields, then reloads.
  - After reload, **only fields that still exist with the same name** are restored (a release may rename fields). The chat composer draft is kept the same way.
- **Restore rules** (`src/components/forms/use-form-restore.ts`):
  - this tab only (`sessionStorage`);
  - removed as soon as it's restored;
  - dropped after 10 minutes;
  - every read and write wrapped in try/catch, because storage may be blocked;
  - never passwords or Quick Check tokens.
- **Loop guard:** a `sessionStorage` timestamp blocks a second automatic reload within 60 s. If the page is still out of date after one reload:
  - the person sees "Refreshing didn't fix it. Close this tab and open the page again.";
  - sign-in also shows the office phone;
  - the browser sends one `outdated_page_loop` warning.
- **Any other failed check** (`captcha_failed` or `captcha_expired` that is not an old page):
  - wording: "The quick check didn't go through. Try again. If it happens again, tap Refresh page.";
  - a Refresh page button with the same restore;
  - this replaces "Please complete the quick check…" (`auth-outcomes.ts:34`) and lives in Phase 2's `bot-check-messages.ts`;
  - announced politely (WCAG 4.1.3).

### 4. Expired tokens after sleep
- `use-bot-check.ts` records when each token arrived.
- **On submit,** if the token is older than 270 s (Cloudflare's 300 s limit, minus a margin):
  - the widget resets and Send shows "Running a quick check…";
  - the form's fields become **read-only** while waiting;
  - the form submits automatically when the new token arrives. This only completes the press the person already made (WCAG 3.2.2: no unrequested change).
  - If no token arrives within 10 s, fields unlock and Phase 2's "The quick check didn't load. [Try again]" line appears.
- **When the tab becomes visible again** (`visibilitychange`), a token older than 270 s resets at once.
- The library's `refresh-expired: "auto"` stays on.

### 5. Logging summary
| Case | Where | Code | Severity |
|---|---|---|---|
| Page has an old check key | server | `outdated_page` | warning |
| Old server action after a release | browser (`withCallReporting`) | `stale_page` | warning (existing behaviour, extended to these forms) |
| Still out of date after one reload | browser | `outdated_page_loop` | warning |
| Token expired (`timeout-or-duplicate`) | server | `captcha_expired` | info |
| Any other refusal | server | `captcha_failed` | info (as today) |

- No new catalog actions, so no migration. `outdated_page_loop` and `stale_page` are added to `BROWSER_PROBLEM_CODES` and Phase 1's `VISITOR_BROWSER_CODES`.
- No spike codes are added (`:145` stays).
- The runbook gets this query:

  ```sql
  select code, count(*) from cwr.problem_events
  where code in ('outdated_page','stale_page','outdated_page_loop','captcha_expired')
  group by 1;
  ```

### 6. Not done, and why
- **Next.js skew protection** (keeping old builds alive): on Workers it needs versioned preview URLs and more Cloudflare resources. That's too heavy, and it wouldn't fix expired tokens.
- **Automatic reload on public forms:** it could lose a typed message.
- **Spike alerts for captcha failures:** they contradict an earlier owner-approved decision, and bots would trigger them.

## Task breakdown (Phase 2b, after Phase 2)
- **2b.1** Add `bot-check-key.ts` (new), with unit tests for: same key, different key, empty, and no server key (dev).
- **2b.2** Add the hidden `botCheckKey` field in `TurnstileField`/`use-bot-check.ts` and in `SignInBotCheck`.
- **2b.3** Add the server checks in the stated order, in `auth-actions.ts` (`signIn`, `requestReset`), `submit-actions.ts`, `chat-handoff.ts` and `send-chat-message.ts`.
  - Add the optional `recovery?: "refresh"` field to `action-state.ts` (sign-in states only), `form-state.ts` and `chat-results.ts`. No new status values.
- **2b.4** Make the status maps exhaustive so a missing case breaks the build: `request-form.tsx` `NOTICE_TITLES` becomes `satisfies Record<RequestFormStatus, string>`, as does any other status map found. There are no `switch` statements on these statuses today, so no extra helper.
- **2b.5** In `auth-outcomes.ts`, classify `captcha_expired` when the Auth error message contains `timeout-or-duplicate`. Apply the new wording. Forgot-password shows the refusal message (Phase 2.6).
- **2b.6** In `call-server-action.ts`:
  - **first**, add the pinning tests for the current two-argument `withCallReporting` and run them green on the unchanged code;
  - then make it generic with member and visitor modes, keeping the two-argument signature as an untouched overload;
  - switch **only** `login-form.tsx` and the reset form in `password-forms.tsx` to member mode with an `onFailure` that maps `stale_page` to `recovery: "refresh"`;
  - `use-admin-form.ts`, the MFA forms and set-password are not touched;
  - wrap contact, booking and hand-off in visitor mode (`stale_page` → `failed` + `recovery`, no reference code);
  - add the three actions to Phase 1's `VISITOR_BROWSER_ACTIONS`, with a test.
- **2b.7** Add `use-form-restore.ts` (new) and the recovery UI:
  - sign-in auto-reload at 3 s with Refresh now;
  - the public Refresh page button;
  - restore only matching fields;
  - focus to the password only if it is empty;
  - the loop guard and the `outdated_page_loop` report.
- **2b.8** Token age in `use-bot-check.ts`: the 270 s rule on submit and on `visibilitychange`; read-only fields while waiting; the 10 s fallback.
- **2b.9** Codes added to `client-problem.ts` and Phase 1's visitor list.
  - Update `docs/cwr-error-tracking-plan.md:302`: captcha messages change, and `captcha_expired` and `outdated_page` are added.
  - Add the runbook query.
- **2b.10** Tests:
  - Unit:
    - the key compare;
    - the outcome classification;
    - restore: save, restore, expiry, blocked storage, renamed field skipped;
    - the token-age decision;
    - the chat `recovery` branch;
    - exhaustive maps (a missing key fails `typecheck`).
  - e2e:
    - **(a)** Sign-in with an injected different `botCheckKey`: the announcement shows, the page reloads after 3 s, the email stays filled, the password is empty, focus is on the password, and an `outdated_page` warning exists.
    - **(b)** Contact form, same setup: the button appears, the typed message is kept after reload, and the record exists.
    - **(c)** Loop guard: still out of date after the reload, so the "close this tab" message appears and one `outdated_page_loop` record exists.
    - **(d)** Fake clock at 280 s on sign-in: fields are read-only, the submit waits for a fresh token, one press succeeds; with no token, the fallback line appears after 10 s.
    - **(e)** Old server action, simulated with a missing action ID, on the contact form and on sign-in: no crash screen, the Refresh flow appears, `stale_page` is recorded, and no reference code is shown to the visitor.
    - **(f)** An old page without the field goes through the normal check.
    - **(g)** A normal sign-in and normal forms are unchanged.

## Downstream impact
- **Level 1 (files touched):**
  - New: `bot-check-key.ts`, `use-form-restore.ts`.
  - Bot check: `use-bot-check.ts`, `turnstile-field.tsx`, `sign-in-bot-check.tsx`, `bot-check-messages.ts`.
  - Admin sign-in: `auth-actions.ts`, `auth-outcomes.ts`, `action-state.ts` (one optional field), `login-form.tsx`, `password-forms.tsx`.
  - Public forms: `submit-actions.ts`, `form-state.ts`, `request-form.tsx`, `use-request-form`.
  - Chat: `chat-handoff.ts`, `chat-handoff-form.tsx`, `send-chat-message.ts`, `chat-results.ts`, `chat-composer.tsx`, `use-chat-conversation.ts`.
  - Problem logging: `call-server-action.ts` (generic wrapper; the admin overload behaves the same), `client-problem.ts`, Phase 1 `problem-report-rules.ts` (allow-list +3).
  - Docs: `docs/cwr-error-tracking-plan.md` line 302, the runbook.
- **Level 2 (what depends on those files):**
  - All admin forms share `ActionState`. They only gain an optional field they ignore; the status union is unchanged.
  - Every existing `withCallReporting` caller (`use-admin-form.ts`, `mfa-form.tsx`, `mfa-setup.tsx`, set-password): unchanged two-argument overload, guarded by the new pinning tests (written before the refactor) and `typecheck`.
  - Status maps: the 2b.4 `satisfies` maps make any miss a build error. This was not true before; it is added here.
  - The admin sign-in e2e suite and the public forms e2e.
  - Risk: low.
- **Level 3 (further out):**
  - Dashboard: `outdated_page` warnings count as serious. Desired: it is a real fault staff hit.
  - Future key rotations and releases become self-healing.
  - Risk: none.
- **Approval gates:** none new. No DB change, no new external API, no secret handling (the site key is public).

## DO NOT TOUCH (in addition to the main plan's)
- `spike_codes` for `auth.*`.
- Supabase Auth settings.
- `ActionState` status values.
- Passwords are never stored or restored.
- MFA and set-password steps (no Quick Check), apart from their existing `withCallReporting`.

## Edge cases (most → least critical)

| # | Edge case (chain) | Solution |
|---|---|---|
| S1 | Keys are changed again with staff tabs open → every sign-in refused → staff locked out. | The page sees its key is out of date and refreshes itself, keeping the email. |
| S2 | A release changes the sign-in code with a tab open → the old page's call fails → crash screen. | Caught and shown as the same Refresh flow; recorded as `stale_page`. |
| S3 | The refresh still serves the old page (cache or slow rollout) → endless refreshing. | One automatic refresh per minute; then "close this tab and reopen it" plus the phone number; a warning record. |
| S4 | A visitor's long message on an old contact page → refresh → message lost → lead lost. | Public forms never auto-refresh; the Refresh button saves and restores what they typed. |
| S5 | A password ends up saved in the browser → privacy risk on a shared computer. | Only the email is saved, this tab only, deleted on restore or after 10 minutes. |
| S6 | Someone floods forged `botCheckKey` fields → many records. | The key check runs after the rate limiter; records are flood-capped; a forged field can only cause a refresh. |
| S7 | A laptop sleeps overnight on the sign-in page → expired check → refused first try. | The check renews when the tab wakes; Send waits for a fresh check, with fields locked. |
| S8 | The fresh check never arrives during the automatic submit → the person waits forever. | After 10 s the fields unlock and "didn't load, Try again" appears. |
| S9 | The person edits a field while the automatic submit waits → their edit is lost. | Fields are read-only while waiting. |
| S10 | A release renamed a field → restored text lands in the wrong place. | Only fields that still exist with the same name are restored; others are dropped. |
| S11 | A screen-reader user doesn't notice the page is refreshing. | The announcement comes first, the reload waits 3 s, and Refresh now is offered. |
| S12 | A password manager fills the password after the refresh → focus fights it. | Focus moves to the password only if it is empty. |
| S13 | A page from before this release (no field) → can't detect → normal refusal. | It falls back to the normal check; the new message offers Refresh page. Only pages opened before this release are affected. |
| S14 | Browser storage blocked (private mode) → nothing restored. | The refresh still fixes the page; the person retypes. No crash. |
| S15 | A bot hammers sign-in → many records → owner alarmed. | `captcha_failed` stays info, flood-capped, never spikes. |
| S16 | Two sign-in tabs open → both refresh. | Each tab's storage is separate; each restores its own email. |
| S17 | A public page opened before this release (no wrapper, no key field) → a release happens → it hits the old behaviour once. | Accepted, one time only. The visitor refreshes, and from then on every page has the new protection. |

## Owner decision
DA1: on sign-in pages, refresh automatically (recommended: a message, then a refresh after 3 seconds, with a "Refresh now" button), or only show a Refresh page button like the public forms?

## Changelog
rev 4 answers audit rev 3:
- pinning tests for the two-argument `withCallReporting` are written before the refactor;
- only sign-in and the reset form move to member mode with recovery;
- every other admin caller is untouched;
- stale `assertNever` mention removed.

rev 3 answers audit rev 2:
- `withCallReporting` made generic, with a visitor mode that never shows reference codes;
- public stale actions map to `failed` + `recovery`;
- the three public actions are added to the Phase 1 allow-list;
- corrected the claim about login/forgot-password (they were already wrapped);
- dropped `assertNever` (`satisfies` is enough);
- S17 added.

rev 2 answers audit rev 1:
- the key check runs after the rate limiters;
- no shared union is widened (optional `recovery` field instead);
- exhaustive status maps (`satisfies` and `assertNever`);
- old server actions are handled via `withCallReporting` and the same Refresh flow;
- `outdated_page` is a warning, per the repo's scale;
- a 3 s screen-reader-safe reload with Refresh now;
- read-only fields and a 10 s fallback during the automatic submit;
- focus moves only if the password is empty;
- only matching fields are restored;
- explicit chat branch;
- error-tracking plan line 302 update added;
- the dashboard and exhaustiveness claims are corrected;
- edge cases S2, S6, S8–S10 and S12 added.
