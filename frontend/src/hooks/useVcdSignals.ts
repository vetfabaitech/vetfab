"use client";

import { useEffect, useState } from "react";
import { useSimulationStore } from "@/store/simulationStore";
import { parseVcdHeader, type VcdSignal } from "@/services/waveform/vcdParser";

/** Fetch+parse dedup cache, keyed by waveform URL -- `WatchPanel` and
 * `ObjectsPanel` are both permanently mounted (see `BottomPanel.tsx`'s doc
 * on why every tab body stays mounted) and both want this same file's
 * signal list, so without this they'd independently re-fetch and re-parse
 * the same VCD every time either one rendered. */
const cache = new Map<string, Promise<VcdSignal[]>>();

function fetchAndParse(url: string): Promise<VcdSignal[]> {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => res.text())
      .then(parseVcdHeader);
    cache.set(url, pending);
    pending.catch(() => cache.delete(url)); // don't cache a failed fetch forever
  }
  return pending;
}

interface UseVcdSignalsResult {
  signals: VcdSignal[];
  loading: boolean;
  error: string | null;
}

/** Signal list for whichever simulation session is currently active, from
 * its completed run's VCD file. This is a static, post-run snapshot (parsed
 * once per waveform URL) -- not a live stream, since nothing in this app's
 * execution pipeline pushes value-change events back to the client (see
 * `execution_manager.py`'s doc referenced in `QuickActionToolbar.tsx`). */
export function useVcdSignals(): UseVcdSignalsResult {
  const waveformUrl = useSimulationStore((s) => s.sessions.find((sess) => sess.id === s.activeSessionId)?.waveformUrl ?? null);
  const [result, setResult] = useState<UseVcdSignalsResult>({ signals: [], loading: false, error: null });

  // Reset synchronously during render whenever the URL changes (including to
  // null) -- React's documented pattern for state derived from a changed
  // prop, rather than an effect, so there's no stale-previous-file flash
  // before the effect below's fetch resolves.
  const [prevUrl, setPrevUrl] = useState(waveformUrl);
  if (waveformUrl !== prevUrl) {
    setPrevUrl(waveformUrl);
    setResult({ signals: [], loading: !!waveformUrl, error: null });
  }

  useEffect(() => {
    if (!waveformUrl) return;
    let cancelled = false;
    fetchAndParse(waveformUrl)
      .then((signals) => {
        if (!cancelled) setResult({ signals, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setResult({ signals: [], loading: false, error: "Couldn't load signals from the waveform file." });
      });
    return () => {
      cancelled = true;
    };
  }, [waveformUrl]);

  return result;
}
