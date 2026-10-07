import { Check } from "lucide-react";
import Link from "next/link";

import { getButtonClassName } from "@/components/ui/button-link";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import type { Audience, Plan, PlanItem, PlanTone } from "@/lib/content/selected-services";

// Style §11.10 plan card (docs/cwr-selected-services-plan.md): light cards sit on surface-soft
// under an ink rule; the recommended card sits on dark under a gold rule, with gold checks.
// The title's first letter (the CWR initials) is styled in globals.css (.plan-title).

const REQUEST_SECTION_HREF = "#request";
const START_LABEL = "Get started";

type ToneClasses = { card: string; muted: string; divider: string; check: string };

const TONE_CLASSES: Record<PlanTone, ToneClasses> = {
  light: { card: "bg-surface-soft border-ink", muted: "text-muted", divider: "border-line", check: "" },
  dark: { card: "tone-dark border-gold", muted: "text-on-dark-muted", divider: "border-divider-dark", check: "text-gold" },
};

// The full-service card spans the two-across grid row, so its button fits its label there.
const WIDE_BUTTON_CLASSES = "lg:w-auto lg:self-start xl:w-full xl:self-auto";

function PlanItemRow({ item, classes }: { item: PlanItem; classes: ToneClasses }) {
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

// The price line uses the Team name size, so it is always smaller than the plan title.
function PriceLine({ plan, classes }: { plan: Plan; classes: ToneClasses }) {
  const priceClass = plan.isPriceHighlighted ? "tone-dark px-2" : "";
  return (
    <p className="type-team-name mt-2">
      <span className={priceClass}>{plan.price}</span>
      <span className={`type-small font-regular ${classes.muted}`}>{` ${plan.priceNote}`}</span>
    </p>
  );
}

export function PlanCard({ plan, audience }: { plan: Plan; audience: Audience }) {
  const classes = TONE_CLASSES[plan.tone];
  const titleId = `${audience}-${plan.slug}`;
  const buttonClassName = getButtonClassName({ size: "l", variant: plan.tone === "dark" ? "main" : "secondary", tone: plan.tone });
  return (
    <article aria-labelledby={titleId} className={`flex flex-col border-t-2 p-6 md:p-10 ${classes.card}`}>
      <Eyebrow tone={plan.tone}>{plan.eyebrow}</Eyebrow>
      <h3 id={titleId} className="type-h3 plan-title">{plan.name}</h3>
      <PriceLine plan={plan} classes={classes} />
      <p className={`type-small mt-1 mb-4 ${classes.muted}`}>{plan.summary}</p>
      {plan.groups.map((group) => (
        <div key={group.label}>
          <p className={`border-b py-2 font-bold ${classes.divider}`}>{group.label}</p>
          <ul className="mb-4">
            {group.items.map((item) => <PlanItemRow key={item.title} item={item} classes={classes} />)}
          </ul>
        </div>
      ))}
      {plan.excludes && (
        <p className={`type-small mb-6 ${classes.muted}`}>
          <span className="font-bold">Not included:</span> {plan.excludes}
        </p>
      )}
      <Link
        href={REQUEST_SECTION_HREF}
        aria-label={`${START_LABEL} with ${plan.name} for ${audience}s`}
        className={`${buttonClassName} mt-auto w-full ${plan.isWide ? WIDE_BUTTON_CLASSES : ""}`}
      >
        {START_LABEL}
      </Link>
    </article>
  );
}
