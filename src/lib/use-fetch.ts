"use client";
import * as React from "react";
import { api } from "@/lib/client";

/** Minimal SWR-like hook: fetches on mount, exposes reload(). */
export default function useFetch<T>(url: string | null) {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const [error, setError] = React.useState<Error | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api<T>(url)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e as Error))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, tick]);

  const reload = React.useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
