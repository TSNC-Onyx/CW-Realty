# Selected services plan labels — plan (to-do item 8 of 8, 2026-10-09)

Status: APPROVED by owner 2026-10-09; BUILT on branch claude/website-updates-todo-5efd86.

## Goal

On Selected services, both the Buyer and Seller plans read, left to right: **Self-guided** → **Value Plus** →
**Best Value**. The "Best Value" label moves to the commission card ("Ready Through Close").

Owner answers (2026-10-09): "Working with you gets Value Plus label and replace Full service with Best Value";
the dark featured look: "take no action on this now".

## Scope

In scope: the small label above each plan name (the "eyebrow") on the middle and last cards, for buyers and
sellers; the test that names the phone carousel's opening card.

Out of scope (owner: "take no action on this now"): the dark featured look stays on "Working With You", and the
phone carousel keeps opening on it. Prices, plan names, lists, buttons, and the chatbot policy text (owner
content, edge case 1).

## Architecture context

Labels live in `src/lib/content/selected-services.ts` (`eyebrow` on each plan in `BUYER_PLANS` and
`SELLER_PLANS`); `PlanCard` prints them; the featured look comes from `tone: "dark"`, which this change leaves
alone.

## Task breakdown

1. Test first (`tests/e2e/selected-services.spec.ts`): for both sections, the three cards' labels read
   "Self-guided", "Value Plus", "Best Value" in order; rename "opens on the Best Value plan" to "opens on the
   featured plan" (it still opens on "Working With You").
2. `selected-services.ts`: `working-with-you` eyebrow "Best Value" → "Value Plus" (buyer and seller);
   `ready-through-close` eyebrow "Full service" → "Best Value" (buyer and seller); update the file's header note.
3. Full checks; screenshots of both sections on phone and desktop; reload real content.

## Assumptions

- The label text is exactly "Value Plus" and "Best Value" (title case, like today's labels).

## DO NOT TOUCH

- `tone`, `isPriceHighlighted`, `isWide`, prices, names, item lists, `PlanCard`, `PlanCarousel`, page layout,
  the chatbot policy.

## Downstream Impact Analysis

### Level 1 — Direct
Files: `src/lib/content/selected-services.ts`, `tests/e2e/selected-services.spec.ts`.

### Level 2 — Dependent
`PlanCard` (prints the label), phone carousel (opens on the dark card, unchanged). Risk: none.

### Level 3 — Cascading
The live chatbot policy says buyer Working With You "is labeled our Best Value plan" (checked read-only
2026-10-09). Risk: owner content — after release the chatbot would contradict the page until the policy is
updated (edge case 1).

## Sources

- Nielsen Norman Group, pricing-page and comparison-table guidance (one clearly recommended option; labels that
  explain the difference between tiers).
