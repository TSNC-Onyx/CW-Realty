import type { Metadata } from "next";

import { CookieSettingsLink } from "@/components/tracking/cookie-settings-link";
import { PageIntro } from "@/components/ui/page-intro";
import { Prose } from "@/components/ui/prose";
import { Section } from "@/components/ui/section";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Describes what the site actually does (Features §4): every tracker, every kind of browser
// storage, and how the chat assistant uses what visitors type. Update LAST_UPDATED, and raise
// CONSENT_VERSION in src/lib/tracking/consent.ts, whenever trackers or their purposes change.

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Charlie Ward Realty collects, uses, and protects your information, including cookies and the chat assistant.",
};

const LAST_UPDATED = "September 25, 2026";

function ContactSentence({ email, phone }: { email: string | null; phone: string | null }) {
  if (!email || !phone) return <p>Contact us through the Contact page, or visit our office.</p>;
  return (
    <p>
      {"Email "}
      <a href={`mailto:${email}`}>{email}</a>
      {` or call ${phone}.`}
    </p>
  );
}

export default async function PrivacyPolicyPage() {
  const settings = await fetchSiteSettings();
  const contact = getContactLinks(settings);
  return (
    <>
      <PageIntro eyebrow="Legal" title="Privacy policy" lead={`How Charlie Ward Realty LLC handles your information. Last updated ${LAST_UPDATED}.`} />
      <Section labelledBy="collect-heading">
        <Prose>
          <h2 id="collect-heading">What we collect</h2>
          <ul>
            <li>What you send us in a form: your name, email, phone number, and your message. A CWR TouchUp request also includes the home&apos;s address and times that work for you.</li>
            <li>What you type into our chat assistant (see &ldquo;Our chat assistant&rdquo; below).</li>
            <li>Basic technical details our hosting provider records for every visit, such as your IP address, browser type, and the pages you requested. We use them only to keep the site secure and working.</li>
            <li>If you agree to cookies: how you use the site and which of our ads brought you here (see &ldquo;Cookies and tracking&rdquo; below).</li>
          </ul>
          <p>We never ask for financial account, Social Security, or ID numbers on this website.</p>

          <h2 id="chat">Our chat assistant</h2>
          <p>The &ldquo;CWR Assistant&rdquo; is an AI, not a person. It answers only from information our team has approved.</p>
          <ul>
            <li>Your questions are sent to Anthropic, the company that makes the Claude AI, so it can write an answer. Anthropic processes them for us to provide this service.</li>
            <li>We keep a record of each chat for one year after its last message, so our team can check the answers are accurate and helpful.</li>
            <li>The assistant does not ask for your name or contact details. They are saved only if you choose &ldquo;Talk to a person&rdquo; and fill in that form; your message then goes to our team&apos;s inbox.</li>
            <li>If you type something that looks like a bank, card, Social Security, or ID number, it is removed before the assistant sees it and is never saved.</li>
            <li>Your browser keeps the conversation in this tab (session storage named &ldquo;cwr-chat&rdquo;) so it survives moving between pages. It is deleted when you close the tab.</li>
          </ul>

          <h2>How we use it</h2>
          <ul>
            <li>To answer your questions and schedule the visits you ask for.</li>
            <li>To keep a record of our conversation with you so any team member can pick it up.</li>
            <li>To protect the website from misuse.</li>
            <li>Only if you agree: to understand how people use the site and to measure which of our ads work.</li>
          </ul>

          <h2>Who we share it with</h2>
          <p>
            The companies that run this website for us: our hosting and security provider (Cloudflare), our database provider
            (Supabase), our email provider (MailerSend), and our chat AI provider (Anthropic). They may use your information only
            to provide those services. If you agree to cookies, Google and Meta also receive the information described below. We
            also share information when the law requires it.
          </p>
          <p>
            We do not sell your personal information. We share it for advertising only if you agree, and you can say no at any
            time.
          </p>

          <h2 id="cookies">Cookies and tracking</h2>
          <p>
            Nothing below marked &ldquo;only if you agree&rdquo; runs until you choose it in our cookie banner. If your browser sends a
            Global Privacy Control signal, we treat it as a &ldquo;no&rdquo; to advertising and you cannot switch advertising on.
          </p>
          <p>
            <CookieSettingsLink className="">Change your cookie settings</CookieSettingsLink>
          </p>
          <p>
            <strong>Always on (needed to run the site)</strong>
          </p>
          <ul>
            <li>&ldquo;cwr_consent&rdquo; cookie: remembers your cookie choices for 6 months.</li>
            <li>&ldquo;cwr-chat&rdquo; session storage: keeps your chat in this tab (see above).</li>
            <li>Cloudflare Turnstile: checks that forms and chats come from a person, not a bot.</li>
          </ul>
          <p>
            <strong>Analytics (only if you agree)</strong>
          </p>
          <ul>
            <li>Google Analytics, loaded through Google Tag Manager: counts visits and which pages help people. Its cookies (names starting with &ldquo;_ga&rdquo;, and &ldquo;FPID&rdquo; and &ldquo;FPLC&rdquo; if we measure through our own server) last up to 2 years.</li>
          </ul>
          <p>
            <strong>Advertising (only if you agree)</strong>
          </p>
          <ul>
            <li>Google Ads: measures which of our Google ads led to a call, message, or request. Cookies starting with &ldquo;_gcl&rdquo; last up to 90 days.</li>
            <li>Meta Pixel (Facebook and Instagram): measures which of our Meta ads led to a call, message, or request. Cookies &ldquo;_fbp&rdquo; and &ldquo;_fbc&rdquo; last up to 90 days.</li>
            <li>
              When you send a form or &ldquo;Talk to a person&rdquo; request, our server may also tell Meta directly, and your browser may tell
              Google. We send your email and phone number only in scrambled (hashed) form, plus your IP address, browser type, and the
              page you were on.
            </li>
            <li>
              If you arrived from one of our ads, we keep the ad&apos;s click code and campaign name with your message
              (&ldquo;cwr-attribution&rdquo; session storage until then).
            </li>
            <li>If you later buy or sell a home with us, we may tell Google and Meta about the sale, again with your email and phone only in hashed form.</li>
          </ul>
          <p>
            We never send your name, address, age, or gender to Google or Meta, and our housing ads are not targeted by age, gender,
            or ZIP code. We review these tools every three months and remove any we no longer use.
          </p>

          <h2>How long we keep it</h2>
          <ul>
            <li>Messages and requests, and any ad details kept with them: one year after the conversation is closed.</li>
            <li>Chat assistant conversations: one year after the last message.</li>
            <li>Records of changes made by our staff: three years.</li>
            <li>Your cookie choice: 6 months, then we ask again.</li>
          </ul>

          <h2>How we protect it</h2>
          <p>Your information is encrypted in transit and at rest, and only our team members who need it can see it.</p>

          <h2>Children</h2>
          <p>This website is not meant for children under 18, and we do not knowingly collect their information.</p>

          <h2>Your choices</h2>
          <p>You can change your cookie choices at any time from the Cookie settings link at the bottom of every page. You can also ask us to show, correct, or delete the information we hold about you.</p>
          <ContactSentence email={contact?.email ?? null} phone={contact?.displayPhone ?? null} />

          <h2>Changes to this policy</h2>
          <p>When we change this policy we will update the date at the top of this page.</p>
        </Prose>
      </Section>
    </>
  );
}
