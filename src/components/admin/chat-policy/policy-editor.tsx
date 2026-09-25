"use client";

import { CircleAlert, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import { PolicyTestChat } from "@/components/admin/chat-policy/policy-test-chat";
import { SaveBar } from "@/components/admin/save-bar";
import { useAdminForm } from "@/components/admin/use-admin-form";
import { getButtonClassName } from "@/components/ui/button-link";
import { savePolicyDraftAction } from "@/lib/admin/chat-policy/actions";
import { MAX_POLICY_LENGTH } from "@/lib/admin/chat-policy/policy-schema";
import { ICON_SIZE } from "@/lib/design/icon-sizes";

// Admin §6 "upload or edit the policy file with a live test chat". Uploading reads a text
// file into the editor in the browser; nothing is stored until the owner saves.

const ACCEPTED_FILES = ".txt,.md,text/plain,text/markdown";
const MAX_FILE_BYTES = 400_000;

type PolicyEditorProps = { draftId: string | null; initialBody: string };

export function PolicyEditor({ draftId, initialBody }: PolicyEditorProps) {
  const [body, setBody] = useState(initialBody);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { state, isPending, isDirty, formRef, handleSubmit, handleInput } = useAdminForm(savePolicyDraftAction);
  const error = state.fieldErrors.body ?? uploadError;

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
        <input type="hidden" name="draftId" value={draftId ?? ""} />
        <div>
          <label htmlFor="policy-body" className="mb-1 block text-base font-bold">Policy text</label>
          <p id="policy-body-helper" className="type-small mb-2 text-muted">Start each section with a heading line such as “# Office hours”. The assistant cites these headings.</p>
          <textarea
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
