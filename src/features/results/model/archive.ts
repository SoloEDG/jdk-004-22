import type { GameDoc, RunRecord } from "../../../shared/types";
import { exportArchive, mergeRecords, parseArchive } from "./library";
import { saveLibrary, type SaveStatus } from "../lib/storage";

export interface ImportReport {
  ok: boolean;
  error?: string;
  added: number;
  duplicates: number;
  /** Entries whose id already existed with different values; the original was kept. */
  conflicts: RunRecord[];
  /** True when the archive's own benchmark filled an empty, not-yet-deployed selection. */
  adoptedBenchmark: boolean;
  save: SaveStatus | null;
}

const EMPTY_REPORT: Omit<ImportReport, "ok" | "error"> = {
  added: 0,
  duplicates: 0,
  conflicts: [],
  adoptedBenchmark: false,
  save: null,
};

/**
 * Imports an archive as one atomic batch.
 * - Corrupt files change nothing: no records, no selection, no benchmark.
 * - Duplicates merge by stable action id, so re-importing never double-counts.
 * - Conflicts keep the local original and are reported to the player.
 * - The benchmark pinned to the running action is never touched mid-battle.
 */
export function importArchive(doc: GameDoc, text: string): ImportReport {
  const parsed = parseArchive(text);
  if (!parsed.ok) return { ok: false, error: parsed.error, ...EMPTY_REPORT };
  const merged = mergeRecords(
    doc.records,
    parsed.file.records,
    doc.selectedBenchmarkId,
  );
  // Only fill an empty selection while no action is in flight. An in-fight
  // import can therefore never quietly swap the benchmark locked to this run.
  const notMidRun = doc.phase === "ready" || doc.phase === "ended";
  const adopt =
    notMidRun &&
    doc.selectedBenchmarkId === null &&
    doc.benchmark === null &&
    parsed.file.benchmarkId !== null &&
    merged.records.some((r) => r.id === parsed.file.benchmarkId);
  doc.records = merged.records;
  if (adopt) doc.selectedBenchmarkId = parsed.file.benchmarkId;
  // A selection whose action fell out of the capped library cannot stay selected.
  if (
    doc.selectedBenchmarkId !== null &&
    !doc.records.some((r) => r.id === doc.selectedBenchmarkId)
  )
    doc.selectedBenchmarkId = null;
  doc.saveState = saveLibrary(doc.records, doc.selectedBenchmarkId);
  return {
    ok: true,
    added: merged.added,
    duplicates: merged.duplicates,
    conflicts: merged.conflicts,
    adoptedBenchmark: adopt,
    save: doc.saveState,
  };
}

export function exportLibrary(doc: GameDoc): string {
  return exportArchive(doc.records, doc.selectedBenchmarkId);
}

/** Signed comparison value for the telemetry UI. */
export function formatDelta(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${Math.abs(Math.round(value))}`;
}
