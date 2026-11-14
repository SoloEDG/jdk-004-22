import type {
  BenchmarkState,
  GameDoc,
  RunRecord,
  WaveRecord,
} from "../../../shared/types";
import { currentWaveScores } from "./selection";

export interface Delta {
  damage: number;
  kills: number;
}

export interface WaveComparison {
  wave: number;
  mode: "waves" | "total";
  current: WaveRecord | null;
  /** Null when the benchmark has no telemetry for this wave. */
  baseline: WaveRecord | null;
  delta: Delta | null;
}

export interface FinalComparison {
  mode: "waves" | "total";
  current: Delta;
  baseline: Delta;
  total: Delta;
  perWave: WaveComparison[];
  /** Benchmark waves the current run never reached. */
  unplayedWaves: number[];
}

function diff(current: Delta, baseline: Delta): Delta {
  return {
    damage: current.damage - baseline.damage,
    kills: current.kills - baseline.kills,
  };
}

/**
 * Live comparison for the wave being fought. Old archives without per-wave
 * telemetry expose no live baseline; their comparison happens at the end.
 */
export function compareLiveWave(doc: GameDoc): WaveComparison | null {
  const benchmark = doc.benchmark;
  if (!benchmark) return null;
  const { live } = currentWaveScores(doc);
  if (!live) return null;
  if (benchmark.mode === "total")
    return {
      wave: live.wave,
      mode: "total",
      current: live,
      baseline: null,
      delta: null,
    };
  const baseline =
    benchmark.record.waves?.find((w) => w.wave === live.wave) ?? null;
  return {
    wave: live.wave,
    mode: "waves",
    current: live,
    baseline,
    delta: baseline ? diff(live, baseline) : null,
  };
}

/** Whole-run totals, plus the wave breakdown when the benchmark has one. */
export function compareFinal(doc: GameDoc): FinalComparison | null {
  const benchmark = doc.benchmark;
  if (!benchmark) return null;
  const current: Delta = {
    damage: Math.round(doc.stats.damage),
    kills: doc.stats.kills,
  };
  const baseline: Delta = {
    damage: benchmark.record.damage,
    kills: benchmark.record.kills,
  };
  const perWave: WaveComparison[] = [];
  const unplayedWaves: number[] = [];
  if (benchmark.mode === "waves") {
    const mine = new Map<number, WaveRecord>();
    for (const wave of doc.waves) mine.set(wave.wave, wave);
    const { live } = currentWaveScores(doc);
    // After finalisation the partial wave already exists in doc.waves; never
    // overwrite it with the now-empty live counter.
    if (live && !mine.has(live.wave)) mine.set(live.wave, live);
    for (const base of benchmark.record.waves ?? []) {
      const own = mine.get(base.wave);
      if (!own) {
        unplayedWaves.push(base.wave);
        continue;
      }
      perWave.push({
        wave: base.wave,
        mode: "waves",
        current: own,
        baseline: base,
        delta: diff(own, base),
      });
    }
  }
  return {
    mode: benchmark.mode,
    current,
    baseline,
    total: diff(current, baseline),
    perWave,
    unplayedWaves,
  };
}

export function describeBenchmark(benchmark: BenchmarkState | null): string {
  if (!benchmark) return "未锁定基准";
  const record: RunRecord = benchmark.record;
  return `${record.victory ? "撤离成功" : "信号中断"} · ${Math.round(record.damage)} DMG · ${record.kills} 击杀`;
}
