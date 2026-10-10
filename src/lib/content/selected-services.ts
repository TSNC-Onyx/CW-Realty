// Selected services content (docs/cwr-selected-services-plan.md): the owner's deck, with
// copy and prices approved over the previews (2026-09-30 → 2026-10-02). The plan names
// start with C, W, and R — Charlie Ward Realty.
// Labels read Self-guided → Value Plus → Best Value (owner choice 2026-10-09,
// docs/cwr-plan-labels-plan.md); the dark featured look stays on Working With You for now.

export type PlanTone = "light" | "dark";

export type PlanItem = { title: string; detail?: string };

export type PlanGroup = { label: string; items: PlanItem[] };

export type Plan = {
  slug: string;
  name: string;
  tone: PlanTone;
  eyebrow: string;
  price: string;
  priceNote: string;
  /** The seller's 3% sits on a dark block (owner choice 2026-09-30). */
  isPriceHighlighted?: boolean;
  summary: string;
  groups: PlanGroup[];
  excludes?: string;
  /** Spans the row in the two-across grid (1024–1279px). */
  isWide?: boolean;
};

export type AddOnIcon = "house" | "listing" | "camera" | "door" | "document";

export type AddOn = { icon: AddOnIcon; name: string; price: string; unit?: string };

export type Audience = "buyer" | "seller";

export type PlanSection = { audience: Audience; id: string; heading: string; lead: string; plans: Plan[]; addOnsNote: string; addOns: AddOn[] };

export const DIRECT_LINE = { display: "336-708-0960", href: "tel:+13367080960" };

const BUYER_PLANS: Plan[] = [
  {
    slug: "consultation-plus",
    name: "Consultation Plus",
    tone: "light",
    eyebrow: "Self-guided",
    price: "$500",
    priceNote: "flat fee",
    summary: "Expert advice and one written offer. You lead the search.",
    groups: [
      {
        label: "Includes:",
        items: [
          { title: "Home buying consultation", detail: "30 minutes on the process, costs, and timing" },
          { title: "One home tour", detail: "In person or virtual, when you ask" },
          { title: "Comparative market analysis", detail: "For up to 2 homes you pick" },
          { title: "Property disclosures and public records" },
          { title: "Offer advice and a written offer", detail: "For 1 home, on the NC standard Offer to Purchase and Contract" },
        ],
      },
    ],
    excludes: "negotiation, counteroffer strategy, or managing the deal to closing.",
  },
  {
    slug: "working-with-you",
    name: "Working With You",
    tone: "dark",
    eyebrow: "Value Plus",
    price: "$500",
    priceNote: "per service",
    summary: "Help after your offer is accepted. Pick one service or both.",
    groups: [
      {
        label: "Due diligence service, $500:",
        items: [
          { title: "Contract walkthrough", detail: "Key deadlines, terms, and your responsibilities" },
          { title: "Negotiation strategy call", detail: "Up to 45 minutes, plus 1 NC Due Diligence Request and Agreement" },
          { title: "After-inspection advice", detail: "Includes a BOSSCAT repair cost report" },
          { title: "Trusted vendor referrals", detail: "Inspectors, lenders, attorneys, contractors" },
        ],
      },
      {
        label: "Settlement support service, $500:",
        items: [
          { title: "Negotiation support", detail: "Offers, counteroffers, and contract changes" },
          { title: "Closing coordination", detail: "We manage the steps and attend your closing" },
        ],
      },
    ],
    excludes: "a buyer agency agreement. We advise you, but we don't act as your agent.",
  },
  {
    slug: "ready-through-close",
    name: "Ready Through Close",
    tone: "light",
    eyebrow: "Best Value",
    price: "Commission",
    priceNote: "based on each home sale",
    summary: "Your agent from the first showing to the keys.",
    groups: [
      {
        label: "Everything above, plus:",
        items: [
          { title: "Signed buyer agency agreement", detail: "We act as your agent, with full duties to you" },
          { title: "Unlimited showings and market analyses" },
          { title: "Pricing strategy and offer submission" },
          { title: "Full negotiation" },
          { title: "All paperwork completed and checked", detail: "Including earnest money and due diligence" },
          { title: "Lender introductions", detail: "After you're pre-approved" },
          { title: "Final walkthrough and closing" },
        ],
      },
    ],
    isWide: true,
  },
];

