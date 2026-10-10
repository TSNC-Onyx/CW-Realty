"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabaseErrorMessage } from "@/lib/admin/database-errors";
import { getQuickError, getQuickSuccess, type QuickResult } from "@/lib/admin/quick-result";
import { OWNER_ROLES } from "@/lib/admin/require-admin";
import { runQuickAction } from "@/lib/admin/run-quick-action";
import { noteProblemCause } from "@/lib/observability/action-context";
import { createServiceClient, isServiceAccessConfigured } from "@/lib/supabase/service-client";

// Owners' actions on the Problems page (docs/error-logging-a-grade-plan.md, Phase D):
// mark a group resolved with a note, and fetch short-lived private links to a release's
// source maps so the owner's browser can read a stack trace back to our files (Phase C).

const PROBLEMS_PATH = "/admin/problems";
const SOURCE_MAP_BUCKET = "source-maps";
// Long enough to download the maps once; short enough that a copied link soon stops working.
const MAP_LINK_SECONDS = 300;

const resolveSchema = z.object({ groupId: z.uuid(), note: z.string().max(1000) });
const traceSchema = z.object({ reference: z.string().regex(/^CWR-[0-9A-Z]{3}-[0-9A-Z]{3}$/) });

/** urls: private links to that release's browser and server maps, valid for a few minutes. */
export type TraceMapsResult = QuickResult & { urls?: { browser: string; server: string } };

type TraceSource = { release: string | null; detail: string | null };

const NO_RELEASE_MESSAGE = "This problem was recorded before code locations were kept, so it can't be read back.";
const NO_MAPS_MESSAGE = "The code maps for that version of the site aren't stored, so this trace can't be read back. Older versions are cleared after 15 releases.";

export async function resolveProblemAction(input: { groupId: string; note: string }): Promise<QuickResult> {
  return runQuickAction({ action: "problems.resolve", roles: OWNER_ROLES }, async ({ supabase }) => {
    const { groupId, note } = resolveSchema.parse(input);
    const { error } = await supabase.rpc("resolve_problem_group", { p_id: groupId, p_note: note });
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    revalidatePath(PROBLEMS_PATH, "layout");
    return getQuickSuccess("Marked resolved. It opens again by itself if it happens again.");
  });
}

async function fetchMapLinks(release: string): Promise<{ browser: string; server: string } | null> {
  const { data, error } = await createServiceClient().storage.from(SOURCE_MAP_BUCKET).createSignedUrls([`${release}/browser.json.gz`, `${release}/server.json.gz`], MAP_LINK_SECONDS);
  const [browser, server] = data ?? [];
  if (error || !browser?.signedUrl || !server?.signedUrl) return null;
  return { browser: browser.signedUrl, server: server.signedUrl };
}

export async function fetchProblemTraceMapsAction(input: { reference: string }): Promise<TraceMapsResult> {
  return runQuickAction<TraceMapsResult>({ action: "problems.show_trace", roles: OWNER_ROLES }, async ({ supabase, tenantId }) => {
    const { reference } = traceSchema.parse(input);
    const { data, error } = await supabase.from("problem_events").select("release, detail").eq("tenant_id", tenantId).eq("reference", reference).maybeSingle<TraceSource>();
    if (error) return getQuickError(getDatabaseErrorMessage(error));
    if (!data?.release || !data.detail) {
      noteProblemCause({ stage: "rule", severity: "info", code: "no_release", detail: null, isExpected: true });
      return getQuickError(NO_RELEASE_MESSAGE);
    }
    if (!isServiceAccessConfigured()) return getQuickError(NO_MAPS_MESSAGE);
    const urls = await fetchMapLinks(data.release);
    if (!urls) {
      noteProblemCause({ stage: "rule", severity: "info", code: "maps_not_stored", detail: null, isExpected: true });
      return getQuickError(NO_MAPS_MESSAGE);
    }
    return { ...getQuickSuccess("Code maps ready."), urls };
  });
}
