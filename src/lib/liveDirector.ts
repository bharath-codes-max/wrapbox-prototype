// The live-demo director — a timeline state machine as a React hook.
//
// It plays LIVE_BEATS like a film: auto-advancing hands-free on stage, pausing
// on interactive beats for the presenter, and — crucially — carrying the
// accumulated session ctx that the REAL engine decisions read. Seeking a chapter
// rebuilds ctx by replaying every beat's setCtx from the start, so the PII taint
// (and the org clock) are never stale. No decision logic lives here; the verdict
// is always src/data/live.ts runDecision → src/lib/engine.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Beat } from "../data/live";

type State = "idle" | "playing" | "paused" | "done";
/** Exported alias so a consumer can import the state union by name. */
export type DirectorState = State;

export interface Director {
  state: State;
  index: number; // current beat
  beat: Beat | null;
  ctx: Record<string, unknown>; // accumulated session ctx (drives real decisions)
  progress: number; // 0..1 within the current beat
  chapter: number;
  speed: number;
  reducedMotion: boolean;
  /** true while an interactive beat is held, waiting for the presenter */
  awaiting: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  restart(): void;
  seekChapter(n: number): void; // jump to first beat of chapter n, rebuilding ctx
  setSpeed(x: number): void;
  resolveInteraction(): void; // presenter performed the interactive action → advance now
}

/** Merge every beat's setCtx from beat 0 up to and including `index`. */
function ctxUpTo(beats: Beat[], index: number): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  for (let i = 0; i <= index && i < beats.length; i++) {
    const s = beats[i]?.setCtx;
    if (s) Object.assign(ctx, s);
  }
  return ctx;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

export function useDirector(beats: Beat[]): Director {
  const reducedMotion = usePrefersReducedMotion();

  const [state, setState] = useState<State>("idle");
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeedState] = useState(1);
  const [awaiting, setAwaiting] = useState(false);
  // ctx is derived from index, but held in state so consumers re-render on change.
  const [ctx, setCtx] = useState<Record<string, unknown>>(() => ctxUpTo(beats, 0));

  // Refs the animation loop reads without re-subscribing.
  const rafRef = useRef<number | null>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<number>(0);
  const heldRef = useRef(false); // currently paused on an interactive beat
  const stateRef = useRef<State>(state);
  const indexRef = useRef(index);
  const speedRef = useRef(speed);
  const manualRef = useRef(false); // user pressed play → honor motion even if reduced

  stateRef.current = state;
  indexRef.current = index;
  speedRef.current = speed;

  const beat = beats[index] ?? null;
  const chapter = beat?.chapter ?? 1;

  const clearTimers = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (idleRef.current != null) clearTimeout(idleRef.current);
    idleRef.current = null;
  }, []);

  // Effective duration for a beat: reduced motion collapses to instant unless the
  // presenter is driving manually.
  const durationOf = useCallback(
    (b: Beat | null) => {
      if (!b) return 0;
      if (reducedMotion && !manualRef.current) return 1;
      return Math.max(1, b.duration / speedRef.current);
    },
    [reducedMotion],
  );

  // Move to a specific beat index, rebuilding ctx from the start.
  const goTo = useCallback(
    (i: number) => {
      clearTimers();
      heldRef.current = false;
      setAwaiting(false);
      const clamped = Math.max(0, Math.min(i, beats.length - 1));
      indexRef.current = clamped;
      setIndex(clamped);
      setCtx(ctxUpTo(beats, clamped));
      setProgress(0);
      startRef.current = 0;
    },
    [beats, clearTimers],
  );

  // Advance to the next beat, or finish.
  const advance = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= beats.length) {
      clearTimers();
      setProgress(1);
      setState("done");
      stateRef.current = "done";
      return;
    }
    goTo(next);
    // Stay playing; the run loop picks the new beat up on its next tick.
    setState("playing");
    stateRef.current = "playing";
  }, [beats, clearTimers, goTo]);

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  // The run loop for one beat: animate progress, then advance (or hold on an
  // interactive beat until the presenter resolves / an idle timer fires).
  const runCurrent = useCallback(() => {
    clearTimers();
    const b = beats[indexRef.current];
    if (!b) return;

    // Interactive beats: hold, show progress full, auto-resolve after idle.
    if (b.interactive) {
      heldRef.current = true;
      setAwaiting(true);
      setProgress(1);
      const idle = reducedMotion && !manualRef.current ? 1 : (b.interactive.idleMs ?? 4000) / speedRef.current;
      idleRef.current = setTimeout(() => {
        heldRef.current = false;
        setAwaiting(false);
        advanceRef.current();
      }, idle);
      return;
    }

    const dur = durationOf(b);
    startRef.current = performance.now();
    const tick = (now: number) => {
      if (stateRef.current !== "playing") return;
      const elapsed = now - startRef.current;
      const p = Math.min(1, elapsed / dur);
      setProgress(p);
      if (p >= 1) {
        advanceRef.current();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [beats, clearTimers, durationOf, reducedMotion]);

  const runRef = useRef(runCurrent);
  runRef.current = runCurrent;

  // Whenever we enter/refresh the playing state on a new beat, run it.
  useEffect(() => {
    if (state !== "playing") return;
    runRef.current();
    return clearTimers;
    // Re-run when the beat index or speed changes while playing.
  }, [state, index, speed, clearTimers]);

  // Cleanup on unmount.
  useEffect(() => clearTimers, [clearTimers]);

  const play = useCallback(() => {
    manualRef.current = true;
    if (stateRef.current === "done") {
      goTo(0);
    }
    setState("playing");
    stateRef.current = "playing";
  }, [goTo]);

  const pause = useCallback(() => {
    clearTimers();
    // Preserve progress; a held interactive beat stays awaiting.
    setState("paused");
    stateRef.current = "paused";
  }, [clearTimers]);

  const toggle = useCallback(() => {
    if (stateRef.current === "playing") pause();
    else play();
  }, [pause, play]);

  const restart = useCallback(() => {
    goTo(0);
    setState("playing");
    stateRef.current = "playing";
  }, [goTo]);

  const seekChapter = useCallback(
    (n: number) => {
      const i = beats.findIndex((b) => b.chapter === n);
      if (i < 0) return;
      const wasPlaying = stateRef.current === "playing";
      goTo(i);
      if (wasPlaying) {
        setState("playing");
        stateRef.current = "playing";
      } else {
        setState("paused");
        stateRef.current = "paused";
      }
    },
    [beats, goTo],
  );

  const setSpeed = useCallback((x: number) => {
    setSpeedState(x);
    speedRef.current = x;
  }, []);

  const resolveInteraction = useCallback(() => {
    if (!heldRef.current) return;
    if (idleRef.current != null) clearTimeout(idleRef.current);
    idleRef.current = null;
    heldRef.current = false;
    setAwaiting(false);
    advanceRef.current();
  }, []);

  return useMemo<Director>(
    () => ({
      state,
      index,
      beat,
      ctx,
      progress,
      chapter,
      speed,
      reducedMotion,
      awaiting,
      play,
      pause,
      toggle,
      restart,
      seekChapter,
      setSpeed,
      resolveInteraction,
    }),
    [state, index, beat, ctx, progress, chapter, speed, reducedMotion, awaiting, play, pause, toggle, restart, seekChapter, setSpeed, resolveInteraction],
  );
}
