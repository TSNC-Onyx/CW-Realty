// Turns database errors into plain messages for editors (Admin §1: errors say what to fix).
// Messages raised by our own database rules are already written for people and pass through.

type DatabaseError = { code?: string; message: string };

const MESSAGES_BY_CODE: Record<string, string> = {
  "23505": "That is already in use. Choose something different.",
  "42501": "Your role can't make this change.",
  PGRST116: "That item no longer exists. It may have been deleted.",
};

const OWN_RULE_CODES = new Set(["23514", "22023", "P0001", "P0002", "42501"]);
// Wording that only Postgres itself produces; our own rule messages never contain it.
const RAW_DATABASE_WORDING = /violates|permission denied|relation "|column "|constraint "|syntax/i;
const GENERIC_MESSAGE = "Something went wrong while saving. Try again, and contact the site owner if it keeps happening.";

export function getDatabaseErrorMessage(error: DatabaseError): string {
  const isOwnRuleMessage = error.code !== undefined && OWN_RULE_CODES.has(error.code) && !RAW_DATABASE_WORDING.test(error.message);
  if (isOwnRuleMessage) return error.message;
  return (error.code && MESSAGES_BY_CODE[error.code]) || GENERIC_MESSAGE;
}

export function isUniqueViolation(error: DatabaseError): boolean {
  return error.code === "23505";
}
