# Runbook: set up Ads & analytics

How to switch on Google Analytics, Google Ads, and the Meta (Facebook, Instagram) Pixel for the website, test
that nothing tracks a visitor who says no, and keep it tidy afterwards (docs/cwr-ads-analytics-review-plan.md,
docs/cwr-ads-analytics-fixes-plan.md).

Today (checked 2026-10-09) everything is **off**: no IDs are saved, visitors see no cookie banner, and nothing is
tracked. The website needs no change to switch on. You (or a helper you trust) do the steps below in your own
Google and Meta accounts, then paste two IDs into the admin.

Each part says "Skip if…" when you don't need it.

## 1. Before you start

You need these accounts, each owned by the business (not a person's private login, and not an agency's account):

| Account | What it's for | Needed? |
|---|---|---|
| Google Tag Manager | One "container" that holds every tracking tag. The website loads it only after a visitor agrees | Always |
| Google Analytics 4 | Visitor counts and which pages and ads bring leads | Recommended |
| Google Ads | Search and YouTube ads | Skip if you don't run Google ads |
| Meta Business (Events Manager) | Facebook and Instagram ads | Skip if you don't run Meta ads |

Never paste a container ID the business doesn't own: whatever is in that container runs on every page of the
website.

## 2. Build the Tag Manager container

In Google Tag Manager → **Create account** → container type **Web**.

1. **Admin → Container settings → Additional settings → Enable consent overview**. Then use the shield icon on
   the Tags page to check every tag in the steps below.

   **The second trigger, on four tags.** When a visitor allows one more kind of cookie while already on a page
   (for example Advertising after Analytics), the website sends the event `cwr_consent_update`. Make one Custom
   Event trigger named `cwr_consent_update` (event name `cwr_consent_update`). Add it as a **second trigger** on
   the GA4 Google tag (step 2), the Conversion Linker (step 3), the Google tag with your Google Ads ID (step 4), and
   the Meta Pixel base tag (step 7). On each of those four tags open **Advanced settings → Tag firing options** and
   choose **Once per page**, so a tag that already ran on the page doesn't run twice.
2. **Google tag (Google Analytics 4)**: Tags → New → Google tag → your GA4 Measurement ID (`G-…`) → trigger
   **Initialization – All Pages**, plus the second trigger `cwr_consent_update`. In its consent settings choose
   **Require additional consent for tag to fire → `analytics_storage`**, so it never runs for a visitor who
   allowed only Advertising. Tag firing options: **Once per page**.
