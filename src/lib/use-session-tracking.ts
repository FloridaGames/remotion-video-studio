import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startSession, heartbeatSession, endSession } from "./sessions.functions";

const HEARTBEAT_MS = 60_000;

/** Tracks an active session row in user_sessions while the user is signed in. */
export function useSessionTracking(userId: string | null | undefined) {
  const start = useServerFn(startSession);
  const beat = useServerFn(heartbeatSession);
  const end = useServerFn(endSession);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const { sessionId } = await start();
        if (cancelled) {
          await end({ data: { sessionId } }).catch(() => {});
          return;
        }
        sessionIdRef.current = sessionId;
        interval = setInterval(() => {
          if (sessionIdRef.current) {
            beat({ data: { sessionId: sessionIdRef.current } }).catch(() => {});
          }
        }, HEARTBEAT_MS);
      } catch {
        // Non-fatal: skip tracking
      }
    })();

    const handleUnload = () => {
      const id = sessionIdRef.current;
      if (id) {
        // Best-effort flush; navigator may abort the fetch on unload.
        end({ data: { sessionId: id } }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", handleUnload);
      if (interval) clearInterval(interval);
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      if (id) end({ data: { sessionId: id } }).catch(() => {});
    };
  }, [userId, start, beat, end]);
}