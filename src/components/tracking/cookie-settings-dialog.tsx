"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { getButtonClassName } from "@/components/ui/button-link";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import type { ConsentChoice } from "@/lib/tracking/consent";

// "Cookie settings" (Style §11.13): a native modal dialog, so focus stays inside, Escape
// closes it, and focus returns to the link that opened it. Two choices plus the always-on
// essentials, explained in plain words.

const HEADING_ID = "cookie-settings-heading";

export type CookieSettingsDialogProps = {
  isOpen: boolean;
  choice: ConsentChoice | null;
  isGpcOn: boolean;
  onSave: (choice: ConsentChoice) => void;
  onClose: () => void;
};

type ChoiceRowProps = {
  name: keyof ConsentChoice;
  label: string;
  description: string;
  isChecked: boolean;
  isLocked: boolean;
  onToggle: (name: keyof ConsentChoice) => void;
};

function ChoiceRow({ name, label, description, isChecked, isLocked, onToggle }: ChoiceRowProps) {
  const descriptionId = `cookie-${name}-description`;
  return (
    <li className="border-t border-divider-dark py-4">
      <label className="flex min-h-11 items-center gap-3 text-md font-bold">
        <input type="checkbox" name={name} checked={isChecked} disabled={isLocked} onChange={() => onToggle(name)} aria-describedby={descriptionId} className="size-5 accent-gold" />
        {label}
      </label>
      <p id={descriptionId} className="type-small text-on-dark-muted">
        {description}
      </p>
    </li>
  );
}

export function CookieSettingsDialog({ isOpen, choice, isGpcOn, onSave, onClose }: CookieSettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<ConsentChoice>(choice ?? { analytics: false, ads: false });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const handleToggle = (name: keyof ConsentChoice) => setDraft((current) => ({ ...current, [name]: !current[name] }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ analytics: draft.analytics, ads: draft.ads && !isGpcOn });
  };

  const advertisingNote = isGpcOn ? " Your browser asks sites not to share your information, so this stays off." : "";
  return (
    <dialog ref={dialogRef} aria-labelledby={HEADING_ID} onClose={onClose} className="cookie-dialog tone-dark m-auto w-full border-0 p-0">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={HEADING_ID} className="type-h3">
            Cookie settings
          </h2>
          <button type="button" onClick={onClose} aria-label="Close cookie settings" className="-m-2 flex size-11 shrink-0 items-center justify-center">
            <X aria-hidden size={ICON_SIZE.button} />
          </button>
        </div>
        <ul>
          <li className="py-4">
            <p className="text-md font-bold">Needed to run the site (always on)</p>
            <p className="type-small text-on-dark-muted">Remembers these choices, keeps your chat in this tab, and checks that forms come from a person.</p>
          </li>
          <ChoiceRow name="analytics" label="Analytics" description="Google Analytics counts visits and which pages help people, so we can improve the site." isChecked={draft.analytics} isLocked={false} onToggle={handleToggle} />
          <ChoiceRow name="ads" label="Advertising" description={`Google Ads and Meta (Facebook, Instagram) measure which of our ads bring people to us.${advertisingNote}`} isChecked={draft.ads && !isGpcOn} isLocked={isGpcOn} onToggle={handleToggle} />
        </ul>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className={getButtonClassName({ size: "s", variant: "main", tone: "dark" })}>
            Save choices
          </button>
          <button type="button" onClick={onClose} className={getButtonClassName({ size: "s", variant: "secondary", tone: "dark" })}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
