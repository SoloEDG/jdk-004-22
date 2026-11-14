import type { GameDoc, FrameEvents } from "../../../shared/types";
import { applyEvents, makeRecord } from "./ledger";
import { finalizeWaves, syncWaveTelemetry } from "./telemetry";
import { mergeRecords } from "./library";
import { saveLibrary, type SaveStatus } from "../lib/storage";
/** Result of finishing a run; the caller decides how to surface persistence failures. */
export interface StepOutcome {
  finished: boolean;
  save: SaveStatus | null;
}
export function stepResults(doc: GameDoc, events: FrameEvents): StepOutcome {
  if (doc.phase === "ended") return { finished: false, save: null };
  // Commit the wave that just ended before this frame's events land in the next one.
  syncWaveTelemetry(doc);
  applyEvents(doc, events);
  if (doc.player.hp > 0 && !doc.victory) return { finished: false, save: null };
  // End the run before persistence, making repeated animation frames idempotent.
  finalizeWaves(doc);
  doc.phase = "ended";
  doc.choices = [];
  doc.notice = doc.victory ? "撤离成功 · 信号保全" : "信号中断 · 再次连接";
  const record = makeRecord(doc);
  // Saved by stable action id: finishing the same action twice stays one entry.
  doc.records = mergeRecords(doc.records, [record], doc.selectedBenchmarkId).records;
  doc.saveState = saveLibrary(doc.records, doc.selectedBenchmarkId);
  return { finished: true, save: doc.saveState };
}
