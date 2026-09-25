"use client";

import { Send } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { sendTestAlertAction } from "@/lib/admin/notifications/actions";

export function TestAlertButton({ isDisabled }: { isDisabled: boolean }) {
  return <QuickActionButton label="Send test alert" accessibleLabel="Send a test alert to everyone who gets alerts" icon={Send} isDisabled={isDisabled} onRun={sendTestAlertAction} />;
}
