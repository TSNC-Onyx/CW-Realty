# Runbook: chatbot launch and the Quick Check

How to switch on the website chat assistant, keep its cost bounded, turn it off, and read what
went wrong for visitors (docs/cwr-reliability-round-plan.md, Phase 4).

## 1. Quick Check keys (done 2026-10-02)

The Quick Check (Cloudflare Turnstile) must use real keys from one widget:

| Where | Setting | Value |
|---|---|---|
| Cloudflare → Turnstile | Widget hostnames | `cw-realty.onyxventuresnc.workers.dev`, plus the final domain at launch |
| Cloudflare → Workers & Pages → `cw-realty` → Settings → Build → Variables and secrets | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the widget's **site key** (starts `0x4`) |
| Cloudflare → Workers & Pages → `cw-realty` → Settings → Variables and Secrets | `TURNSTILE_SECRET_KEY` (secret) | the widget's **secret key** |
| Supabase → Authentication → Attack Protection | CAPTCHA protection → Turnstile | the same secret key |

- The site key is written into the pages when the site is **built**, so change it, then start a new build (Deployments → Retry build).
- Never set `NEXT_PUBLIC_ALLOW_TURNSTILE_TEST_KEYS` on the live build. Only local previews and the automated tests use it. Without it, production refuses Cloudflare's test keys and records a critical `site.bot_check` / `test_key_in_production` problem.
- Pages opened before a key change refresh themselves (sign-in) or offer **Refresh page** (public forms), keeping what was typed.

## 2. Switch on the assistant

1. Cloudflare → Workers & Pages → `cw-realty` → Settings → Variables and Secrets: add the secret `ANTHROPIC_API_KEY`.
2. Claude Console → the key's workspace → Limits: set a **monthly spend limit**. When it is reached the API refuses calls; visitors are offered a person and a critical `site.chat_assistant` problem (code `http_400` or `http_429_spend_cap`) is recorded.
3. Admin → Chatbot policy:
   1. Write the policy. Each heading is a section the assistant can cite.
   2. Add a few test questions.
   3. Run the tests.
   4. Publish once every test passes.
4. Ask 2–3 real questions on the live site. Expect replies within about 20 seconds; after 15 seconds the chat says "Still working".
5. The rate limiter `CHAT_RATE_LIMITER` (namespace 1002, 10 messages a minute per visitor) is already in `wrangler.jsonc`.

## 3. Turn the assistant off

Admin → Chatbot policy → **Assistant on or off** → "Turn the assistant off" (owners only). While it is off, every visitor gets the "Talk to a person" form and the model is never called. Turn it back on the same way.

## 4. Read visitors' problems

Until the Problems page exists, read the log in Supabase → SQL editor. All of these queries are read-only.

### Website visitors, last 7 days, by kind

```sql
select action, code, severity, count(*), max(occurred_at) as last_seen
from cwr.problem_events
where origin in ('server_visitor', 'browser_visitor') and occurred_at > now() - interval '7 days'
group by 1, 2, 3 order by last_seen desc;
```

### Out-of-date pages and expired checks

```sql
select code, count(*) from cwr.problem_events
where code in ('outdated_page', 'stale_page', 'outdated_page_loop', 'captcha_expired')
group by 1;
```

### What the codes mean

| Action / code | Meaning | What to do |
|---|---|---|
| `site.bot_check` / `test_key_in_production`, `not_configured`, `wrong_site` (critical) | The Quick Check is set up wrong; it blocks everyone | Fix the keys (section 1) |
| `site.bot_check` / `rejected`, `expired`, `no_token` (info) | Ordinary bot filtering | Nothing |
| `site.bot_check` / `unreachable` (warning) | Cloudflare didn't answer; visitors were told to try again | Check Cloudflare status if it repeats |
| `site.bot_check_widget` / `test_site_key`, `missing_site_key` | A page was built without a working site key | Fix the build variable and rebuild |
| `site.chat_assistant` / `no_api_key`, `no_published_policy` | The assistant isn't set up | Section 2 |
| `site.chat_assistant` / `http_401`, `http_402`, `http_400`, `http_429_spend_cap` (critical) | Bad key, billing, spend limit, or retired model | Fix in the Claude Console |
| `site.chat_assistant` / `refusal`, `max_tokens`, `unreadable` (info) | No usable answer for one question; the visitor was offered a person | Review the policy if frequent |
| `site.chat_handoff` (error) | A "Talk to a person" request wasn't saved, so a lead may be lost | Look at the time and contact the visitor if known |
| `site.chat_message` / `hourly_cap` | 200 new chats in an hour; later visitors were offered a person | Usually a bot; check the rate limiter |
| `site.listing_photo` / `image_failed` | A listing photo didn't load | Re-upload the photo |

Visitor records never contain what anyone typed. Problem emails are paused (open item 11); when they resume, critical visitor problems will email the chosen owners.
