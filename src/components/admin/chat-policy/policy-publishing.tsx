"use client";

import { FlaskConical, Rocket } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { publishPolicyAction, runPolicyTestsAction } from "@/lib/admin/chat-policy/actions";

// Admin §6 "changes publish only after a test run passes": Publish stays off until the
// latest run for this draft passed; the database checks the same rule.

type PolicyPublishingProps = { draftId: string; isReadyToPublish: boolean };

export function PolicyPublishing({ draftId, isReadyToPublish }: PolicyPublishingProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <QuickActionButton label="Run the tests" accessibleLabel="Run the tests on the saved draft" icon={FlaskConical} onRun={() => runPolicyTestsAction(draftId)} />
      <QuickActionButton label="Publish this draft" accessibleLabel="Publish this draft to the website chat" icon={Rocket} onRun={() => publishPolicyAction(draftId)} isDisabled={!isReadyToPublish} />
    </div>
  );
}
