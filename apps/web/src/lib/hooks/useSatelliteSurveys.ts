import { useCallback, useEffect, useRef, useState } from "react";

import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import {
  getSurveyRunDetail,
  listSurveyRuns,
  type SurveyRun,
  type SurveyRunDetail,
} from "../repositories/satelliteSurveys.ts";

/** Runs are written by a worker on the other side of the database, so the page asks
 *  the platform what it knows rather than holding a connection open. Four seconds is
 *  coarse next to a survey that takes minutes, and one query per tick. */
const POLL_MS = 4000;

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong.";
}

/**
 * This workspace's survey queue.
 *
 * The rows are the state machine, so reloading the tab costs one query and the survey
 * that is three minutes into downloading coverages is still there, still moving.
 */
export function useSurveyRuns(workspaceId: string) {
  const [runs, setRuns] = useState<SurveyRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const attempt = ++generation.current;
    try {
      const next = await listSurveyRuns(workspaceId);
      if (attempt !== generation.current) return;
      setRuns(next);
      setError(null);
      setLoaded(true);
    } catch (err) {
      if (attempt !== generation.current) return;
      setError(messageOf(err));
      setLoaded(true);
    }
  }, [workspaceId]);

  useAsyncAction(() => void load(), [load, workspaceId]);

  const hasActiveRun = runs.some((run) => run.active);

  useEffect(() => {
    if (!hasActiveRun) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [hasActiveRun, load]);

  /** Adopt a run the platform just queued, without waiting for the next poll. */
  const adopt = useCallback((run: SurveyRun) => {
    setRuns((current) => [run, ...current.filter((row) => row.id !== run.id)]);
  }, []);

  return { runs, error, loaded, refresh: load, adopt };
}

/**
 * The targets and files of one finished survey.
 *
 * Nothing is published until the worker succeeds, so this waits for a terminal status
 * and then reads once: a succeeded run cannot change underneath the page.
 */
export function useSurveyDetail(run: SurveyRun | null) {
  const runId = run?.id ?? "";
  const settled = run !== null && !run.active;
  // Both the rows and the failure are tagged with the run they belong to, so switching
  // surveys cannot leave the previous one's error hanging over the new one.
  const [state, setState] = useState<{
    runId: string;
    detail: SurveyRunDetail | null;
    error: string | null;
  }>({ runId: "", detail: null, error: null });
  const generation = useRef(0);

  const load = useCallback(async () => {
    const attempt = ++generation.current;
    const forRun = runId;
    try {
      const next = await getSurveyRunDetail(forRun);
      if (attempt !== generation.current) return;
      setState({ runId: forRun, detail: next, error: null });
    } catch (err) {
      if (attempt !== generation.current) return;
      setState({ runId: forRun, detail: null, error: messageOf(err) });
    }
  }, [runId]);

  useAsyncAction(() => (settled ? load() : undefined), [settled, load]);

  if (state.runId !== runId || runId === "") {
    return { detail: null, error: null };
  }
  return { detail: state.detail, error: state.error };
}