const SELLER_PLANS: Plan[] = [
  {
    slug: "consultation-plus",
    name: "Consultation Plus",
    tone: "light",
    eyebrow: "Self-guided",
    price: "$500",
    priceNote: "flat fee",
    summary: "A clear plan, then you run the sale.",
    groups: [
      {
        label: "Includes:",
        items: [
          { title: "Comparative market analysis", detail: "What similar nearby homes sold for" },
          { title: "90-minute strategy session", detail: "Pricing, presentation, and timing" },
          { title: "Home preparation checklist", detail: "Cleaning, staging, and small repairs" },
          { title: "Trusted vendor list", detail: "Photographers, stagers, contractors, attorneys" },
          { title: "Follow-up call within 7 days" },
        ],
      },
    ],
    excludes: "an MLS listing, negotiation, or preparing documents for you.",
  },
  {
    slug: "working-with-you",
    name: "Working With You",
    tone: "dark",
    eyebrow: "Value Plus",
    price: "$1,000",
    priceNote: "flat fee",
    summary: "Expert help from listing to closing. You stay in charge.",
    groups: [
      {
        label: "All of Consultation Plus, plus:",
        items: [
          { title: "Listing preparation", detail: "Summary, photos, and details for sale-by-owner sites and social media" },
          { title: "Offer review and negotiation advice", detail: "Written and verbal advice on price, concessions, and timelines" },
          { title: "Contract preparation", detail: "NC Offer to Purchase and Contract, once you accept an offer" },
          { title: "Inspection and closing support", detail: "After-inspection call and a closing checklist" },
        ],
      },
    ],
    excludes: "a listing agreement, marketing, or attending closing. We advise you, but we don't act as your agent.",
  },
  {
    slug: "ready-through-close",
    name: "Ready Through Close",
    tone: "light",
    eyebrow: "Best Value",
    price: "3%",
    priceNote: "commission",
    isPriceHighlighted: true,
    summary: "We list, market, and sell your home for you.",
    groups: [
      {
        label: "Everything above, plus:",
        items: [
          { title: "Signed listing agreement", detail: "We act as your agent, with full duties to you" },
          { title: "Advertising and marketing", detail: "Pre-public listing, yard signs, and open houses" },
          { title: "Offer review", detail: "Offer to Purchase and related documents" },
          { title: "Due diligence guidance" },
          { title: "Full negotiation", detail: "Including buyer and seller concessions" },
          { title: "Closing document review", detail: "We troubleshoot problems before closing" },
          { title: "Closing attendance", detail: "We hand the keys to your buyer" },
        ],
      },
    ],
    isWide: true,
  },
];

export const PLAN_SECTIONS: PlanSection[] = [
  {
    audience: "buyer",
    id: "buyer-plans",
    heading: "Buyer plans",
    lead: "Start with advice, add help after your offer, or have us with you all the way to the keys.",
    plans: BUYER_PLANS,
    addOnsNote: "Add to Consultation Plus.",
    addOns: [{ icon: "house", name: "Additional home showing", price: "$40", unit: "per home" }],
  },
  {
    audience: "seller",
    id: "seller-plans",
    heading: "Seller plans",
    lead: "Sell your home your way, with expert guidance at the steps you choose.",
    plans: SELLER_PLANS,
    addOnsNote: "Add to Consultation Plus or Working With You at any time.",
    addOns: [
      { icon: "listing", name: "MLS entry-only listing", price: "$300" },
      { icon: "camera", name: "Professional photography", price: "$150" },
      { icon: "door", name: "Open house support", price: "$200" },
      { icon: "document", name: "Additional offer review", price: "$100", unit: "per offer" },
    ],
  },
];

// Approved by the broker in charge, 2026-10-02 (21 NCAC 58A .0105).
export const AGREEMENT_POINTS = [
  "Every plan starts with a written agreement that lists exactly what's included.",
  "With Consultation Plus and Working With You, we advise you but don't act as your agent.",
  "Ready Through Close includes a signed agency agreement, so we act as your agent.",
  "Whatever you choose, we're honest with everyone and share important facts about a home, as NC law requires.",
];

/** The short price shown in the carousel's plan list ("$500 each" for a per-service price). */
export function getListPrice(plan: Plan): string {
  return plan.priceNote === "per service" ? `${plan.price} each` : plan.price;
}
