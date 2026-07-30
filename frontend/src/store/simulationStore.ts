import { create } from "zustand";

export type SimulationStatus = "running" | "completed" | "failed" | "terminated";

export interface SimulationSession {
  /** Stable key -- the testbench's relative path (or "terminal-session" for
   * the interactive shell terminal's own waveform). Re-running the SAME
   * testbench replaces this entry in place; running a DIFFERENT testbench
   * always adds a new one, so prior waveforms are never lost. */
  id: string;
  jobId: string | null;
  testbenchName: string;
  status: SimulationStatus;
  executionTimeMs: number | null;
  waveformUrl: string | null;
  hasWaveform: boolean;
  timestamp: number;
}

interface SimulationState {
  sessions: SimulationSession[];
  activeSessionId: string | null;
  /** Hierarchy path (e.g. "tb.dut.counter") of the signal last clicked in
   * the Objects panel -- read by `WaveformPanel.tsx` to fold an extra Surfer
   * `startup_commands` focus into its next reload, the same mechanism
   * `extractTopScopeName` already uses for the top-level scope. This is how
   * "clicking a signal highlights it in the waveform" is wired across two
   * components that don't share a DOM ancestor (Objects lives in the bottom
   * panel, Waveform lives in the right panel) without prop-drilling through
   * `page.tsx`. */
  focusedSignalPath: string | null;

  upsertSession: (session: SimulationSession) => void;
  patchSession: (id: string, patch: Partial<SimulationSession>) => void;
  setActiveSession: (id: string | null) => void;
  removeSession: (id: string) => void;
  focusSignal: (path: string) => void;
  clear: () => void;
}

/** Simulation Manager: owns simulation history, which one is currently being
 * viewed, and the waveform URL for each -- independent of how/when a run was
 * triggered (single Run, Run All, or the interactive terminal). Waveforms
 * themselves are never re-fetched/regenerated on selection -- the backend
 * already keeps every completed job's waveform available indefinitely by
 * job id, so switching sessions here is just a state change, not a rerun. */
export const useSimulationStore = create<SimulationState>((set) => ({
  sessions: [],
  activeSessionId: null,
  focusedSignalPath: null,

  upsertSession: (session) =>
    set((state) => {
      const idx = state.sessions.findIndex((s) => s.id === session.id);
      const sessions =
        idx === -1 ? [...state.sessions, session] : state.sessions.map((s, i) => (i === idx ? session : s));
      return { sessions };
    }),

  patchSession: (id, patch) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id);
      const activeSessionId =
        state.activeSessionId === id ? (sessions[sessions.length - 1]?.id ?? null) : state.activeSessionId;
      return { sessions, activeSessionId };
    }),

  focusSignal: (path) => set({ focusedSignalPath: path }),

  clear: () => set({ sessions: [], activeSessionId: null, focusedSignalPath: null }),
}));
