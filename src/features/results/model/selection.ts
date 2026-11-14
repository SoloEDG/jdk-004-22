import type { BenchmarkState, GameDoc, RunRecord } from "../../../shared/types";
import { saveLibrary } from "../lib/storage";
import { liveWaveScore } from "./telemetry";

/**
 * Picks the comparison benchmark for the next action. The choice is persisted
 * but does not touch a benchmark already pinned to a running action.
 */
export function selectBenchmark(doc: GameDoc, id: string | null): boolean {
  const record = id ? doc.records.find((r) => r.id === id) : null;
  if (id !== null && !record) return false;
  doc.selectedBenchmarkId = record ? record.id : null;
  doc.saveState = saveLibrary(doc.records, doc.selectedBenchmarkId);
  return true;
}

export function benchmarkFor(record: RunRecord | null): BenchmarkState | null {
  if (!record) return null;
  return {
    record,
    mode: record.waves?.length ? "waves" : "total",
    lockedAt: Date.now(),
  };
}

/**
 * Locks the selected archive to the action at deployment time. Because the
 * document keeps its own copy, later imports or selections cannot swap it
 * underneath the player until a new action begins.
 */
export function pinBenchmark(doc: GameDoc): BenchmarkState | null {
  const record = doc.records.find((r) => r.id === doc.selectedBenchmarkId) ?? null;
  doc.benchmark = benchmarkFor(record);
  return doc.benchmark;
}

/** Waves of the running action, including the partial wave in progress. */
export function currentWaveScores(doc: GameDoc) {
  const live = doc.waveStart.wave > 0 ? liveWaveScore(doc) : null;
  return { completed: doc.waves, live };
}
