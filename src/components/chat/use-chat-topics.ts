"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { fetchGuidedMenuAction, recordGuidedStepAction } from "@/lib/chat/guided-actions";
import type { GuidedMenuResult } from "@/lib/chat/guided-steps";
import { GUIDED_ROOT_ID, getGuidedNode, getGuidedParentId, getGuidedPauseMs, getOptionsBranchId, getVisibleChildren, hasGuidedMenu, isGuidedLeaf, type GuidedNode } from "@/lib/chat/guided-tree";
import { EMERGENCY_TEXT } from "@/lib/chat/handoff-text";
import { getCallFailure } from "@/lib/observability/call-server-action";
import { reportVisitorClientProblem } from "@/lib/observability/report-client-problem";
import { pushKeyEvent } from "@/lib/tracking/data-layer";

// Chat topic buttons in the widget (docs/cwr-chat-guided-options-plan.md §4–§6). The menu loads
// when the chat first opens. A tap shows at once as the visitor's message; the answer follows
// after a short pause (never for an emergency). Each answered tap is saved to the chat log in
// the background, one at a time, so the first one can start the chat for the next.

/** A message the topic buttons add; the conversation gives it an id. */
export type TopicEntry = { role: "visitor" | "assistant"; text: string; citedSections: string[]; topicId?: string };

type MenuState = GuidedMenuResult | { status: "loading" };

type TopicsRequest = {
  sessionId: string | null;
  topicId: string | undefined;
  /** True while a typed question is on its way: buttons wait so the two never start separate chats. */
  isBlocked: boolean;
  onEntries: (entries: TopicEntry[]) => void;
  onSessionId: (sessionId: string) => void;
  onTopicId: (topicId: string) => void;
};

export type ChatTopics = {
  isShown: boolean;
  branchLabel: string;
  options: GuidedNode[];
  isReplying: boolean;
  canGoBack: boolean;
  pick: (nodeId: string) => void;
  back: () => void;
  reset: () => void;
  /** Resolves, once every tap so far has been saved (or given up on), with the chat's id. */
  whenSaved: () => Promise<string | null>;
};

const ROOT_LABEL = "Choose a topic";
// A typed question waits this long at most for a tap still being saved, then goes on its own.
const SAVE_WAIT_LIMIT_MS = 5000;

async function fetchMenu(): Promise<GuidedMenuResult> {
  try {
    return await fetchGuidedMenuAction();
  } catch (error) {
    const failure = getCallFailure(error);
    void reportVisitorClientProblem({ action: "site.chat_widget", stage: "network", severity: "info", code: failure.code === "other" ? "action_failed" : failure.code });
    return { status: "unavailable" };
  }
}

function getAnswer({ node, menu }: { node: GuidedNode; menu: MenuState }): { text: string; citedSections: string[] } | null {
  if (menu.status !== "ready") return null;
  if (node.isEmergency) return { text: EMERGENCY_TEXT, citedSections: menu.emergencySection ? [menu.emergencySection] : [] };
  const answer = menu.answers[node.id];
  return answer ? { text: answer.text, citedSections: [answer.section] } : null;
}

export function useChatTopics({ sessionId, topicId, isBlocked, onEntries, onSessionId, onTopicId }: TopicsRequest): ChatTopics {
  const [menu, setMenu] = useState<MenuState>({ status: "loading" });
  const [isReplying, setIsReplying] = useState(false);
  const sessionIdRef = useRef(sessionId);
  const savingRef = useRef<Promise<void>>(Promise.resolve());
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    let isCurrent = true;
    void fetchMenu().then((result) => {
      if (isCurrent) setMenu(result);
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const availableLeafIds = useMemo(() => new Set(menu.status === "ready" ? Object.keys(menu.answers) : []), [menu]);
  const visibleBranchId = getOptionsBranchId(topicId ?? GUIDED_ROOT_ID);
  const branchOptions = getVisibleChildren(visibleBranchId, availableLeafIds);
  // A branch whose answers were all removed since the visitor was there falls back to the top.
  const branchId = branchOptions.length > 0 ? visibleBranchId : GUIDED_ROOT_ID;
  const options = branchOptions.length > 0 ? branchOptions : getVisibleChildren(GUIDED_ROOT_ID, availableLeafIds);

  const saveStep = (nodeId: string) => {
    savingRef.current = savingRef.current.then(async () => {
      try {
        const result = await recordGuidedStepAction({ sessionId: sessionIdRef.current, nodeId });
        if (result.status !== "recorded") return;
        sessionIdRef.current = result.sessionId;
        onSessionId(result.sessionId);
      } catch (error) {
        const failure = getCallFailure(error);
        void reportVisitorClientProblem({ action: "site.chat_widget", stage: "network", severity: "info", code: failure.code === "other" ? "action_failed" : failure.code });
      }
    });
  };

  const replyLater = ({ pauseMs, reply }: { pauseMs: number; reply: () => void }) => {
    if (pauseMs === 0) return reply();
    setIsReplying(true);
    timersRef.current.push(
      window.setTimeout(() => {
        reply();
        setIsReplying(false);
      }, pauseMs),
    );
  };

  const pick = (nodeId: string) => {
    const node = getGuidedNode(nodeId);
    if (!node || isReplying || isBlocked) return;
    const answer = isGuidedLeaf(node) ? getAnswer({ node, menu }) : { text: node.prompt ?? "", citedSections: [] };
    if (!answer) return;
    onEntries([{ role: "visitor", text: node.label, citedSections: [] }]);
    // Saved at the tap, not after the pause, so a question typed during the pause waits for
    // it and both land in one chat.
    if (isGuidedLeaf(node)) saveStep(node.id);
    replyLater({
      pauseMs: getGuidedPauseMs({ text: answer.text, isEmergency: node.isEmergency === true }),
      reply: () => {
        onEntries([{ role: "assistant", text: answer.text, citedSections: answer.citedSections, ...(isGuidedLeaf(node) ? { topicId: node.id } : {}) }]);
        onTopicId(node.id);
        // Its own event, so the "chats" count (cwr_chat_question) stays typed questions only.
        if (isGuidedLeaf(node)) pushKeyEvent({ name: "cwr_chat_topic", eventId: crypto.randomUUID() });
      },
    });
  };

  return {
    isShown: menu.status === "ready" && hasGuidedMenu(availableLeafIds) && options.length > 0,
    branchLabel: branchId === GUIDED_ROOT_ID ? ROOT_LABEL : (getGuidedNode(branchId)?.label ?? ROOT_LABEL),
    options,
    isReplying,
    canGoBack: branchId !== GUIDED_ROOT_ID,
    pick,
    back: () => onTopicId(getGuidedParentId(branchId) ?? GUIDED_ROOT_ID),
    reset: () => onTopicId(GUIDED_ROOT_ID),
    whenSaved: async () => {
      await Promise.race([savingRef.current, new Promise((resolve) => window.setTimeout(resolve, SAVE_WAIT_LIMIT_MS))]);
      return sessionIdRef.current;
    },
  };
}
