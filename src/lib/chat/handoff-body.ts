import type { ChatTurn } from "@/lib/chat/answer-question";
import { getRedactedText } from "@/lib/chat/restricted-data";

// The inbox message for a chat hand-off: the visitor's question, then the chat so far
// (from the server's own log), newest turns kept when it is long.

const MAX_TURN_LENGTH = 1000;
const MAX_TRANSCRIPT_LENGTH = 12_000;
const SPEAKER_LABELS: Record<ChatTurn["role"], string> = { visitor: "Visitor", assistant: "Assistant (AI)" };

function getTurnLine(turn: ChatTurn): string {
  const body = turn.body.length > MAX_TURN_LENGTH ? `${turn.body.slice(0, MAX_TURN_LENGTH)}…` : turn.body;
  return `${SPEAKER_LABELS[turn.role]}: ${body}`;
}

function getRecentLines(turns: ChatTurn[]): string[] {
  const lines = turns.map(getTurnLine);
  while (lines.join("\n").length > MAX_TRANSCRIPT_LENGTH) lines.shift();
  return lines;
}

export function getHandoffBody({ question, turns }: { question: string; turns: ChatTurn[] }): string {
  const redactedQuestion = getRedactedText(question.trim());
  if (turns.length === 0) return redactedQuestion;
  return `${redactedQuestion}\n\nChat with the AI assistant so far:\n${getRecentLines(turns).join("\n")}`;
}
