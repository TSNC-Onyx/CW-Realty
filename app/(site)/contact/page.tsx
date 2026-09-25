import { Mail, MapPin, MessageSquare, Phone, User, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ContactForm } from "@/components/forms/contact-form";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings, type SiteSettings } from "@/lib/site/site-settings";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Call, text, email, or send Charlie Ward Realty a message.",
};

function ContactDetail({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Icon aria-hidden size={ICON_SIZE.button} className="mt-3 shrink-0" />
      <div>
        <p className="type-small pt-2 text-muted">{label}</p>
        {children}
      </div>
    </li>
  );
}

function ContactDetails({ settings }: { settings: SiteSettings | null }) {
  const contact = getContactLinks(settings);
  const address = settings?.officeAddress;
  if (!contact) return <p>Our phone number and email are not loading right now. Please try again in a few minutes.</p>;
  const linkClass = "flex min-h-11 items-center font-semibold underline underline-offset-4";
  const contactNames = settings?.contactNames ?? [];
  return (
    <ul className="grid gap-4">
      {contactNames.length > 0 && (
        <ContactDetail icon={User} label="Ask for">
          <p className="py-2.5 font-semibold">{contactNames.join(", ")}</p>
        </ContactDetail>
      )}
      <ContactDetail icon={Phone} label="Call">
        <a href={contact.callHref} className={linkClass}>{contact.displayPhone}</a>
      </ContactDetail>
      <ContactDetail icon={MessageSquare} label="Text">
        <a href={contact.textHref} className={linkClass}>Text us</a>
      </ContactDetail>
      <ContactDetail icon={Mail} label="Email">
        <a href={contact.emailHref} className={`${linkClass} break-all`}>{contact.email}</a>
      </ContactDetail>
      {address && (
        <ContactDetail icon={MapPin} label="Office">
          <address className="not-italic">
            {[...address.streetLines, address.cityLine].map((line) => (
              <span key={line} className="block">{line}</span>
            ))}
          </address>
        </ContactDetail>
      )}
    </ul>
  );
}

export default async function ContactPage() {
  const settings = await fetchSiteSettings();
  return (
    <>
      <PageIntro
        eyebrow="Contact"
        title="Contact us"
        lead="Tell us what you're looking for and an agent will get back to you. Prefer to talk now? Call or text us."
      />
      <Section labelledBy="contact-form-heading">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 id="contact-form-heading" className="type-h3 mb-6">Send us a message</h2>
            <ContactForm contact={getContactLinks(settings)} />
          </div>
          <aside aria-labelledby="contact-details-heading" className="border-t-2 border-ink bg-surface-soft p-6 lg:col-span-4 lg:col-start-9 lg:p-10">
            <h2 id="contact-details-heading" className="type-h3 mb-4">Reach us directly</h2>
            <ContactDetails settings={settings} />
          </aside>
        </div>
      </Section>
    </>
  );
}
