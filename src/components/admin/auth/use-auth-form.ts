"use client";

import { startTransition, useActionState, type FormEvent } from "react";

// Sign-in forms submit without the browser's automatic reset, so a typed email is
// kept when something needs fixing.
export function useAuthForm<State extends object>(action: (state: Awaited<State>, formData: FormData) => Promise<State>, initialState: Awaited<State>) {
  const [state, dispatch, isPending] = useActionState(action, initialState);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return { state, isPending, handleSubmit };
}
