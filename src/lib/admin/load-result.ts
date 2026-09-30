// A page's data either loaded or failed; a failure is never shown as an empty list, a zero,
// or "not found" (docs/cwr-error-tracking-plan.md, silent paths). Safe in any module.

export type LoadFailure = { part: string; code: string | null; detail: string | null };

export type LoadResult<Data> = { isLoaded: true; data: Data } | { isLoaded: false; failure: LoadFailure };

type QueryResult<Row> = { data: Row | null; error: { code?: string; message: string } | null };

export function getLoaded<Data>(data: Data): LoadResult<Data> {
  return { isLoaded: true, data };
}

export function getLoadFailure(part: string, error: { code?: string; message: string }): LoadResult<never> {
  return { isLoaded: false, failure: { part, code: error.code ?? null, detail: error.message } };
}

/** A Supabase query as a LoadResult; `data` falls back to `empty` when no row matched. */
export function getQueryLoad<Row, Data = Row>({ part, result, empty }: { part: string; result: QueryResult<Row>; empty: Data }): LoadResult<Row | Data> {
  if (result.error) return getLoadFailure(part, result.error);
  return getLoaded(result.data ?? empty);
}

export function getLoadFailures(results: LoadResult<unknown>[]): LoadFailure[] {
  return results.flatMap((result) => (result.isLoaded ? [] : [result.failure]));
}
