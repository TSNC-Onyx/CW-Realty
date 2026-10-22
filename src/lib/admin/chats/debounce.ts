// Waits until calls stop for `waitMs`, then runs `callback` once with the last value
// (Infra §5: search runs on debounced input). Plain timers, so it is tested in Node.

export type Debouncer<Value> = { call: (value: Value) => void; cancel: () => void };

export function createDebouncer<Value>({ callback, waitMs }: { callback: (value: Value) => void; waitMs: number }): Debouncer<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => clearTimeout(timer);
  const call = (value: Value) => {
    cancel();
    timer = setTimeout(() => callback(value), waitMs);
  };
  return { call, cancel };
}
