export const MAIN_CONTENT_ID = "main";

// Style §4: the first focusable element on every page.
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only bg-ink font-bold text-on-dark focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:flex focus:min-h-11 focus:items-center focus:px-4"
    >
      Skip to main content
    </a>
  );
}
