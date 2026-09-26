import { Camera, Check, DoorOpen, FileText, ListChecks, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/components/forms/contact-form";
import { getButtonClassName, type Tone } from "@/components/ui/button-link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PageIntro } from "@/components/ui/page-intro";
import { Section } from "@/components/ui/section";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { getContactLinks } from "@/lib/site/contact-links";
import { fetchSiteSettings } from "@/lib/site/site-settings";

// Link-only page (UNLISTED_PAGE_PATHS): not in the menu, sitemap, or search results.
// Design: owner's Option A, chosen 2026-09-26 (docs/seller-consulting-page-plan.md).

const REQUEST_SECTION_ID = "request";
const PRICE_NOTE = "Ask for pricing";

export const metadata: Metadata = {
  title: "Seller consulting",
  description: "Two seller consulting plans and optional add-ons from Charlie Ward Realty. Ask for pricing.",
  robots: { index: false, follow: false },
};

type PlanItem = { title: string; detail?: string };

type Plan = {
  tone: Tone;
  eyebrow: string;
  name: string;
  summary: string;
  includesLabel: string;
  items: PlanItem[];
};

type AddOn = { icon: LucideIcon; name: string; price: string; unit?: string };

const PLANS: Plan[] = [
  {
    tone: "light",
    eyebrow: "Self-guided",
    name: "Choice services",
    summary: "A clear plan, then you run the sale.",
    includesLabel: "Includes:",
    items: [
      { title: "Comparative market analysis", detail: "What similar nearby homes sold for" },
      { title: "90-minute strategy session", detail: "Pricing, presentation, and timing" },
      { title: "Home preparation checklist", detail: "Cleaning, staging, and small repairs" },
      { title: "Trusted vendor list", detail: "Photographers, stagers, contractors, attorneys" },
      { title: "Follow-up call within 7 days" },
    ],
  },
  {
    tone: "dark",
    eyebrow: "Best Value",
    name: "Well advised",
    summary: "Expert help from listing to closing.",
    includesLabel: "All of Choice services, plus:",
    items: [
      { title: "Listing preparation", detail: "Summary, photos, and details for sale-by-owner sites and social media" },
      { title: "Offer review and negotiation", detail: "Written and verbal advice on price, concessions, and timelines" },
      { title: "Contract preparation", detail: "NC Offer to Purchase and Contract, once you accept an offer" },
      { title: "Inspection and closing support", detail: "Post-inspection call and a closing checklist" },
    ],
  },
];

const ADD_ONS: AddOn[] = [
  { icon: ListChecks, name: "MLS entry-only listing", price: "$300" },
  { icon: Camera, name: "Professional photography", price: "$150" },
  { icon: DoorOpen, name: "Open house support", price: "$200" },
  { icon: FileText, name: "Additional offer review", price: "$100", unit: "per offer" },
];

// Style §11.10 plan card: light cards sit on surface-soft under an ink rule; the
// recommended card sits on dark under a gold rule, with gold checks.
const PLAN_CARD_CLASSES: Record<Tone, { card: string; muted: string; divider: string; check: string }> = {
  light: { card: "bg-surface-soft border-ink", muted: "text-muted", divider: "border-line", check: "" },
  dark: { card: "tone-dark border-gold", muted: "text-on-dark-muted", divider: "border-divider-dark", check: "text-gold" },
};

function PlanItemRow({ item, tone }: { item: PlanItem; tone: Tone }) {
  const classes = PLAN_CARD_CLASSES[tone];
  return (
    <li className="flex gap-3 py-2">
      <Check aria-hidden size={ICON_SIZE.inline} className={`mt-1 shrink-0 ${classes.check}`} />
      <span>
        {item.title}
        {item.detail && <span className={`type-small block ${classes.muted}`}>{item.detail}</span>}
      </span>
    </li>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const classes = PLAN_CARD_CLASSES[plan.tone];
  const buttonClassName = getButtonClassName({ size: "l", variant: plan.tone === "dark" ? "main" : "secondary", tone: plan.tone });
  return (
    <article aria-labelledby={`plan-${plan.tone}`} className={`flex flex-col border-t-2 p-6 md:p-10 ${classes.card}`}>
      <Eyebrow tone={plan.tone}>{plan.eyebrow}</Eyebrow>
      <h3 id={`plan-${plan.tone}`} className="type-h3">{plan.name}</h3>
      <p className={`type-small mt-1 mb-4 ${classes.muted}`}>{plan.summary}</p>
      <p className={`border-b py-2 font-bold ${classes.divider}`}>{plan.includesLabel}</p>
      <ul className="mb-6">
        {plan.items.map((item) => <PlanItemRow key={item.title} item={item} tone={plan.tone} />)}
      </ul>
      <Link href={`#${REQUEST_SECTION_ID}`} className={`${buttonClassName} mt-auto w-full`}>{PRICE_NOTE}</Link>
    </article>
  );
}

function AddOnRow({ addOn }: { addOn: AddOn }) {
  const Icon = addOn.icon;
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-line py-4">
      <span className="flex items-center gap-3">
        <Icon aria-hidden size={ICON_SIZE.inline} className="shrink-0" />
        {addOn.name}
      </span>
      <span className="font-bold whitespace-nowrap">
        {addOn.price}
        {addOn.unit && <span className="type-small font-normal text-muted">{` ${addOn.unit}`}</span>}
      </span>
    </li>
  );
}

function AddOnList() {
  return (
    <div className="mt-12 max-w-prose md:mt-16">
      <h3 className="type-h3">Optional add-ons</h3>
      <p className="type-small mt-1 mb-4 text-muted">Add to either plan at any time.</p>
      <ul className="border-t-2 border-ink">
        {ADD_ONS.map((addOn) => <AddOnRow key={addOn.name} addOn={addOn} />)}
      </ul>
    </div>
  );
}

export default async function SellerConsultingPage() {
  const settings = await fetchSiteSettings();
  return (
    <>
      <PageIntro eyebrow="Services" title="Seller consulting" lead="Sell your home your way, with expert guidance at the steps you choose." />
      <Section labelledBy="plans-heading">
        <h2 id="plans-heading" className="type-h2 mb-6 md:mb-10">Choose your level of support</h2>
        <div className="grid gap-8 md:grid-cols-2">
          {PLANS.map((plan) => <PlanCard key={plan.name} plan={plan} />)}
        </div>
        <AddOnList />
      </Section>
      <Section tone="soft" id={REQUEST_SECTION_ID} labelledBy="request-heading">
        <h2 id="request-heading" className="type-h2 mb-4">{PRICE_NOTE}</h2>
        <p className="mb-8 max-w-prose">Tell us which plan and add-ons you&apos;re interested in, and we&apos;ll send you pricing.</p>
        <ContactForm contact={getContactLinks(settings)} />
      </Section>
    </>
  );
}
