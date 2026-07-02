/**
 * A once-per-second ticker + elapsed-time helpers for the KDS.
 *
 * `useNow()` returns the current epoch-ms and re-renders the caller every
 * second, so many ticket cards can share a single interval instead of each
 * spinning up their own.
 */
import { useEffect, useState } from "react";
import type { Ts } from "@/types/models";

/** Live "now" in epoch milliseconds; updates every second. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Threshold (ms) past which a live ticket is considered "urgent". */
export const URGENT_MS = 15 * 60 * 1000;

/** Milliseconds elapsed since a Firestore Timestamp, given a "now" epoch-ms. */
export function elapsedMs(createdAt: Ts, now: number): number {
  if (!createdAt) return 0;
  return Math.max(0, now - createdAt.toDate().getTime());
}

/** Format a millisecond duration as `MM:SS` (or `H:MM:SS` past an hour). */
export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
