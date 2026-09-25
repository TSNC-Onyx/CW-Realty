import type { Metadata } from "next";

import { PageIntro } from "@/components/ui/page-intro";
import { Prose } from "@/components/ui/prose";
import { Section } from "@/components/ui/section";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Describes what the new site actually does. Phases 5 and 6 add the chat assistant
// and ad/analytics trackers to this page before they go live (Features §4).

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Charlie Ward Realty collects, uses, and protects your information.",
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
            <li>Basic technical details our hosting provider records for every visit, such as your IP address, browser type, and the pages you requested. We use them only to keep the site secure and working.</li>
          </ul>
          <p>We never ask for financial account, Social Security, or ID numbers on this website.</p>

          <h2>How we use it</h2>
          <ul>
            <li>To answer your questions and schedule the visits you ask for.</li>
            <li>To keep a record of our conversation with you so any team member can pick it up.</li>
            <li>To protect the website from misuse.</li>
          </ul>
          <p>We do not sell or rent your personal information.</p>

          <h2>Who we share it with</h2>
          <p>
            Only the companies that run this website for us: our hosting provider, our database provider, and our email
            provider. They may use your information only to provide those services. We also share information when the
            law requires it.
          </p>

          <h2 id="cookies">Cookies and tracking</h2>
          <p>
            This website does not use advertising or analytics cookies. If we add them, we will ask for your choice first,
            honor your browser&apos;s Global Privacy Control signal, and let you change your choice at any time from the
            Cookie settings link at the bottom of every page.
          </p>

          <h2>How long we keep it</h2>
          <p>
            Messages and requests are kept for one year after the conversation is closed, then deleted. Records of changes
            made by our staff are kept for three years.
          </p>

          <h2>How we protect it</h2>
          <p>Your information is encrypted in transit and at rest, and only our team members who need it can see it.</p>

          <h2>Children</h2>
          <p>This website is not meant for children under 18, and we do not knowingly collect their information.</p>

          <h2>Your choices</h2>
          <p>You can ask us to show, correct, or delete the information we hold about you.</p>
          <ContactSentence email={contact?.email ?? null} phone={contact?.displayPhone ?? null} />

          <h2>Changes to this policy</h2>
          <p>When we change this policy we will update the date at the top of this page.</p>
        </Prose>
      </Section>
    </>
  );
}
