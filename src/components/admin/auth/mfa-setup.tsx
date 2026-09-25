"use client";

import { LoaderCircle } from "lucide-react";
import { startTransition, useActionState } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AuthForm } from "@/components/admin/auth/auth-form";
import { useAuthForm } from "@/components/admin/auth/use-auth-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { Message } from "@/components/ui/message";
import { IDLE_ACTION_STATE } from "@/lib/admin/action-state";
import { confirmMfaSetupAction, startMfaSetupAction, type MfaSetupState } from "@/lib/admin/auth-actions";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

const EMPTY_SETUP: MfaSetupState = { ...IDLE_ACTION_STATE, factorId: "", qrCode: "", secret: "" };
const QR_SIZE_PX = 200;

function ConfirmCode({ setup, next }: { setup: MfaSetupState; next: string }) {
  const { state, isPending, handleSubmit } = useAuthForm(confirmMfaSetupAction, setup);
  return (
    <div className="grid gap-6">
      <div className="grid justify-items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- the QR code is an SVG data URL made by Supabase Auth */}
        <img src={setup.qrCode} alt="QR code to add CWR to your authenticator app" width={QR_SIZE_PX} height={QR_SIZE_PX} className="border border-line bg-surface p-2" />
        <p className="type-small text-muted">
          Can&apos;t scan? Enter this key in the app instead:{" "}
          <code className="font-bold break-all text-ink" data-testid="mfa-secret">
            {setup.secret}
          </code>
        </p>
      </div>
      <AuthForm state={state.responseId === setup.responseId ? IDLE_ACTION_STATE : state} isPending={isPending} submitLabel="Turn on sign-in codes" pendingLabel="Checking…" onSubmit={handleSubmit}>
        <input type="hidden" name="next" value={next} />
        <AdminField name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} error={state.fieldErrors.code} />
      </AuthForm>
    </div>
  );
}

// Authenticator setup: every admin role signs in with a password plus an app code.
export function MfaSetup({ next }: { next: string }) {
  const [setup, startSetup, isStarting] = useActionState(startMfaSetupAction, EMPTY_SETUP);
  if (setup.factorId) return <ConfirmCode setup={setup} next={next} />;
  return (
    <div className="grid gap-6">
      {setup.status === "error" && <Message tone="error" title={setup.message} />}
      <ol className="grid list-decimal gap-2 pl-6">
        <li>Install an authenticator app, such as Google Authenticator, Microsoft Authenticator, or 1Password.</li>
        <li>Press the button below, then scan the code with the app.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <button type="button" aria-busy={isStarting} onClick={() => startTransition(() => startSetup())} className={`${getButtonClassName({ size: "l", variant: "main" })} w-full`}>
        {isStarting && <LoaderCircle aria-hidden size={ICON_SIZE.button} className="animate-spin" />}
        {isStarting ? "Preparing…" : "Show my setup code"}
      </button>
    </div>
  );
}
