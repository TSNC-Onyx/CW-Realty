"use client";

import { useEffect } from "react";

// Admin §1: warn before leaving with unsaved changes — on tab close or reload, and when
// clicking any link inside the portal.

const LEAVE_MESSAGE = "You have unsaved changes. Leave this page without saving?";

function isInternalNavigation(event: MouseEvent): boolean {
  const link = (event.target as Element | null)?.closest("a[href]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return false;
  const href = link.getAttribute("href") ?? "";
  return !href.startsWith("#") && link.getAttribute("target") !== "_blank";
}

export function useUnsavedChanges(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const handleLinkClick = (event: MouseEvent) => {
      if (isInternalNavigation(event) && !window.confirm(LEAVE_MESSAGE)) event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [isDirty]);
}
