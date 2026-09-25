// Result of an admin server action, shared by actions and the form UI.
// Errors name the field to fix (Admin §1); values are sent back so nothing typed is lost.

export type FieldErrors = Record<string, string>;

export type ActionState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors: FieldErrors;
  values: Record<string, string>;
  responseId: string;
};

export const IDLE_ACTION_STATE: ActionState = { status: "idle", message: "", fieldErrors: {}, values: {}, responseId: "idle" };

export function getSuccessState(message: string, values: Record<string, string> = {}): ActionState {
  return { status: "success", message, fieldErrors: {}, values, responseId: crypto.randomUUID() };
}

export function getErrorState({ message, fieldErrors = {}, values = {} }: { message: string; fieldErrors?: FieldErrors; values?: Record<string, string> }): ActionState {
  return { status: "error", message, fieldErrors, values, responseId: crypto.randomUUID() };
}

export function getFormValues(formData: FormData): Record<string, string> {
  return Object.fromEntries([...formData.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
