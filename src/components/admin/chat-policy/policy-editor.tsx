"use client";

import { CircleAlert, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { usePolicyDraftState } from "@/components/admin/chat-policy/policy-draft-state";
import { useEditSectionRequest } from "@/components/admin/chat-policy/policy-page-events";
import { PolicyTestChat } from "@/components/admin/chat-policy/policy-test-chat";
import { SaveBar } from "@/components/admin/save-bar";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { savePolicyDraftAction } from "@/lib/admin/chat-policy/actions";
import { MAX_POLICY_LENGTH } from "@/lib/admin/chat-policy/policy-schema";
import { getHeadingLines, isSameTitle } from "@/lib/chat/policy-sections";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Admin §6 "upload or edit the policy file with a live test chat". Uploading reads a text
// file into the editor in the browser; nothing is stored until the owner saves.
// Bug 12 (docs/cwr-chatbot-round-3-plan.md): when the saved draft changes (a restore, a publish,
// another window) and nothing here is unsaved, the editor shows the new saved text; a save only
// goes over the text this editor last saw (expectedUpdatedAt).

const ACCEPTED_FILES = ".txt,.md,text/plain,text/markdown";
const MAX_FILE_BYTES = 400_000;

type TextRange = { start: number; end: number };

/** Where a section's heading line sits in the text (outside code fences), so "Edit this section" can select it. */
function getHeadingRange({ body, sectionTitle }: { body: string; sectionTitle: string }): TextRange | null {
  const heading = getHeadingLines(body).find((line) => isSameTitle({ first: line.title, second: sectionTitle }));
  if (!heading) return null;
  const lines = body.split("\n");
  const start = lines.slice(0, heading.index).reduce((offset, line) => offset + line.length + 1, 0);
  return { start, end: start + (lines[heading.index]?.length ?? 0) };
}

/** updatedAt: when the open draft was last saved, or null when there is no draft. */
type PolicyEditorProps = { draftId: string | null; initialBody: string; updatedAt: string | null };

export function PolicyEditor({ draftId, initialBody, updatedAt }: PolicyEditorProps) {
  const [body, setBody] = useState(initialBody);
  const [seenUpdatedAt, setSeenUpdatedAt] = useState(updatedAt);
  // The saved draft this editor's text is based on: what a save may go over (the save guard).
  const [base, setBase] = useState({ draftId, updatedAt });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(savePolicyDraftAction, { problemAction: "chat_policy.save_draft" });
  const { setHasUnsavedChanges } = usePolicyDraftState();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const error = state.fieldErrors.body ?? uploadError;

  const handleEditSection = useCallback(
    (sectionTitle: string) => {
      const textarea = textareaRef.current;
      const range = getHeadingRange({ body, sectionTitle });
      if (!textarea || !range) return;
      textarea.focus();
      textarea.setSelectionRange(range.start, range.end);
      textarea.scrollIntoView({ block: "center" });
    },
    [body],
  );
  useEditSectionRequest(handleEditSection);

  // Adjusting state when a prop changes, during render (no remount, so the test chat and focus stay).
  // The base moves only when the editor takes the new saved text (or already shows it, after its
  // own save); while unsaved text stays, it keeps the old base, so the guard catches a newer save.
  if (updatedAt !== seenUpdatedAt) {
    setSeenUpdatedAt(updatedAt);
    if (!isDirty || body === initialBody) {
      setBody(initialBody);
      setBase({ draftId, updatedAt });
    }
  }

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
  }, [isDirty, setHasUnsavedChanges]);

  const handleBodyChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setBody(event.target.value);
    handleInput();
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("That file is too large. Use a text file under 400 KB.");
      return;
    }
    setUploadError(null);
    setBody(await file.text());
    handleInput();
  };

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-4">
        <input type="hidden" name="draftId" value={base.draftId ?? ""} />
        <input type="hidden" name="expectedUpdatedAt" value={base.updatedAt ?? ""} />
        <div>
          <label htmlFor="policy-body" className="mb-1 block text-base font-bold">Policy text</label>
          <p id="policy-body-helper" className="type-small mb-2 text-muted">Start each section with a heading line such as “# Office hours”. The assistant cites these headings. Sections whose heading ends in (private) are never shown to the assistant.</p>
          <textarea
            ref={textareaRef}
            id="policy-body"
            name="body"
            value={body}
            onChange={handleBodyChange}
            rows={18}
            maxLength={MAX_POLICY_LENGTH}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "policy-body-helper policy-body-error" : "policy-body-helper"}
            className="field-input font-body"
          />
          {error && (
            <p id="policy-body-error" className="mt-1 flex items-center gap-2 text-sm font-semibold text-error">
              <CircleAlert aria-hidden size={ICON_SIZE.inline} />
              {error}
            </p>
          )}
        </div>
        <div>
          <label className={`${getButtonClassName({ size: "s", variant: "secondary" })} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-info`}>
            <Upload aria-hidden size={ICON_SIZE.button} />
            Upload a text file
            <input type="file" accept={ACCEPTED_FILES} onChange={handleUpload} className="sr-only" />
          </label>
        </div>
        <SaveBar isPending={isPending} isDirty={isDirty} label="Save draft" />
      </form>
      <PolicyTestChat policyBody={body} />
    </>
  );
}
