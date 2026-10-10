import "server-only";

import { getLoaded, getLoadFailure, type LoadResult } from "@/lib/admin/load-result";
import type { AdminContext } from "@/lib/admin/require-admin";
import type { ProblemSeverity } from "@/lib/observability/problem-types";

// The owners' Problems page (docs/cwr-error-tracking-plan.md "Problems page", built in
// docs/error-logging-a-grade-plan.md Phase D). Read through the signed-in session: row-level
// security lets owners read their own business's problem log and nobody else.

export const PROBLEM_GROUPS_PAGE_SIZE = 25;
export const PROBLEM_OCCURRENCES_PAGE_SIZE = 20;

const PERIOD_HOURS = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 } as const;
const HOUR_MS = 60 * 60 * 1000;
const SEVERITIES: readonly ProblemSeverity[] = ["info", "warning", "error", "critical"];
const STATUSES = ["open", "resolved", "all"] as const;
const PERIODS = ["24h", "7d", "30d", "all"] as const;
const REFERENCE_PATTERN = /^CWR-[0-9A-Z]{3}-[0-9A-Z]{3}$/;
const MAX_SEARCH_LENGTH = 128;
// Enough recent occurrences to find each listed group's latest message in one read.
const LATEST_MESSAGE_SCAN = 200;

export type ProblemStatusFilter = (typeof STATUSES)[number];
export type ProblemPeriod = (typeof PERIODS)[number];

/** section: a catalog area, or "all". */
export type ProblemFilters = { section: string; severity: ProblemSeverity | "all"; status: ProblemStatusFilter; period: ProblemPeriod };

export type ProblemGroup = {
  id: string;
  fingerprint: string;
  area: string;
  action: string;
  stage: string;
  code: string | null;
  max_severity: ProblemSeverity;
  status: "open" | "resolved";
  first_seen_at: string;
  last_seen_at: string;
  total_count: number;
  resolution_note: string | null;
};

export type CatalogEntry = { action: string; label: string; section_label: string };

/** latestMessage: what the person saw most recently, when anything was shown. */
export type ProblemGroupSummary = ProblemGroup & { label: string; sectionLabel: string; latestMessage: string | null };

export type ProblemGroupPage = { groups: ProblemGroupSummary[]; totalCount: number; sections: { area: string; label: string }[] };

export type ProblemOccurrence = {
  id: string;
  reference: string;
  occurred_at: string;
  origin: string;
  severity: ProblemSeverity;
  code: string | null;
  shown_message: string | null;
  detail: string | null;
  actor_id: string | null;
  actor_role: string | null;
  page_path: string | null;
  request_id: string | null;
  release: string | null;
};

export type ProblemOccurrencePage = { occurrences: ProblemOccurrence[]; totalCount: number };

/** found: the group holding that reference or request id. not_in_log: a reference that only reached the server log. */
export type ProblemSearchResult = { kind: "found"; groupId: string } | { kind: "not_in_log" } | { kind: "no_match" };

const GROUP_COLUMNS = "id, fingerprint, area, action, stage, code, max_severity, status, first_seen_at, last_seen_at, total_count, resolution_note";
const OCCURRENCE_COLUMNS = "id, reference, occurred_at, origin, severity, code, shown_message, detail, actor_id, actor_role, page_path, request_id, release";

function getChoice<Choice extends string>(value: string | undefined, choices: readonly Choice[], fallback: Choice): Choice {
  return choices.find((choice) => choice === value) ?? fallback;
}

export function getProblemFilters(params: { section?: string; severity?: string; status?: string; period?: string }): ProblemFilters {
  return {
    section: params.section && /^[a-z_]+$/.test(params.section) ? params.section : "all",
    severity: getChoice<ProblemSeverity | "all">(params.severity, [...SEVERITIES, "all"], "all"),
    status: getChoice(params.status, STATUSES, "open"),
    period: getChoice(params.period, PERIODS, "7d"),
  };
}

/** The list's address with these filters, for links and paging. Defaults are left out. */
export function getProblemListHref(filters: ProblemFilters): string {
  const query = new URLSearchParams();
  if (filters.section !== "all") query.set("section", filters.section);
  if (filters.severity !== "all") query.set("severity", filters.severity);
  if (filters.status !== "open") query.set("status", filters.status);
  if (filters.period !== "7d") query.set("period", filters.period);
  const text = query.toString();
  return text ? `/admin/problems?${text}` : "/admin/problems";
}

function getSince({ period, now }: { period: ProblemPeriod; now: Date }): string | null {
  if (period === "all") return null;
  return new Date(now.getTime() - PERIOD_HOURS[period] * HOUR_MS).toISOString();
}

async function fetchCatalog({ supabase }: AdminContext): Promise<LoadResult<Map<string, CatalogEntry>>> {
  const { data, error } = await supabase.from("problem_catalog").select("action, label, section_label").returns<CatalogEntry[]>();
  if (error) return getLoadFailure("problem catalog", error);
  return getLoaded(new Map((data ?? []).map((entry) => [entry.action, entry])));
}

