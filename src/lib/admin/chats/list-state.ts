import { DEFAULT_ACTIVITY_SPAN, getActivitySpan, type ActivitySpan } from "@/lib/admin/chats/activity";

// Chat history's search, sort, filter, and span live in the address (?show=&q=&sort=&dir=&span=),
// so Back, refresh, and shared links keep them. Pure and safe in client components: the search
// box and the sort menu build their links with it.

const CHATS_PATH = "/admin/chats";
export const MAX_SEARCH_LENGTH = 100;
// PostgREST reads "*" in a match pattern as "any text" and has no way to escape it.
const UNSEARCHABLE_CHARACTERS = /[*\u0000-\u001f\u007f]/g;
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

export type ChatFilter = "all" | "handoffs";

export type ChatSort = "question" | "details" | "date";

export type SortDirection = "asc" | "desc";

export type ChatListState = { filter: ChatFilter; search: string; sort: ChatSort; direction: SortDirection; span: ActivitySpan };

type RawParam = string | string[] | undefined;

export type ChatListParams = { show?: RawParam; q?: RawParam; sort?: RawParam; dir?: RawParam; span?: RawParam };

/** page: kept in the link only when above 1; links never carry it otherwise. */
export type ChatListChanges = Partial<ChatListState> & { page?: number };

export type SortOption = { sort: ChatSort; direction: SortDirection; label: string };

const SORT_DEFAULT_DIRECTIONS: Record<ChatSort, SortDirection> = { question: "asc", details: "desc", date: "desc" };

const NEWEST_FIRST_LABEL = "Newest first";

export const SORT_OPTIONS: SortOption[] = [
  { sort: "date", direction: "desc", label: NEWEST_FIRST_LABEL },
  { sort: "date", direction: "asc", label: "Oldest first" },
  { sort: "question", direction: "asc", label: "Question A to Z" },
  { sort: "question", direction: "desc", label: "Question Z to A" },
  { sort: "details", direction: "desc", label: "Most questions" },
  { sort: "details", direction: "asc", label: "Fewest questions" },
];

export const DEFAULT_CHAT_LIST_STATE: ChatListState = { filter: "all", search: "", sort: "date", direction: "desc", span: DEFAULT_ACTIVITY_SPAN };

/** Anything unknown falls back to the default, so an edited or old link still opens the list. */
export function getChatListState(params: ChatListParams): ChatListState {
  const sort = getChatSort(getSingle(params.sort));
  return {
    filter: getSingle(params.show) === "handoffs" ? "handoffs" : "all",
    search: getSearchText(getSingle(params.q)),
    sort,
    direction: getDirection(getSingle(params.dir)) ?? SORT_DEFAULT_DIRECTIONS[sort],
    span: getActivitySpan(getSingle(params.span)),
  };
}

/** Trimmed, without characters a search can't match, and at most MAX_SEARCH_LENGTH long. */
export function getSearchText(rawSearch: string | undefined): string {
  if (rawSearch === undefined) return "";
  return rawSearch.replace(UNSEARCHABLE_CHARACTERS, " ").trim().slice(0, MAX_SEARCH_LENGTH).trim();
}

/** A case-insensitive "contains" pattern in which %, _ and \ match only themselves. */
export function getSearchPattern(search: string): string {
  return `%${search.replace(LIKE_SPECIAL_CHARACTERS, (character) => `\\${character}`)}%`;
}

/** The link for `state` with `changes` applied; settings at their default are left out. */
export function getChatListHref(state: ChatListState, changes: ChatListChanges = {}): string {
  const { page, ...stateChanges } = changes;
  const next = { ...state, ...stateChanges };
  const params = new URLSearchParams();
  if (next.filter !== DEFAULT_CHAT_LIST_STATE.filter) params.set("show", next.filter);
  if (next.search) params.set("q", next.search);
  if (next.sort !== DEFAULT_CHAT_LIST_STATE.sort) params.set("sort", next.sort);
  if (next.direction !== SORT_DEFAULT_DIRECTIONS[next.sort]) params.set("dir", next.direction);
  if (next.span !== DEFAULT_CHAT_LIST_STATE.span) params.set("span", next.span);
  if (page !== undefined && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${CHATS_PATH}?${query}` : CHATS_PATH;
}

/** Clicking the active column reverses it; another column starts at its usual direction. */
export function getSortChange(state: ChatListState, sort: ChatSort): Pick<ChatListState, "sort" | "direction"> {
  if (state.sort !== sort) return { sort, direction: SORT_DEFAULT_DIRECTIONS[sort] };
  return { sort, direction: state.direction === "asc" ? "desc" : "asc" };
}

export function getSortLabel({ sort, direction }: Pick<ChatListState, "sort" | "direction">): string {
  return SORT_OPTIONS.find((option) => option.sort === sort && option.direction === direction)?.label ?? NEWEST_FIRST_LABEL;
}

function getSingle(rawParam: RawParam): string | undefined {
  return Array.isArray(rawParam) ? rawParam[0] : rawParam;
}

function getChatSort(rawSort: string | undefined): ChatSort {
  return rawSort === "question" || rawSort === "details" ? rawSort : "date";
}

function getDirection(rawDirection: string | undefined): SortDirection | null {
  return rawDirection === "asc" || rawDirection === "desc" ? rawDirection : null;
}
