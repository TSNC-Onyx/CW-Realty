# Website chat: guided topics and chat window B (spec and plan)

**Status:** plan and style exceptions approved by the owner on 2026-10-06 ("1 OK, 2 merge, 3 build it"). BUILT on branch `claude/chat-guided-topics` after PR #29 merged. See §12 for how the build differs from this plan. The local prototypes were deleted.

**Wording rule:** the quick-answer wording is policy text, so it lives in the owner's chatbot policy (admin), never in this repo. Labels and fixed UI lines below are UI copy.

## 1. Decisions log (owner)

| Date | Decision |
|---|---|
| 2026-10-05 | Keep Claude Haiku 4.5. Add a button tree to guide visitors. Selected Services gets one combined answer. Answers are short, fixed, and aligned with the owner. The emergency fix ships first (PR #29). |
| 2026-10-06 | Plan approved: buttons work with the assistant off; answers live in the policy; one additive DB column; #29 first. |
| 2026-10-06 | At least two buttons per row. |
| 2026-10-06 | Chat window **B** (topic tray). "Talk to a person" stays under the question box. The tray sits on the chat's light background with **black, subtly rounded** topic buttons. |
| 2026-10-06 | A taller desktop window. Shorter answers, each with a page link. A short reply pause. The chat reopens after a chat link on computers and tablets. |

## 2. Topic tree (labels of 25 characters or fewer, 4 or fewer per level, 3 or fewer levels)

- **Buy or sell a home** → Buying a home · Selling a home · What's my home worth?
- **Rentals & management** → Find a place to rent · I own a rental · I'm a tenant (→ Request a repair · Emergency help)
- **CWR TouchUp** → What is TouchUp? · What does it cost? · Get started
- **Something else** → Selected Services · Browse listings · About our team

In-between prompts are UI copy in `src/lib/chat/guided-tree.ts`, for example "Happy to help. Which one fits you?".

## 3. Answers

- Each leaf has a public policy section titled `Quick answer: <label>`, 25 words or fewer, ending with one page link (label and path). Planned links:
  - Buying a home / Selling a home: `/services/selected-services#buyer-plans` / `#seller-plans`
  - What's my home worth?: `/contact`
  - Find a place to rent / Browse listings: `/listings`
  - I own a rental: `/services/property-management`
  - TouchUp leaves: `/services/cwr-touchup`
  - Selected Services: `/services/selected-services`
  - About our team: `/team`
- Every answer ends with "Source: Policy · Quick answer: …" (Features §2).
- **Emergency help** uses the fixed `EMERGENCY_TEXT` with Call and Text buttons (PR #29), never a policy section, with no pause.
- Still needed from the owner: answers for "Find a place to rent" (how renters apply) and "Request a repair" (how tenants report normal repairs).
- **It switches itself on:** an option shows only if its section exists in the published policy, and an empty branch hides. With none, the chat is exactly as today.

## 4. Chat window B

Top to bottom:
1. Dark header: logo, "CWR Assistant", "AI · NOT A PERSON", and Close.
2. The conversation.
3. Topic tray.
4. "Or type your question" (14px label), the question box, and Send.
5. **Talk to a person**: an S secondary full-width button (Style §11.13).

| Item | Spec |
|---|---|
| Topic tray | `page` background with a 1px `line` top border. Eyebrow "CHOOSE A TOPIC" (or the current topic) in 14px `ink` uppercase. Back and Start over are text links. |
| Topic buttons | `ink` fill, white 15px Manrope 700, **6px radius**, 44px minimum height, **12px side padding**, line-height 1.25 (2 lines at most), centered. **Two per row** (flex-wrap, 136px basis), and a lone last button fills its row. |
| While typing on phones | The tray tucks away while the question box has focus, then comes back. |
| Panel edge | 1px `field-border` (5.1:1). |
| Phones (<768px) | Full screen, keeping PR #30's visual-viewport keyboard fit and scroll lock. Safe-area padding at the bottom. |
| Tablets (768–1023px) | The 380×640 floating panel, lifted above the action bar (`bottom: action-bar-space + 16px`). `FULL_SCREEN_QUERY` moves from 1024px to 768px. |
| Computers (≥1024px) | 380px wide. Height clamp(640px, 100dvh − header − 64px, 880px), capped at 100dvh − header − 32px: 640px at 1366×768, 748px at 1440×900, 880px at 1920×1080. |
| New answer | Scrolls so its first line sits at the top of the message area. Focus moves to it (no scroll jump) and the `role="log"` region announces it. |
| Reply pause | The tap shows at once with "The assistant is replying…" and three fading dots (opacity only, still under reduced motion). The answer follows after 700–1,500ms (25ms per word + 300ms). Buttons are `aria-busy` meanwhile. **Emergency: no pause.** The AI label always stays. |
| Old buttons | Only the newest set shows. The chosen label stays as the visitor's bubble. |

Style-guide exceptions to approve (topic buttons only): a 6px radius (§11.3 says 0), several `ink` buttons in one section (§3), and 12px side padding (§11.5 says 22px).

## 5. Links and page changes

- Today (verified 2026-10-06), the conversation survives page changes: sessionStorage per tab, and a 24h server session. The window closes on every page change (PR #30).
- **New:** after a link clicked **inside the chat**, the chat reopens on the new page on computers and tablets. Phones stay closed so the page shows, and Chat in the action bar brings it back.
  - A one-time sessionStorage flag is set when a chat link is clicked and read by the launcher on the next page.
  - It is ignored if older than 30 seconds or if the visitor closed the chat.
- The tree position is saved with the conversation. An unknown position after a site update resets to the top.
- History is lost in a new tab, when the tab closes, or when storage is blocked. That's unchanged.

## 6. Server, limits, and logging

- The menu loads when the chat opens, through a read-only server action (public quick-answer sections only). If it fails, the chat works as today and the failure is logged.
- Every tap is logged in the background by a guided-step action:
  - It starts the session with the existing Turnstile check.
  - It rebuilds the answer from the published policy and never trusts the browser.
  - A failure goes to the Problems log and never blocks the visitor.
- Haiku sees the taps as normal session turns, so typed follow-ups have context. The prompt and model are unchanged.
- An additive column `chat_messages.source` (`typed` default, `guided`) means the 20-message cap counts typed questions only. The hourly new-chat cap applies at the first typed question.
- The emergency check runs before everything. PR #30's steering guard and repair lines apply to typed questions only.
- Analytics: taps push `cwr_chat_topic` after consent. `cwr_chat_question` is unchanged.
- Admin: chat history tags button rows as "Button". The hand-off message includes them. Chat policy (the new PR #30 page) lists quick-answer sections as present or missing.

## 7. Edge cases (most critical first)

1. An emergency typed mid-tree gets the fixed safety reply; a restricted number is still checked first.
2. A renamed or deleted quick-answer section hides that button, and admin shows it as missing.
3. A price changes in the policy, so there's one place to update.
4. No steering by protected class; typed steering is handled by #30's guard.
5. Tap-started sessions can't skip the hourly cap.
6. Taps don't use up the 20-message cap.
7. Logging failures never block the visitor.
8. A forged answer is ignored, because the server rebuilds it.
9. Focus moves to the new answer, and old buttons are removed.
10. A reload mid-tree restores the position.
11. A slow Turnstile delays only the logging, never the answer.
12. With the assistant off, buttons still work and typed questions get "not available".
13. On a small phone with the keyboard open, the tray tucks away.
14. Analytics stay separate.
15. If the menu load fails, it's today's chat.
16. A chat-link reopen never fires on phones or after the visitor closed the chat.

## 8. Do not touch

`claude-model.ts`, `assistant-prompt.ts`, the `assistant-reply.ts` checks, `restricted-data.ts`, the `emergency.ts` logic, `steering-terms.ts`, the `test-verdict.ts` built-in checks, the Turnstile and per-IP limiter internals, and public pages other than the chat.

## 9. Impact

- **Level 1:**
  - New: `guided-tree.ts`, `guided-actions.ts`, `guided-menu.ts`.
  - Changed: `chat-panel.tsx`, `chat-message-list.tsx`, `chat-launcher.tsx`, `use-chat-conversation.ts`, `use-phone-chat-layout.ts`, `send-chat-message.ts`, `chat-log.ts`, and one migration.
- **Level 2:** the hand-off body, admin chat history, the admin chat policy page, the data layer, and the e2e chat specs. Risk is low, and the cap move gets its own tests.
- **Level 3:** the problem catalog (new codes), the privacy policy (no new data type), and the weekly review.

## 10. Verification

- Unit tests for every edge case above.
- E2E tests for the tap path at 320, 375, 768, and 1440px.
- Axe scans, plus keyboard and VoiceOver passes.
- Typecheck, lint, the error-handling and catalog checks, and migration and RLS tests.
- A local preview with real content.
- The owner re-runs the policy tests before publishing the quick-answer sections.

## 11. Owner approvals

1. Style exceptions for topic buttons: 6px radius, several `ink` buttons in one section, 12px side padding. **Approved 2026-10-06**, recorded in Style §11.3, §11.5, and §11.13.
2. "merge #29": **merged 2026-10-06** after its conflict with #30 was resolved. The emergency check runs before #30's steering guard.
3. "build it": **2026-10-06**.
4. The production database change (A3) was approved in advance. It is applied right before the merge, which still needs the owner's ask.

## 12. Implementation notes (build differs from the plan)

- **Taps skip the Quick Check.** §6 planned to start a tap's chat with the Quick Check, but that check lives in the question box's form. Taps never reach the AI and save only fixed text, so the build guards them in three other ways:
  - a per-visitor limit (a separate `guided` count on the existing chat limiter, so no new Cloudflare resource);
  - a cap of 40 taps per chat;
  - the site-wide hourly chat limit when a tap starts a chat.

  The Quick Check still runs before the **first typed question** of any chat, including one started by taps (`send-chat-message.ts`). That's the abuse protection the AI path needs.
- **Only answered taps are saved:** the leaf button and its answer. Branch steps ("Buy or sell a home") are navigation, so they show in the visitor's window but aren't logged.
- **Tablets grow too.** Tablets use the same height rule as computers, clamp(640px, screen − header − action bar − 48px, 880px). A fixed 640px left about 150px for messages on a 768×1024 tablet; this gives 340px.
- **"Start over" became "All topics".** It returns the tray to the first topics and never clears the conversation, so the label says what it does.
- **The tray tucks away on phones only while the question box has text in it.** Opening the chat already focuses the box, so focus alone would hide the tray the moment the chat opens.
- **The question box label is "Or type your question" when topics show,** at the existing 16px label size (Forms §6). It stays "Your question" when they don't.
- **Admin:** the transcript shows "Visitor · Button" and "Button answer · cited …". Chatbot policy has a "Chat topic buttons" checklist (Ready / Missing / Too long, over 600 characters).
- **The topic event is its own key event,** `cwr_chat_topic`, sent after consent.
- **Not built:** answers for "Find a place to rent" and "Request a repair" wait on owner input. Until their sections exist, those buttons stay hidden.
