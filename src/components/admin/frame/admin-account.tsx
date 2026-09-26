import { ROLE_LABELS, type AdminRole } from "@/lib/admin/require-admin-roles";

export type AdminAccountSummary = { email: string; role: AdminRole };

type EmailFit = "truncate" | "wrap";

const EMAIL_FIT_CLASSES: Record<EmailFit, string> = { truncate: "truncate", wrap: "break-all" };

// Who is signed in. On desktop a long email is cut with "…" (full address on hover);
// in the phone menu it wraps instead.
export function AdminAccount({ account, emailFit }: { account: AdminAccountSummary; emailFit: EmailFit }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="sr-only">Signed in as</span>
      <span title={account.email} className={`text-sm font-semibold ${EMAIL_FIT_CLASSES[emailFit]}`}>
        {account.email}
      </span>
      <span className="inline-flex items-center gap-2 type-tag leading-label text-on-dark-muted">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-gold" />
        {ROLE_LABELS[account.role]}
      </span>
    </div>
  );
}
