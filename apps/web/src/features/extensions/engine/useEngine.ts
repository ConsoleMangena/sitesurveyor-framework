import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createEngineClient,
  EngineError,
  type EngineHealth,
  type EngineJob,
  type SurveyInput,
} from "./client.ts";
import { useAsyncAction } from "../../../hooks/useAsyncAction.ts";

export type ConnectionStatus = "unset" | "checking" | "online" | "offline";

export interface EngineConnection {
  status: ConnectionStatus;
  health: EngineHealth | null;
  error: EngineError | null;
  client: ReturnType<typeof createEngineClient> | null;
  check: () => Promise<void>;
}

/**
 * Ask the engine what it is.
 *
 * Every surface that shows extension status calls this, and an empty endpoint
 * is reported as unset rather than fetched against: a request to "" resolves to
 * the app's own origin, which would answer 200 with the SPA and read as a live
 * engine.
 */
export function useEngineConnection(endpoint: string): EngineConnection {
  const client = useMemo(
    () => (endpoint ? createEngineClient(endpoint) : null),
    [endpoint],
  );
  const [status, setStatus] = useState<ConnectionStatus>(endpoint ? "checking" : "unset");
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [error, setError] = useState<EngineError | null>(null);
  const token = useRef(0);

  const check = useCallback(async () => {
    if (!client) {
      setStatus("unset");
      setHealth(null);
      setError(null);
      return;
    }
    const attempt = ++token.current;
    setStatus("checking");
    try {
      const next = await client.health();
      if (attempt !== token.current) return;
      setHealth(next);
      setError(null);
      setStatus("online");
    } catch (err) {
      if (attempt !== token.current) return;
      setHealth(null);
      setError(err instanceof EngineError ? err : new EngineError("unreachable", "The engine did not answer."));
      setStatus("offline");
    }
  }, [client]);

  useAsyncAction(() => void check(), [check, endpoint]);

  return { status, health, error, client, check };
}

export type SurveyPhase =
  | "idle"
  | "submitting"
  | "running"
  | "succeeded"
  | "failed";

export interface SurveyRun {
  phase: SurveyPhase;
  job: EngineJob | null;
  /** The engine's own estimate for this AOI, from the survey response. */
  estimatedMinutes: number | null;
  error: EngineError | null;
  start: (input: SurveyInput) => Promise<void>;
  reset: () => void;
}

const POLL_MS = 2500;

/**
 * Submit a survey and follow the engine's job until it lands.
 *
 * The job is the only source of truth for progress, so the UI renders whatever
 * stage and percent it reports instead of guessing from elapsed time. Polling
 * stops when the component unmounts, the job reaches a terminal state, or the
 * engine no longer recognises the id.
 */
export function useSurveyJob(
  client: ReturnType<typeof createEngineClient> | null,
): SurveyRun {
  const [phase, setPhase] = useState<SurveyPhase>("idle");
  const [job, setJob] = useState<EngineJob | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [error, setError] = useState<EngineError | null>(null);
  const runId = useRef(0);

  /** Abandon whatever survey this hook is following. */
  const stop = useCallback(() => {
    runId.current += 1;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    async (input: SurveyInput) => {
      if (!client) return;
      const attempt = runId.current + 1;
      runId.current = attempt;
      setPhase("submitting");
      setJob(null);
      setEstimatedMinutes(null);
      setError(null);

      // The engine owns the work and the progress; this only keeps asking. Each
      // await re-checks the attempt number so a reset, a resubmit or an unmount
      // between polls drops the stale answer instead of painting it over the new run.
      const mine = () => runId.current === attempt;
      try {
        const accepted = await client.survey(input);
        if (!mine()) return;
        setEstimatedMinutes(accepted.estimated_minutes ?? null);
        setPhase("running");

        let waitMs = Math.max(500, accepted.poll_after_ms ?? POLL_MS);
        while (mine()) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          if (!mine()) return;
          const next = await client.job(accepted.job_id);
          if (!mine()) return;
          setJob(next);
          if (next.status === "succeeded") {
            setPhase("succeeded");
            return;
          }
          if (next.status === "failed") {
            setPhase("failed");
            setError(
              new EngineError("http", next.error?.message ?? "The survey failed.", {
                code: next.error?.code ?? null,
                hint: next.error?.request_id
                  ? `Quote request id ${next.error.request_id} to the engine operator.`
                  : null,
              }),
            );
            return;
          }
          waitMs = POLL_MS;
        }
      } catch (err) {
        if (!mine()) return;
        setPhase("failed");
        setError(
          err instanceof EngineError
            ? err
            : new EngineError("unreachable", "The engine refused the survey."),
        );
      }
    },
    [client],
  );

  const reset = useCallback(() => {
    stop();
    setPhase("idle");
    setJob(null);
    setEstimatedMinutes(null);
    setError(null);
  }, [stop]);

  return { phase, job, estimatedMinutes, error, start, reset };
}
