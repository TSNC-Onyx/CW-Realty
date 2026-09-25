import { MessageCircle, MessageSquare, Phone, type LucideIcon } from "lucide-react";

import { ChatLink } from "@/components/chat/chat-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { CONTACT_PAGE_PATH, type ContactLinks } from "@/lib/site/contact-links";

// Style §11.9 mobile action bar: Call, Text, Chat always reachable (Features §1).
// Chat opens the chat assistant (and the Contact page when JavaScript is off).

const ITEM_CLASS = "flex h-15 flex-col items-center justify-center gap-1 text-tag leading-none font-bold";

type ActionItem = { label: string; href: string; icon: LucideIcon };

function getDialerItems(contact: ContactLinks | null): ActionItem[] {
  return [
    { label: "Call", href: contact?.callHref ?? CONTACT_PAGE_PATH, icon: Phone },
    { label: "Text", href: contact?.textHref ?? CONTACT_PAGE_PATH, icon: MessageSquare },
  ];
}

export function ActionBar({ contact }: { contact: ContactLinks | null }) {
  return (
    <nav aria-label="Quick contact" className="tone-dark action-bar-safe-area fixed inset-x-0 bottom-0 z-30 border-t border-divider-dark lg:hidden">
      <ul className="grid grid-cols-3">
        {getDialerItems(contact).map(({ label, href, icon: Icon }) => (
          <li key={label}>
            <a href={href} className={ITEM_CLASS}>
              <Icon aria-hidden size={ICON_SIZE.actionBar} className="text-gold" />
              {label}
            </a>
          </li>
        ))}
        <li>
          <ChatLink className={ITEM_CLASS}>
            <MessageCircle aria-hidden size={ICON_SIZE.actionBar} className="text-gold" />
            Chat
          </ChatLink>
        </li>
      </ul>
    </nav>
  );
}
