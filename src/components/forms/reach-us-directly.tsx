import type { ContactLinks } from "@/lib/site/contact-links";

// Other ways to reach the office when a form can't send (the Quick Check won't load, the page
// is out of date, or saving failed), so a visitor or staff member is never stuck.

export function ReachUsDirectly({ contact }: { contact: ContactLinks | null }) {
  if (!contact) return <p>We kept everything you typed. Please try again in a few minutes.</p>;
  return (
    <p>
      {"We kept everything you typed. You can also call "}
      <a href={contact.callHref} className="font-semibold underline underline-offset-4">
        {contact.displayPhone}
      </a>
      {" or email "}
      <a href={contact.emailHref} className="font-semibold break-all underline underline-offset-4">
        {contact.email}
      </a>
      .
    </p>
  );
}

export function CallUsLink({ contact }: { contact: ContactLinks | null }) {
  if (!contact) return null;
  return (
    <a href={contact.callHref} className="font-semibold underline underline-offset-4">
      {`Call ${contact.displayPhone}`}
    </a>
  );
}
