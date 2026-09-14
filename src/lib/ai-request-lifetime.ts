import { AIError } from "./ai-errors";

export const AI_IDLE_TIMEOUT_MS = 120000;
export const AI_TOTAL_TIMEOUT_MS = 600000;

export function createAIRequestLifetime(upstream: AbortController, clientSignal: AbortSignal) {
  const signal = AbortSignal.any([clientSignal, upstream.signal]);
  let idle: ReturnType<typeof setTimeout>;
  let disposed = false;
  const total = setTimeout(() => upstream.abort(new AIError("AI_TIMEOUT")), AI_TOTAL_TIMEOUT_MS);
  const dispose = () => {
    disposed = true;
    clearTimeout(idle);
    clearTimeout(total);
    signal.removeEventListener("abort", dispose);
  };
  // Reset on bytes from the provider, including comments and reasoning beyond
  // the display limit. Browser keep-alives must never reset this deadline.
  const activity = () => {
    if (disposed || signal.aborted) return;
    clearTimeout(idle);
    idle = setTimeout(() => upstream.abort(new AIError("AI_IDLE_TIMEOUT")), AI_IDLE_TIMEOUT_MS);
  };
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted) dispose();
  else activity();
  return { signal, activity, dispose };
}
