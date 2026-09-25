"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";

import {
  INITIAL_FORM_STATE,
  getFieldError,
  getFieldErrors,
  type FieldErrors,
  type FieldValues,
  type RequestFormSchema,
  type RequestFormState,
} from "@/lib/forms/form-state";

// Form behavior for Style §11.11: check each field when the visitor leaves it, block
// a submit with errors and move focus to the summary, keep typed text after a reply.

export type RequestFormAction = (state: RequestFormState, formData: FormData) => Promise<RequestFormState>;

type FocusTarget = "summary" | "notice";

function getErrorsWithField(errors: FieldErrors, name: string, error: string | null): FieldErrors {
  const otherErrors = Object.fromEntries(Object.entries(errors).filter(([fieldName]) => fieldName !== name));
  return error ? { ...otherErrors, [name]: error } : otherErrors;
}

function getFixedFieldsAfterBlur({ fixedFields, name, hadError, hasError }: {
  fixedFields: ReadonlySet<string>;
  name: string;
  hadError: boolean;
  hasError: boolean;
}): ReadonlySet<string> {
  const nextFixedFields = new Set(fixedFields);
  if (hasError) nextFixedFields.delete(name);
  if (hadError && !hasError) nextFixedFields.add(name);
  return nextFixedFields;
}

export function useRequestForm(action: RequestFormAction, schema: RequestFormSchema) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_FORM_STATE);
  const [handledResponseId, setHandledResponseId] = useState(state.responseId);
  const [values, setValues] = useState<FieldValues>(state.values);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(state.fieldErrors);
  const [fixedFields, setFixedFields] = useState<ReadonlySet<string>>(new Set());
  const [isSummaryVisible, setIsSummaryVisible] = useState(state.status === "invalid");
  const [isNoticeVisible, setIsNoticeVisible] = useState(state.status === "unavailable");
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget; id: string } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  // A new server reply replaces local state (React "adjust state while rendering" pattern).
  if (state.responseId !== handledResponseId) {
    setHandledResponseId(state.responseId);
    setValues(state.values);
    setFieldErrors(state.fieldErrors);
    setIsSummaryVisible(state.status === "invalid");
    setIsNoticeVisible(state.status === "unavailable");
    setFocusRequest({ target: state.status === "invalid" ? "summary" : "notice", id: state.responseId });
  }

  useEffect(() => {
    if (!focusRequest) return;
    const target = focusRequest.target === "summary" ? summaryRef.current : noticeRef.current;
    target?.focus();
  }, [focusRequest]);

  const handleValueChange = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));

  const handleFieldBlur = (name: string) => {
    const error = getFieldError(schema, name, values[name] ?? "");
    setFixedFields(getFixedFieldsAfterBlur({ fixedFields, name, hadError: Boolean(fieldErrors[name]), hasError: Boolean(error) }));
    setFieldErrors(getErrorsWithField(fieldErrors, name, error));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (isPending) {
      event.preventDefault();
      return;
    }
    const errors = getFieldErrors(schema, values);
    if (Object.keys(errors).length === 0) return;
    event.preventDefault();
    setFieldErrors(errors);
    setIsSummaryVisible(true);
    setIsNoticeVisible(false);
    setFocusRequest({ target: "summary", id: crypto.randomUUID() });
  };

  const handleNoticeDismiss = () => setIsNoticeVisible(false);

  return {
    formAction,
    isPending,
    values,
    fieldErrors,
    fixedFields,
    isSummaryVisible: isSummaryVisible && Object.keys(fieldErrors).length > 0,
    isNoticeVisible,
    summaryRef,
    noticeRef,
    handleValueChange,
    handleFieldBlur,
    handleSubmit,
    handleNoticeDismiss,
  };
}