async function fetchLatestMessages({ supabase, tenantId }: AdminContext, fingerprints: string[]): Promise<Map<string, string>> {
  if (fingerprints.length === 0) return new Map();
  const { data, error } = await supabase
    .from("problem_events")
    .select("fingerprint, shown_message")
    .eq("tenant_id", tenantId)
    .in("fingerprint", fingerprints)
    .not("shown_message", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(LATEST_MESSAGE_SCAN)
    .returns<{ fingerprint: string; shown_message: string }[]>();
  // The latest message is extra: without it the list still shows each problem.
  if (error) return new Map();
  const latest = new Map<string, string>();
  for (const row of data ?? []) if (!latest.has(row.fingerprint)) latest.set(row.fingerprint, row.shown_message);
  return latest;
}

function getSections(catalog: Map<string, CatalogEntry>): { area: string; label: string }[] {
  const byArea = new Map<string, string>();
  for (const entry of catalog.values()) byArea.set(entry.action.slice(0, entry.action.indexOf(".")), entry.section_label);
  return [...byArea].map(([area, label]) => ({ area, label })).sort((first, second) => first.label.localeCompare(second.label));
}

function getSummary({ group, catalog, latestMessages }: { group: ProblemGroup; catalog: Map<string, CatalogEntry>; latestMessages: Map<string, string> }): ProblemGroupSummary {
  const entry = catalog.get(group.action);
  return { ...group, label: entry?.label ?? group.action, sectionLabel: entry?.section_label ?? group.area, latestMessage: latestMessages.get(group.fingerprint) ?? null };
}

export async function fetchProblemGroupPage(admin: AdminContext, { filters, page, now }: { filters: ProblemFilters; page: number; now: Date }): Promise<LoadResult<ProblemGroupPage>> {
  const catalog = await fetchCatalog(admin);
  if (!catalog.isLoaded) return catalog;
  const from = (page - 1) * PROBLEM_GROUPS_PAGE_SIZE;
  let query = admin.supabase.from("problem_groups").select(GROUP_COLUMNS, { count: "exact" }).eq("tenant_id", admin.tenantId);
  if (filters.section !== "all") query = query.eq("area", filters.section);
  if (filters.severity !== "all") query = query.eq("max_severity", filters.severity);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  const since = getSince({ period: filters.period, now });
  if (since) query = query.gte("last_seen_at", since);
  const { data, count, error } = await query.order("last_seen_at", { ascending: false }).range(from, from + PROBLEM_GROUPS_PAGE_SIZE - 1).returns<ProblemGroup[]>();
  if (error) return getLoadFailure("problem list", error);
  const groups = data ?? [];
  const latestMessages = await fetchLatestMessages(admin, groups.map((group) => group.fingerprint));
  return getLoaded({ groups: groups.map((group) => getSummary({ group, catalog: catalog.data, latestMessages })), totalCount: count ?? 0, sections: getSections(catalog.data) });
}

/** null data: no such group for this business. */
export async function fetchProblemGroup(admin: AdminContext, groupId: string): Promise<LoadResult<ProblemGroupSummary | null>> {
  const catalog = await fetchCatalog(admin);
  if (!catalog.isLoaded) return catalog;
  const { data, error } = await admin.supabase.from("problem_groups").select(GROUP_COLUMNS).eq("tenant_id", admin.tenantId).eq("id", groupId).maybeSingle<ProblemGroup>();
  if (error) return getLoadFailure("problem", error);
  return getLoaded(data ? getSummary({ group: data, catalog: catalog.data, latestMessages: new Map() }) : null);
}

export async function fetchProblemOccurrences({ supabase, tenantId }: AdminContext, { fingerprint, page }: { fingerprint: string; page: number }): Promise<LoadResult<ProblemOccurrencePage>> {
  const from = (page - 1) * PROBLEM_OCCURRENCES_PAGE_SIZE;
  const { data, count, error } = await supabase
    .from("problem_events")
    .select(OCCURRENCE_COLUMNS, { count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("fingerprint", fingerprint)
    .order("occurred_at", { ascending: false })
    .range(from, from + PROBLEM_OCCURRENCES_PAGE_SIZE - 1)
    .returns<ProblemOccurrence[]>();
  if (error) return getLoadFailure("problem occurrences", error);
  return getLoaded({ occurrences: data ?? [], totalCount: count ?? 0 });
}

/** Search by a reference code (CWR-ABC-123) or a request id, as the plan's search box does. */
export async function fetchProblemSearch({ supabase, tenantId }: AdminContext, rawQuery: string): Promise<LoadResult<ProblemSearchResult>> {
  const query = rawQuery.trim().slice(0, MAX_SEARCH_LENGTH);
  const reference = query.toUpperCase();
  const isReference = REFERENCE_PATTERN.test(reference);
  const column = isReference ? "reference" : "request_id";
  const { data, error } = await supabase.from("problem_events").select("fingerprint").eq("tenant_id", tenantId).eq(column, isReference ? reference : query).limit(1).maybeSingle<{ fingerprint: string }>();
  if (error) return getLoadFailure("problem search", error);
  if (!data) return getLoaded(isReference ? { kind: "not_in_log" } : { kind: "no_match" });
  const group = await supabase.from("problem_groups").select("id").eq("tenant_id", tenantId).eq("fingerprint", data.fingerprint).maybeSingle<{ id: string }>();
  if (group.error) return getLoadFailure("problem search", group.error);
  return getLoaded(group.data ? { kind: "found", groupId: group.data.id } : { kind: "no_match" });
}
