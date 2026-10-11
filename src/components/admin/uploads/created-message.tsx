import { Message } from "@/components/ui/message";

// Shown on an Edit page right after its Add page saved the record and uploaded its files
// (docs/admin-upload-layout-plan.md): what to do next, and what to add again if a file failed.

type CreatedMessageProps = {
  title: string;
  nextStep: string;
  missedCount: number;
  /** What a failed file is called here, singular: "photo" or "file". */
  fileNoun: string;
};

function getMissedTitle({ missedCount, fileNoun }: Pick<CreatedMessageProps, "missedCount" | "fileNoun">): string {
  return missedCount === 1 ? `1 ${fileNoun} didn't upload` : `${missedCount} ${fileNoun}s didn't upload`;
}

export function CreatedMessage({ title, nextStep, missedCount, fileNoun }: CreatedMessageProps) {
  return (
    <div className="mb-8 grid max-w-prose gap-4">
      <Message tone="success" title={title}>
        <p>{nextStep}</p>
      </Message>
      {missedCount > 0 && (
        <Message tone="warning" title={getMissedTitle({ missedCount, fileNoun })}>
          <p>Everything else was saved. Add {missedCount === 1 ? "it" : "them"} again below.</p>
        </Message>
      )}
    </div>
  );
}
