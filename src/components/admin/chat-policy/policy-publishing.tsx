"use client";

import { Rocket } from "lucide-react";

import { usePolicyDraftState } from "@/components/admin/chat-policy/policy-draft-state";
import { PolicyTestRunButton } from "@/components/admin/chat-policy/policy-test-run-button";
import { QuickActionButton } from "@/components/admin/quick-action-button";
import { publishPolicyAction } from "@/lib/admin/chat-policy/actions";

// Admin §6 "changes publish only after a test run passes": Publish stays off until the
// latest run for this draft passed, while a run is going, and while the editor holds unsaved
// text (bug 11); the server checks the same rule.

type PolicyPublishingProps = { draftId: string; isReadyToPublish: boolean };

export function PolicyPublishing({ draftId, isReadyToPublish }: PolicyPublishingProps) {
  const { isRunning, setIsRunning, hasUnsavedChanges } = usePolicyDraftState();
  return (
    <div className="flex flex-wrap items-start gap-3">
      <PolicyTestRunButton draftId={draftId} isBlocked={hasUnsavedChanges} onRunningChange={setIsRunning} />
      <QuickActionButton label="Publish this draft" accessibleLabel="Publish this draft to the website chat" icon={Rocket} problemAction="chat_policy.publish" onRun={() => publishPolicyAction(draftId)} isDisabled={!isReadyToPublish || isRunning || hasUnsavedChanges} />
    </div>
  );
}
