"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";

import { createDebouncer, type Debouncer } from "@/lib/admin/chats/debounce";
import { DEFAULT_CHAT_LIST_STATE, getChatListHref, getSearchText, MAX_SEARCH_LENGTH, type ChatListState } from "@/lib/admin/chats/list-state";

// Search box for Chat history (Infra §5: debounced input). The list updates 300ms after typing
// stops, in place: the old results stay until the new ones arrive, the page doesn't scroll or
// shift, and the box keeps every letter typed meanwhile. Without JavaScript, Enter submits the
// same search as an ordinary form.

const SEARCH_WAIT_MS = 300;

export function ChatSearch({ state }: { state: ChatListState }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncerRef = useRef<Debouncer<string> | null>(null);
  // Read when the wait ends, so a search typed while the previous one loads runs against the
  // settings now on screen, not the ones from when typing began.
  const showSearchRef = useRef<(rawSearch: string) => void>(() => undefined);
  const [text, setText] = useState(state.search);
  const [shownSearch, setShownSearch] = useState(state.search);
  const [isFocused, setIsFocused] = useState(false);
  const [isPending, startTransition] = useTransition();
  const hiddenFields = useMemo(() => getHiddenFields(state), [state]);

  // Back, Forward, or a link changed the search: show it, unless the owner is typing in the box.
  if (state.search !== shownSearch) {
    setShownSearch(state.search);
    if (!isFocused) setText(state.search);
  }

  useEffect(() => {
    showSearchRef.current = (rawSearch: string) => {
      const search = getSearchText(rawSearch);
      if (search === state.search) return;
      startTransition(() => router.replace(getChatListHref(state, { search }), { scroll: false }));
    };
  }, [router, state]);
  useEffect(() => {
    const debouncer = createDebouncer<string>({ callback: (rawSearch) => showSearchRef.current(rawSearch), waitMs: SEARCH_WAIT_MS });
    debouncerRef.current = debouncer;
    return debouncer.cancel;
  }, []);

  const handleChange = (value: string) => {
    setText(value);
    debouncerRef.current?.call(value);
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    debouncerRef.current?.cancel();
    showSearchRef.current(text);
  };
  const handleClear = () => {
    setText("");
    debouncerRef.current?.cancel();
    showSearchRef.current("");
    inputRef.current?.focus();
  };

  return (
    <form role="search" method="get" action="/admin/chats" onSubmit={handleSubmit} className="mb-6 grid max-w-prose gap-1">
      {/* A fixed-height row: Clear and "Searching…" come and go without moving the box or the list. */}
      <div className="flex min-h-11 items-center justify-between gap-4">
        <label htmlFor="chat-search" className="text-base font-bold">
          Search chats
        </label>
        <div className="flex items-center gap-4">
          <span role="status" className="type-small text-muted">
            {isPending ? "Searching…" : ""}
          </span>
          {text && (
            <button type="button" onClick={handleClear} className="text-link">
              Clear search
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        id="chat-search"
        name="q"
        type="search"
        value={text}
        maxLength={MAX_SEARCH_LENGTH}
        autoComplete="off"
        enterKeyHint="search"
        aria-describedby="chat-search-hint"
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="field-input"
      />
      <p id="chat-search-hint" className="type-small text-muted">
        Finds the words anywhere in what visitors asked or the assistant answered.
      </p>
      {hiddenFields.map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </form>
  );
}

/** The list's other settings, so a search submitted without JavaScript keeps them. */
function getHiddenFields(state: ChatListState): [string, string][] {
  const href = getChatListHref({ ...state, search: DEFAULT_CHAT_LIST_STATE.search });
  return [...new URL(href, "http://localhost").searchParams.entries()];
}
