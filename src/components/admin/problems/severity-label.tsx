import { CircleAlert, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";

import { ICON_SIZE } from "@/lib/design/icon-sizes";
import type { ProblemSeverity } from "@/lib/observability/problem-types";

const SEVERITY_LABELS: Record<ProblemSeverity, string> = { info: "Note", warning: "Warning", error: "Error", critical: "Critical" };
const SEVERITY_ICONS: Record<ProblemSeverity, LucideIcon> = { info: Info, warning: TriangleAlert, error: CircleAlert, critical: OctagonAlert };

// Severity shown with an icon and a word, never color alone (Style §2).
export function SeverityLabel({ severity }: { severity: ProblemSeverity }) {
  const Icon = SEVERITY_ICONS[severity];
  return (
    <span className="type-small inline-flex items-center gap-1.5 font-semibold">
      <Icon aria-hidden size={ICON_SIZE.inline} />
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