3. **Conversion Linker** (skip if you don't run Google ads): Tags → New → Conversion Linker → trigger
   **Initialization – All Pages**, plus the second trigger `cwr_consent_update`. The Conversion Linker keeps the
   Google Ads click code so a lead is credited to the ad. Consent settings: **Require additional consent for tag
   to fire → `ad_storage`**. Tag firing options: **Once per page**.
4. **Google tag with your Google Ads ID** (skip if you don't run Google ads): Tags → New → Google tag → your
   Google Ads ID (`AW-…`, from Google Ads → Goals → Conversions → Tag setup) → the same two triggers as the
   Conversion Linker, the same consent setting (`ad_storage`), and **Once per page**.
5. **Key events**: the website sends these exact event names. Make a Custom Event trigger for each one you want,
   then a "Google Analytics: GA4 Event" tag with the same event name. In GA4 → Admin → Key events, mark them as key
   events.

   | Event name | When the website sends it |
   |---|---|
   | `cwr_call` | A visitor taps a phone number |
   | `cwr_text` | A visitor taps a text-message link |
   | `cwr_contact_form` | The contact form is sent |
   | `cwr_booking_request` | A TouchUp request is sent |
   | `cwr_chat_question` | The chat assistant answers a typed question |
   | `cwr_chat_topic` | A visitor picks a topic button in the chat |
   | `cwr_chat_handoff` | A visitor sends "Talk to a person" from the chat |

   Every event carries an `event_id`. When the visitor allowed advertising, the contact, TouchUp, and chat
   hand-off events also carry `user_data` with the email and phone already scrambled (hashed); the plain email and
   phone never reach Tag Manager.
6. **Google Ads** (skip if you don't run Google ads): a "Google Ads Conversion Tracking" tag per lead event above,
   with your Conversion ID and Label. Turn on **Include user-provided data from your website** and pick a
   "User-Provided Data" variable that reads the `user_data` data-layer field. In consent settings choose
   **Require additional consent for tag to fire → `ad_storage`**.
7. **Meta Pixel** (skip if you don't run Meta ads): Tags → New → **Community Template Gallery** → the Facebook
   Pixel template (don't use a "Custom HTML" tag; the website's security rules may block it). This is the only
   place the browser Pixel is added: the Pixel ID on the website's Ads & analytics page powers only the Meta
   server connection (part 5), and the two must be the same Pixel ID. The base tag (PageView) uses
   trigger **Initialization – All Pages**, plus the second trigger `cwr_consent_update`, and **Once per page**.
   Send `Lead` on `cwr_contact_form` and `cwr_chat_handoff` and `Schedule` on `cwr_booking_request`; set the
   template's **Event ID** to a Data Layer Variable named `event_id` so Meta counts each lead once. Require
   `ad_storage` consent as in step 6.

## 3. Test before you switch on

1. In Tag Manager press **Preview** and enter the website's address. Tag Assistant opens the site.
2. Press **Reject all** on the cookie banner. In Tag Assistant, **no tag should fire**. If any tag fires, fix its
   consent setting before going on.
3. Open "Cookie settings" in the footer and allow everything. Page views and the events above should now fire.
4. Optional: try a visitor with Global Privacy Control turned on in their browser; advertising tags must stay off.

(The banner only appears after step 4 below. You can do this test right after pasting the ID, before telling
anyone.)

## 4. Publish and switch on

1. In Tag Manager press **Submit → Publish**. Publish before pasting the ID: until a container is published,
   Google has nothing to send and nothing is recorded.
2. Admin → **Ads & analytics** (owners only) → paste the **Container ID** (`GTM-…`) and, if you use Meta, the
   **Pixel ID** (10–20 digits, from Meta Events Manager → Data sources; the same Pixel ID as the Meta Pixel tag in
   step 2.7) → **Save changes**.
3. The page shows "Tracking: on after each visitor agrees". From now on visitors see the cookie banner. If it says
   "Tracking: not working — Google can't find a published container", publish the container (step 1) or check the
   ID; the message goes away by itself once Google finds it.

## 5. Meta server connection (skip if you don't run Meta ads)

This lets the website confirm leads to Meta directly, which counts leads that ad blockers would hide.

1. Meta Business settings → **System users** → add a system user with access to the Pixel → **Generate token**
   with the `ads_management` permission and **no expiry** (a token that expires would quietly stop the
   connection).
2. Your developer adds it in Cloudflare → Workers & Pages → `cw-realty` → Settings → Variables and Secrets as the
   secret `META_CAPI_ACCESS_TOKEN`.
3. The Ads & analytics page then shows "Meta server connection: on — no lead sent to Meta yet", and after the
   first lead "last lead sent to Meta" with the date. If it says "not working", the access token or the Pixel ID
   is wrong or has expired; the dashboard warns "Leads can't be sent to Meta" until a lead gets through again.

Optional: a server-side tagging address (Google Cloud or a host such as Stape) goes in the Worker variable
`TAG_SERVER_URL`; the page then shows "Server-side tagging: on".

## 6. Ad account settings (required before any ad runs)

- **Housing**: mark every Google Ads and Meta campaign as **Housing** (Special Ad Category). Fair-housing rules
  require it; the website already never sends age, gender, ZIP code, city, or address.
- **Closed deal**: in Google Ads → Goals → Conversions → New → Import → "Track conversions from clicks", named
  exactly **Closed deal**.
- **Campaign links**: add UTM tags (`utm_source`, `utm_medium`, `utm_campaign`) to every ad link so leads show
  which campaign they came from.
- **Enhanced conversions and the customer data terms** (Google Ads; do this before the first closed-deal upload in
  part 7): Google Ads → Goals → Settings → **Customer data use** → **Turn on enhanced conversions** → **Agree and
  save** → review the customer data terms → **Agree and continue**. Without it Google can't match the hashed email
  and phone in the website's events and the closed-deal file. (Since June 2026 Google combines the web and leads
  settings in this one switch.)

## 7. Every month: closed deals

Before the first upload, turn on enhanced conversions and accept the customer data terms (part 6, **Customer data
use**).

1. When a website lead becomes a sale, open their conversation in Admin → **Inbox** and record it in the
   **Closed deal** box (date, and the sale price if you have it).
2. Admin → **Closed deals** → **Download for Google Ads** and **Download for Meta**.
3. Upload them: Google Ads → Goals → Conversions → **Uploads**; Meta Events Manager → your data set → **Upload
   offline events**.

Only leads that allowed advertising cookies are included. Google accepts sales up to 90 days after the ad click;
Meta may ignore sales older than 62 days and needs a sale price, so upload monthly. (In 2026 Google moved
*automatic* uploads to its new Data Manager; uploading a downloaded file by hand, as here, still works.)

## 8. Every 3 months: tag review

Open Tag Manager, remove any tag you no longer use, re-check consent on the rest (step 2.1), and check that the
Meta Pixel tag uses the same Pixel ID as the Ads & analytics page (step 2.7). If the two differ, browser and server
events land in different places and Meta can't match them. Then press **Mark tags reviewed** on the Ads &
analytics page. The dashboard reminds you when a review is due.

## 9. Switch everything off

Admin → Ads & analytics → clear the Container ID → **Save changes**. Visitors stop seeing the banner and nothing
loads. Clearing the Pixel ID stops the Meta server connection.

## 10. Optional: show ads again to past visitors

Skip if you don't want retargeting. Only visitors who allowed advertising cookies are ever in these lists.

1. **Link GA4 and Google Ads**: GA4 → Admin → Product links → **Google Ads links** → link your Google Ads account
   and turn on **personalized advertising**.
2. **Google signals** (optional): GA4 → Admin → Data collection → **Google signals**. It adds Google's own data
   about signed-in Google users to your reports and lists; leave it off if you'd rather not.
3. **Google Ads audience**: Google Ads → Tools → Audience manager → new audience from your GA4 website visitors.
4. **Meta audience**: Meta Events Manager → **Custom audience** → **Website** → people who visited (from the
   Pixel).
5. **Housing rules** (Special Ad Category **Housing**, required by fair-housing law): never build or narrow an
   audience by age, gender, ZIP code, parental status, or marital status. Meta lookalike audiences are not
   available for Housing ads.

## Why the numbers look lower than visitor counts

The website asks first, so visitors who press **Reject all** (or use Global Privacy Control) aren't counted by
Google or Meta. That's expected; the inbox still receives every lead.

The website uses Google's **basic consent mode** on purpose (Features §4: nothing tracks before a visitor agrees).
People who leave before choosing, or who press Reject all, aren't counted at all, and nothing is sent about them.
Google fills in some of the missing conversions from a general model, not one built for this website, so Google Ads
may show fewer conversions than leads in the inbox. The inbox still gets every lead.
