"use client";

import { useEffect } from "react";

// Links between the Chatbot policy page's sections (docs/cwr-chat-quick-answers-and-tests-plan.md
// §C, §E): a failed test's "Edit this section" opens that heading in the policy editor, "Try it
// in the test chat" puts the question in the live test chat, and a coverage hint's "Add a test"
// opens the add form on that section. Browser events keep the sections independent.

const EDIT_SECTION_EVENT = "cwr:policy-edit-section";
const TRY_IN_CHAT_EVENT = "cwr:policy-try-in-chat";
const ADD_TEST_EVENT = "cwr:policy-add-test";

type PageEventName = typeof EDIT_SECTION_EVENT | typeof TRY_IN_CHAT_EVENT | typeof ADD_TEST_EVENT;

function sendPageEvent({ name, text }: { name: PageEventName; text: string }): void {
  window.dispatchEvent(new CustomEvent<string>(name, { detail: text }));
}

function usePageEvent({ name, onEvent }: { name: PageEventName; onEvent: (text: string) => void }): void {
  useEffect(() => {
    const handleEvent = (event: Event) => onEvent((event as CustomEvent<string>).detail);
    window.addEventListener(name, handleEvent);
    return () => window.removeEventListener(name, handleEvent);
  }, [name, onEvent]);
}

export function editPolicySection(sectionTitle: string): void {
  sendPageEvent({ name: EDIT_SECTION_EVENT, text: sectionTitle });
}

export function tryInTestChat(question: string): void {
  sendPageEvent({ name: TRY_IN_CHAT_EVENT, text: question });
}

export function addTestForSection(sectionTitle: string): void {
  sendPageEvent({ name: ADD_TEST_EVENT, text: sectionTitle });
}

export function useEditSectionRequest(onEvent: (sectionTitle: string) => void): void {
  usePageEvent({ name: EDIT_SECTION_EVENT, onEvent });
}

export function useTryInChatRequest(onEvent: (question: string) => void): void {
  usePageEvent({ name: TRY_IN_CHAT_EVENT, onEvent });
}

export function useAddTestRequest(onEvent: (sectionTitle: string) => void): void {
  usePageEvent({ name: ADD_TEST_EVENT, onEvent });
}
