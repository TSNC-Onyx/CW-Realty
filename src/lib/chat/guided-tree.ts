// Chat topic buttons (docs/cwr-chat-guided-options-plan.md §2): the owner-approved tree of
// labels, in-between prompts, and page links. UI copy only: each answer's wording lives in the
// owner's chatbot policy as a public "Quick answer: <label>" section, never in this repo.
// Imports nothing, so the chat widget can use it without the server code.

export type GuidedLink = { label: string; href: string };

/** A branch has children and a prompt; a leaf has an answer (from the policy, or the fixed emergency reply). */
export type GuidedNode = { id: string; label: string; prompt?: string; children?: string[]; link?: GuidedLink; isEmergency?: boolean };

export const GUIDED_ROOT_ID = "root";
const QUICK_ANSWER_PREFIX = "Quick answer: ";

// A pause before a topic answer, sized to its length, so it reads like a reply rather than a
// page jump (owner request 2026-10-06). Emergencies never wait.
const MIN_PAUSE_MS = 700;
const MAX_PAUSE_MS = 1500;
const PAUSE_PER_WORD_MS = 25;
const PAUSE_BASE_MS = 300;

const NODES: GuidedNode[] = [
  { id: GUIDED_ROOT_ID, label: "Choose a topic", children: ["buy-sell", "rentals", "touchup", "other"] },
  { id: "buy-sell", label: "Buy or sell a home", prompt: "Happy to help. Which one fits you?", children: ["buying", "selling", "home-worth"] },
  { id: "buying", label: "Buying a home", link: { label: "See buyer plans", href: "/services/selected-services#buyer-plans" } },
  { id: "selling", label: "Selling a home", link: { label: "See seller plans", href: "/services/selected-services#seller-plans" } },
  { id: "home-worth", label: "What's my home worth?", link: { label: "Request a free evaluation", href: "/contact" } },
  { id: "rentals", label: "Rentals & management", prompt: "Glad to help. Which describes you?", children: ["find-rental", "own-rental", "tenant"] },
  { id: "find-rental", label: "Find a place to rent", link: { label: "See featured properties", href: "/listings" } },
  { id: "own-rental", label: "I own a rental", link: { label: "Get expert property management", href: "/services/property-management" } },
  { id: "tenant", label: "I'm a tenant", prompt: "What do you need help with?", children: ["repair", "emergency"] },
  { id: "repair", label: "Request a repair" },
  { id: "emergency", label: "Emergency help", isEmergency: true },
  { id: "touchup", label: "CWR TouchUp", prompt: "What would you like to know about CWR TouchUp?", children: ["touchup-what", "touchup-cost", "touchup-start"] },
  { id: "touchup-what", label: "What is TouchUp?", link: { label: "See how TouchUp works", href: "/services/cwr-touchup" } },
  { id: "touchup-cost", label: "What does it cost?", link: { label: "Learn about TouchUp", href: "/services/cwr-touchup" } },
  { id: "touchup-start", label: "Get started", link: { label: "Request a TouchUp visit", href: "/services/cwr-touchup" } },
  { id: "other", label: "Something else", prompt: "Sure. What are you looking for?", children: ["selected-services", "listings", "team"] },
  { id: "selected-services", label: "Selected Services", link: { label: "Compare plans and prices", href: "/services/selected-services" } },
  { id: "listings", label: "Browse listings", link: { label: "See featured properties", href: "/listings" } },
  { id: "team", label: "About our team", link: { label: "Meet the team", href: "/team" } },
];

const NODES_BY_ID = new Map(NODES.map((node) => [node.id, node]));
const PARENT_IDS = new Map(NODES.flatMap((node) => (node.children ?? []).map((childId) => [childId, node.id] as const)));

export function getGuidedNode(id: string): GuidedNode | null {
  return NODES_BY_ID.get(id) ?? null;
}

export function getGuidedParentId(id: string): string | null {
  return PARENT_IDS.get(id) ?? null;
}

export function isGuidedLeaf(node: GuidedNode): boolean {
  return node.children === undefined;
}

/** Leaves whose answer comes from the policy (every leaf but the emergency one). */
export function getQuickAnswerLeaves(): GuidedNode[] {
  return NODES.filter((node) => isGuidedLeaf(node) && !node.isEmergency);
}

/** The policy section a leaf's answer comes from, for example "Quick answer: Buying a home". */
export function getQuickAnswerTitle(node: GuidedNode): string {
  return `${QUICK_ANSWER_PREFIX}${node.label}`;
}

function hasAvailableLeaf(node: GuidedNode, availableLeafIds: ReadonlySet<string>): boolean {
  if (isGuidedLeaf(node)) return node.isEmergency === true || availableLeafIds.has(node.id);
  return (node.children ?? []).some((childId) => {
    const child = getGuidedNode(childId);
    return child !== null && hasAvailableLeaf(child, availableLeafIds);
  });
}

/** The options to show under a branch: a leaf only when its answer exists, a branch only when something under it does. */
export function getVisibleChildren(branchId: string, availableLeafIds: ReadonlySet<string>): GuidedNode[] {
  const branch = getGuidedNode(branchId);
  return (branch?.children ?? []).flatMap((childId) => {
    const child = getGuidedNode(childId);
    return child && hasAvailableLeaf(child, availableLeafIds) ? [child] : [];
  });
}

/** The menu is offered only when at least one policy answer exists (the emergency leaf alone doesn't switch it on). */
export function hasGuidedMenu(availableLeafIds: ReadonlySet<string>): boolean {
  return getQuickAnswerLeaves().some((leaf) => availableLeafIds.has(leaf.id));
}

/** The branch whose options show next: a leaf shows its siblings, a branch its own options. */
export function getOptionsBranchId(currentId: string): string {
  const node = getGuidedNode(currentId);
  if (!node) return GUIDED_ROOT_ID;
  return isGuidedLeaf(node) ? (getGuidedParentId(currentId) ?? GUIDED_ROOT_ID) : currentId;
}

export function getGuidedPauseMs({ text, isEmergency }: { text: string; isEmergency: boolean }): number {
  if (isEmergency) return 0;
  const words = text.trim().split(/\s+/).length;
  return Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, words * PAUSE_PER_WORD_MS + PAUSE_BASE_MS));
}
