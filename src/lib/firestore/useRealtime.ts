/**
 * Generic real-time subscription hooks — the heart of "live updates for free".
 *
 * These wrap Firestore's onSnapshot so every module gets live data with the
 * same loading/error contract. Feature-specific hooks (useTables, useKots, …)
 * are thin wrappers over these.
 */
import { useEffect, useRef, useState } from "react";
import {
  onSnapshot,
  type DocumentReference,
  type Query,
} from "firebase/firestore";

export interface RealtimeState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/**
 * Subscribe to a collection query. `data` is an array of docs (with id).
 *
 * IDENTITY STABILITY: a naive `snap.docs.map(...)` mints a brand-new object for
 * every document on every snapshot, so one ticket changing status handed all
 * nine KDS cards fresh props and their `memo()` never bailed out. Instead we
 * keep a per-subscription id->object cache and reuse the previous object for
 * any doc that did NOT appear in `snap.docChanges()` — the docs Firestore
 * itself is telling us are untouched. Unchanged docs therefore keep referential
 * identity across snapshots and memoized children skip re-rendering.
 *
 * When no document changed at all, the previous state object is returned
 * as-is so React bails out of the render entirely.
 */
export function useCollectionData<T>(
  query: Query<T> | null
): RealtimeState<(T & { id: string })[]> {
  const [state, setState] = useState<RealtimeState<(T & { id: string })[]>>({
    data: [],
    loading: true,
    error: null,
  });
  // id -> last emitted object. Reset per subscription (below): a new query is
  // a new result set, and stale entries would otherwise leak.
  const cacheRef = useRef(new Map<string, T & { id: string }>());

  useEffect(() => {
    cacheRef.current = new Map();
    if (!query) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const unsub = onSnapshot(
      query,
      (snap) => {
        const cache = cacheRef.current;
        // Default docChanges() already excludes metadata-only changes, so this
        // is exactly "the docs whose data moved".
        const touched = new Set<string>();
        for (const change of snap.docChanges()) {
          if (change.type === "removed") cache.delete(change.doc.id);
          else touched.add(change.doc.id);
        }
        const data = snap.docs.map((d) => {
          const prev = cache.get(d.id);
          if (prev && !touched.has(d.id)) return prev;
          const next = { id: d.id, ...d.data() };
          cache.set(d.id, next);
          return next;
        });
        setState((prevState) => {
          // Nothing moved (and we're already settled) — keep the old state
          // object so consumers don't re-render at all.
          const identical =
            !prevState.loading &&
            prevState.error === null &&
            prevState.data.length === data.length &&
            data.every((doc, i) => doc === prevState.data[i]);
          return identical ? prevState : { data, loading: false, error: null };
        });
      },
      (error) => {
        cacheRef.current = new Map();
        setState({ data: [], loading: false, error });
      }
    );
    return unsub;
    // Query identity is managed by callers via useMemo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return state;
}

/** Subscribe to a single document. `data` is null until loaded / if missing. */
export function useDocData<T>(
  refOrNull: DocumentReference<T> | null
): RealtimeState<(T & { id: string }) | null> {
  const [state, setState] = useState<RealtimeState<(T & { id: string }) | null>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!refOrNull) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const unsub = onSnapshot(
      refOrNull,
      (snap) => {
        setState({
          data: snap.exists() ? ({ id: snap.id, ...snap.data() }) : null,
          loading: false,
          error: null,
        });
      },
      (error) => setState({ data: null, loading: false, error })
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refOrNull]);

  return state;
}
