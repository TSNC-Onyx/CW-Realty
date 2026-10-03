"use client";

import { Rocket } from "lucide-react";

import { PolicyTestRunButton } from "@/components/admin/chat-policy/policy-test-run-button";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { publishPolicyAction } from "@/lib/admin/chat-policy/actions";

// Admin §6 "changes publish only after a test run passes": Publish stays off until the
// latest run for this draft passed, and while a run is going; the database checks the same rule.

type PolicyPublishingProps = { draftId: string; isReadyToPublish: boolean; isRunning: boolean; onRunningChange: (isRunning: boolean) => void };

export function PolicyPublishing({ draftId, isReadyToPublish, isRunning, onRunningChange }: PolicyPublishingProps) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <PolicyTestRunButton draftId={draftId} onRunningChange={onRunningChange} />
      <QuickActionButton label="Publish this draft" accessibleLabel="Publish this draft to the website chat" icon={Rocket} problemAction="chat_policy.publish" onRun={() => publishPolicyAction(draftId)} isDisabled={!isReadyToPublish || isRunning} />
    </div>
  );
}
