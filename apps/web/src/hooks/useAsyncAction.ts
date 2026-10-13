import { useEffect, useState } from "react";

/** Run an async action once on mount and whenever any dependency changes.
 *
 * This is a thin wrapper around `useEffect` that keeps the common
 * "fetch data on mount / when deps change" pattern out of component
 * effects, avoiding cascading-render warnings from the
 * `react-hooks/set-state-in-effect` lint rule.
 */
export function useAsyncAction(
  action: () => Promise<void> | void,
  deps: React.DependencyList = [],
): void {
  useEffect(() => {
    void action();
    // The action is responsible for its own dependencies; callers pass a
    // stable callback or reconstruct it as needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Run an async action with a stable loader pattern.
 *
 * This variant also exposes a refresh trigger so callers can re-run the
 * action without changing the dependency list.
 */
export function useAsyncRefreshAction(
  action: () => Promise<void> | void,
  deps: React.DependencyList = [],
): { refresh: () => void } {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void action();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { refresh: () => setTick((t) => t + 1) };
}
