"use client";

import { Power, PowerOff } from "lucide-react";

import { QuickActionButton } from "@/components/admin/quick-action-button";
import { setAssistantOnAction } from "@/lib/admin/chat-policy/actions";

// Owners only (decision D4): turn the website chat assistant off without deleting anything.
// While it's off, every visitor gets the "talk to a person" form.

export function AssistantSwitch({ isOn }: { isOn: boolean }) {
  return (
    <div className="grid max-w-prose justify-items-start gap-4">
      <p className="font-semibold">{isOn ? "On — the assistant answers visitors from the live policy." : "Off — every visitor is offered a person."}</p>
      {isOn ? (
        <QuickActionButton label="Turn the assistant off" accessibleLabel="Turn the website chat assistant off" icon={PowerOff} problemAction="chat_policy.set_assistant" onRun={() => setAssistantOnAction({ isOn: false })} />
      ) : (
        <QuickActionButton label="Turn the assistant on" accessibleLabel="Turn the website chat assistant on" icon={Power} problemAction="chat_policy.set_assistant" onRun={() => setAssistantOnAction({ isOn: true })} />
      )}
    </div>
  );
}
