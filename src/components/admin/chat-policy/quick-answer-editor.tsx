"use client";

import { ArrowRight, CircleAlert, CircleCheck, Save } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { usePolicyDraftState } from "@/components/admin/chat-policy/policy-draft-state";
import { getButtonClassName } from "@/components/ui/button-link";
import { saveQuickAnswersAction } from "@/lib/admin/chat-policy/actions";
import type { QuickResult } from "@/lib/admin/quick-result";
import type { GuidedLink } from "@/lib/chat/guided-tree";
import { getSingleLineAnswer } from "@/lib/chat/quick-answer-sections";
import { ICON_SIZE } from "@/lib/design/icon-sizes";
import { callQuickAction } from "@/lib/observability/call-server-action";

// Admin → Chatbot policy → "Chat topic buttons" (docs/cwr-chat-quick-answers-and-tests-plan.md §B):
// one box per button with a word count and a chat-style preview, so the owner edits answers
// without touching headings. Saving writes them into the draft (then test and publish as usual);
// it waits while the policy editor holds unsaved text, so neither overwrites the other.

const MAX_ANSWER_LENGTH = 600;
const AIM_WORDS = 25;
const POLICY_TEXT_FIRST_REASON = "Save your policy text changes first, so nothing is overwritten.";

export type QuickAnswerRow = { nodeId: string; label: string; link: GuidedLink | null; text: string };

type QuickAnswerEditorProps = { rows: QuickAnswerRow[]; draftId: string | null; updatedAt: string | null };

type SaveBase = { draftId: string | null; updatedAt: string | null };

function getWordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function getTextsById(rows: QuickAnswerRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.nodeId, row.text]));
}

function AnswerStatus({ text }: { text: string }) {
  const words = getWordCount(text);
  if (words === 0) return <p className="type-small flex items-center gap-1 text-warning"><CircleAlert aria-hidden size={ICON_SIZE.inline} />Missing: this button stays hidden on the website</p>;
  const lengthNote = words > AIM_WORDS ? ` · over ${AIM_WORDS} words; shorter reads better in the chat` : "";
  return <p className="type-small flex items-center gap-1 text-muted"><CircleCheck aria-hidden size={ICON_SIZE.inline} className="text-success" />{`Ready · ${words} words${lengthNote}`}</p>;
}

function AnswerPreview({ row, text }: { row: QuickAnswerRow; text: string }) {
  if (text.trim() === "") return null;
  return (
    <div aria-label={`Preview: ${row.label}`} role="group" className="type-small mt-2 max-w-sm bg-surface-soft px-4 py-3">
      <p>{text.trim()}</p>
      {row.link && <p className="mt-2 inline-flex items-center gap-1 font-semibold underline">{row.link.label}<ArrowRight aria-hidden size={ICON_SIZE.inline} /></p>}
      <p className="mt-2 text-muted">{`Source: Policy · Quick answer: ${row.label}`}</p>
    </div>
  );
}

function AnswerField({ row, text, onChange }: { row: QuickAnswerRow; text: string; onChange: (text: string) => void }) {
  const fieldId = `quick-answer-${row.nodeId}`;
  return (
    <li className="border-t border-line py-4">
      <label htmlFor={fieldId} className="block font-bold">{row.label}</label>
      <p className="type-small mb-2 text-muted">{row.link ? `Links to “${row.link.label}” (${row.link.href})` : "No page link"}</p>
      <textarea id={fieldId} value={text} maxLength={MAX_ANSWER_LENGTH} rows={2} onChange={(event) => onChange(event.target.value)} aria-describedby={`${fieldId}-status`} className="field-input min-h-20" />
      <div id={`${fieldId}-status`}><AnswerStatus text={text} /></div>
      <AnswerPreview row={row} text={text} />
    </li>
  );
}

type SaveControlsProps = { isDirty: boolean; isPending: boolean; hasUnsavedPolicyText: boolean; message: QuickResult | null; onSave: () => void };

function SaveControls({ isDirty, isPending, hasUnsavedPolicyText, message, onSave }: SaveControlsProps) {
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="button" onClick={onSave} aria-busy={isPending} disabled={!isDirty || hasUnsavedPolicyText || isPending} className={getButtonClassName({ size: "m", variant: "main" })}>
          <Save aria-hidden size={ICON_SIZE.button} />
          {isPending ? "Saving…" : "Save topic answers"}
        </button>
        {hasUnsavedPolicyText && <p className="type-small text-muted">{POLICY_TEXT_FIRST_REASON}</p>}
      </div>
      <p role="status" className={`type-small mt-2 ${message?.status === "error" ? "text-error" : "text-muted"}`}>{message?.message ?? ""}</p>
    </>
  );
}

export function QuickAnswerEditor({ rows, draftId, updatedAt }: QuickAnswerEditorProps) {
  const [texts, setTexts] = useState(() => getTextsById(rows));
  const [seenUpdatedAt, setSeenUpdatedAt] = useState(updatedAt);
  const [base, setBase] = useState<SaveBase>({ draftId, updatedAt });
  const [message, setMessage] = useState<QuickResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const { hasUnsavedPolicyText, setHasUnsavedTopicAnswers } = usePolicyDraftState();
  const savedTexts = getTextsById(rows);
  // Saved answers are one line, so spacing and line breaks typed here don't count as changes.
  const isDirty = rows.some((row) => getSingleLineAnswer(texts[row.nodeId] ?? "") !== getSingleLineAnswer(savedTexts[row.nodeId] ?? ""));

  // A newer saved draft (the editor, a restore, another window) replaces the boxes when nothing here is unsaved.
  if (updatedAt !== seenUpdatedAt) {
    setSeenUpdatedAt(updatedAt);
    if (!isDirty) {
      setTexts(savedTexts);
      setBase({ draftId, updatedAt });
    }
  }

  useEffect(() => {
    setHasUnsavedTopicAnswers(isDirty);
  }, [isDirty, setHasUnsavedTopicAnswers]);

  const handleSave = () =>
    startTransition(async () => {
      const answers = rows.map((row) => ({ nodeId: row.nodeId, text: texts[row.nodeId] ?? "" }));
      const result = await callQuickAction("chat_policy.save_quick_answers", () => saveQuickAnswersAction({ draftId: base.draftId, expectedUpdatedAt: base.updatedAt, answers }));
      setMessage(result);
      if ("draftId" in result && result.draftId && result.updatedAt) setBase({ draftId: result.draftId, updatedAt: result.updatedAt });
    });

  return (
    <div className="max-w-prose">
      <p className="mb-2">Each button on the website chat shows its answer below, word for word. Keep answers short (about {AIM_WORDS} words); the link takes visitors to the full page. Saving updates your draft; run the tests, then publish.</p>
      <ul>
        {rows.map((row) => (
          <AnswerField key={row.nodeId} row={row} text={texts[row.nodeId] ?? ""} onChange={(text) => setTexts((current) => ({ ...current, [row.nodeId]: text }))} />
        ))}
      </ul>
      <SaveControls isDirty={isDirty} isPending={isPending} hasUnsavedPolicyText={hasUnsavedPolicyText} message={message} onSave={handleSave} />
    </div>
  );
}
