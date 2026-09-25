import { STATIC_PAGE_PATHS } from "@/lib/site/navigation";
import {
  CWR_TENANT_SLUG,
  SupabaseQueryError,
  getPublicClient,
  type PublicClient,
} from "@/lib/supabase/public-client";

// Mirrors the cwr.redirects.source_path check so odd URLs never reach the database.
const REDIRECT_SOURCE_PATTERN = /^\/[a-z0-9._~-]+(\/[a-z0-9._~-]+)*$/;
const MAX_REDIRECT_SOURCE_LENGTH = 200;
const PREFIXES_WITHOUT_REDIRECTS = ["/admin", "/api", "/brand"];
const FILE_EXTENSION = /\.[a-z0-9]+$/;
const TEAM_MEMBER_PATH = /^\/team\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const TEAM_INDEX_PATH = "/team";
const HIDDEN_MEMBER_STATUS = 302;

export type RedirectStatus = 301 | 302 | 308;

export type RedirectDecision = { targetPath: string; status: RedirectStatus };

type StoredRedirectRow = { target_path: string; status_code: 301 | 308 };

function hasPrefixWithoutRedirects(path: string): boolean {
  return PREFIXES_WITHOUT_REDIRECTS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** True when a normalized path might be an old URL worth a database lookup. */
export function isRedirectCandidate(path: string): boolean {
  if (STATIC_PAGE_PATHS.has(path)) return false;
  if (hasPrefixWithoutRedirects(path) || FILE_EXTENSION.test(path)) return false;
  return path.length <= MAX_REDIRECT_SOURCE_LENGTH && REDIRECT_SOURCE_PATTERN.test(path);
}

export function getTeamMemberSlug(path: string): string | null {
  return TEAM_MEMBER_PATH.exec(path)?.[1] ?? null;
}

async function fetchStoredRedirect(client: PublicClient, path: string): Promise<RedirectDecision | null> {
  const { data: row, error } = await client
    .from("redirects")
    .select("target_path, status_code, tenants!inner(slug)")
    .eq("tenants.slug", CWR_TENANT_SLUG)
    .eq("source_path", path)
    .maybeSingle<StoredRedirectRow>();
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchStoredRedirect", cause: error });
  return row ? { targetPath: row.target_path, status: row.status_code } : null;
}

async function fetchTenantId(client: PublicClient): Promise<string | null> {
  const { data: tenant, error } = await client
    .from("tenants")
    .select("id")
    .eq("slug", CWR_TENANT_SLUG)
    .maybeSingle<{ id: string }>();
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchTenantId", cause: error });
  return tenant?.id ?? null;
}

async function fetchIsHiddenTeamMember(
  client: PublicClient,
  { tenantId, slug }: { tenantId: string; slug: string },
): Promise<boolean> {
  const { data: isHidden, error } = await client.rpc("is_hidden_team_member", { p_tenant_id: tenantId, p_slug: slug });
  if (error) throw new SupabaseQueryError(error.message, { operation: "fetchIsHiddenTeamMember", cause: error });
  return isHidden === true;
}

async function fetchHiddenMemberRedirect(
  client: PublicClient,
  { slug, tenantId }: { slug: string; tenantId: string | null },
): Promise<RedirectDecision | null> {
  if (!tenantId) return null;
  const isHidden = await fetchIsHiddenTeamMember(client, { tenantId, slug });
  return isHidden ? { targetPath: TEAM_INDEX_PATH, status: HIDDEN_MEMBER_STATUS } : null;
}

/**
 * Where an already-normalized path should go: a stored redirect (301/308), a hidden
 * team member (302 to /team), or null to serve the page. Throws SupabaseQueryError.
 * A stored redirect that lands on a hidden member goes straight to /team (one hop).
 * For team pages the tenant is looked up alongside the redirect to save a round trip.
 */
export async function fetchRedirectDecision(path: string): Promise<RedirectDecision | null> {
  const client = getPublicClient();
  if (!client || !isRedirectCandidate(path)) return null;
  const isTeamPath = getTeamMemberSlug(path) !== null;
  const [storedRedirect, tenantIdForPath] = await Promise.all([
    fetchStoredRedirect(client, path),
    isTeamPath ? fetchTenantId(client) : Promise.resolve(null),
  ]);
  const slug = getTeamMemberSlug(storedRedirect?.targetPath ?? path);
  if (!slug) return storedRedirect;
  const tenantId = tenantIdForPath ?? (await fetchTenantId(client));
  const hiddenMemberRedirect = await fetchHiddenMemberRedirect(client, { slug, tenantId });
  return hiddenMemberRedirect ?? storedRedirect;
}
