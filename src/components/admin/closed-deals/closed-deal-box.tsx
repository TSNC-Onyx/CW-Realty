"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useTransition, type FormEvent } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { useToast } from "@/components/admin/toast-provider";
import { getButtonClassName } from "@/components/ui/button-link";
import { saveClosedDealAction } from "@/lib/admin/closed-deals/actions";
import type { ThreadClosedDeal } from "@/lib/admin/closed-deals/queries";
import { moveToTrashAction, restoreFromTrashAction } from "@/lib/admin/trash/actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// "Closed deal" on a conversation (plan decision 11): record or correct the closing date and
// price; removing it goes to the trash with Undo (Admin §1, §7).

const CENTS_PER_DOLLAR = 100;

function getPriceText(valueCents: number | null): string {
  return valueCents === null ? "" : (valueCents / CENTS_PER_DOLLAR).toLocaleString("en-US");
}

export function ClosedDealBox({ threadId, deal }: { threadId: string; deal: ThreadClosedDeal | null }) {
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input = { closedOn: String(formData.get("closedOn") ?? ""), salePrice: String(formData.get("salePrice") ?? "") };
    startTransition(async () => {
      const result = await saveClosedDealAction(threadId, input);
      showToast({ tone: result.status === "success" ? "success" : "error", title: result.message });
    });
  };

  return (
    <div className="grid max-w-form gap-6">
      <p className="text-muted">When this lead becomes a sale, record it here. If they allowed advertising cookies, it goes into the Closed deals downloads for Google and Meta.</p>
      <form key={deal?.id ?? "new"} onSubmit={handleSubmit} noValidate className="grid gap-6">
        <AdminField name="closedOn" label="Closing date" type="date" defaultValue={deal?.closedOn ?? ""} />
        <AdminField name="salePrice" label="Sale price" isOptional inputMode="decimal" defaultValue={getPriceText(deal?.valueCents ?? null)} helperText="In dollars, like 350,000." />
        <div className="flex flex-wrap gap-3">
          <button type="submit" aria-busy={isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
            {isPending && <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" />}
            {isPending ? "Saving…" : "Save closed deal"}
          </button>
          {deal && (
            <QuickActionButton
              label="Remove"
              accessibleLabel="Move this closed deal to the trash"
              icon={Trash2}
              onRun={() => moveToTrashAction({ table: "closed_deals", id: deal.id })}
              undo={{ label: "Undo", onRun: () => restoreFromTrashAction({ table: "closed_deals", id: deal.id }) }}
            />
          )}
        </div>
      </form>
    </div>
  );
}
