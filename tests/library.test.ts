import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../src/shared/createRun";
import type { RunRecord, WaveRecord } from "../src/shared/types";
import {
  exportArchive,
  mergeRecords,
  parseArchive,
  parseRecord,
} from "../src/features/results/model/library";
import { importArchive } from "../src/features/results/model/archive";
import { selectBenchmark, pinBenchmark } from "../src/features/results/model/selection";
import { compareFinal, compareLiveWave } from "../src/features/results/model/compare";
import {
  finalizeWaves,
  liveWaveScore,
  syncWaveTelemetry,
} from "../src/features/results/model/telemetry";
import { stepResults } from "../src/features/results/model/stepResults";
import { stepWaves } from "../src/features/waves";

const waves = (entries: [number, number, number][]): WaveRecord[] =>
  entries.map(([wave, damage, kills]) => ({ wave, damage, kills }));

const record = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: "run-1",
  playedAt: 1000,
  duration: 120,
  wave: 4,
  level: 6,
  kills: 30,
  damage: 900,
  weapons: ["pulse:2"],
  victory: false,
  ...over,
});

test("per-wave telemetry records effective damage and kills, not running totals", () => {
  const d = createRun();
  d.phase = "playing";
  stepWaves(d, 1 / 60); // wave 1 begins and snapshots counters
  d.stats.damage = 50;
  d.stats.kills = 2;
  d.wave = 2; // wave 1 finished
  syncWaveTelemetry(d);
  d.stats.damage = 120;
  d.stats.kills = 5;
  d.wave = 3;
  syncWaveTelemetry(d);
  assert.deepEqual(d.waves, waves([[1, 50, 2], [2, 70, 3]]));
  assert.deepEqual(liveWaveScore(d), { wave: 3, damage: 0, kills: 0 });
});

test("finalizeWaves freezes the partial wave exactly once", () => {
  const d = createRun();
  d.phase = "playing";
  stepWaves(d, 1 / 60);
  d.stats.damage = 40;
  d.stats.kills = 1;
  d.wave = 2;
  syncWaveTelemetry(d);
  d.stats.damage = 60;
  finalizeWaves(d);
  finalizeWaves(d);
  assert.deepEqual(d.waves, waves([[1, 40, 1], [2, 20, 0]]));
});

test("merging by stable action id skips duplicates and keeps original on conflict", () => {
  const original = record();
  const dup = mergeRecords([original], [record()]);
  assert.equal(dup.records.length, 1);
  assert.equal(dup.added, 0);
  assert.equal(dup.duplicates, 1);
  assert.equal(dup.conflicts.length, 0);

  const conflict = mergeRecords([original], [record({ damage: 999, playedAt: 5000 })]);
  assert.equal(conflict.records.length, 1);
  assert.equal(conflict.records[0].damage, 900);
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(conflict.conflicts[0].damage, 999);
});

test("near-identical records with different identities both survive", () => {
  const a = record({ id: "run-a", playedAt: 1000 });
  const b = record({ id: "run-b", playedAt: 1000 });
  const merged = mergeRecords([a], [b]);
  assert.equal(merged.added, 1);
  assert.equal(merged.records.length, 2);
});

test("corrupt archive is rejected whole: no records, no selection, no pinned change", () => {
  const doc = createRun(204004, [record()], undefined, "run-1");
  pinBenchmark(doc);
  const pinned = doc.benchmark;
  const before = JSON.stringify(doc.records);
  const bad = JSON.stringify({
    format: "void-signal/run-archive",
    version: 1,
    exportedAt: 1,
    records: [record({ id: "run-2" }), { id: "broken" }],
    benchmarkId: null,
  });
  const report = importArchive(doc, bad);
  assert.equal(report.ok, false);
  assert.equal(JSON.stringify(doc.records), before);
  assert.equal(doc.benchmark, pinned);
  assert.equal(doc.selectedBenchmarkId, "run-1");
  assert.equal(importArchive(doc, "{not json").ok, false);
  assert.equal(doc.records.length, 1);
});

test("repeated import does not double count and full file round-trips", () => {
  const doc = createRun();
  const file = exportArchive([record({ id: "run-7" })], null);
  const first = importArchive(doc, file);
  assert.equal(first.added, 1);
  const second = importArchive(doc, file);
  assert.equal(second.added, 0);
  assert.equal(second.duplicates, 1);
  assert.equal(doc.records.length, 1);
});

test("import during battle never replaces the benchmark locked to this run", () => {
  const doc = createRun(204004, [record()], undefined, "run-1");
  pinBenchmark(doc);
  doc.phase = "playing";
  const other = record({ id: "run-2", damage: 5000 });
  const file = exportArchive([other], "run-2");
  const report = importArchive(doc, file);
  assert.equal(report.ok, true);
  assert.equal(report.adoptedBenchmark, false);
  assert.equal(doc.benchmark?.record.id, "run-1");
  assert.equal(doc.selectedBenchmarkId, "run-1");
  doc.phase = "ready";
  pinBenchmark(doc);
  assert.equal(doc.benchmark?.record.id, "run-1");
});

test("live wave comparison uses the matching benchmark wave", () => {
  const doc = createRun(
    204004,
    [record({ waves: waves([[1, 100, 3], [2, 200, 5]]) })],
    undefined,
    "run-1",
  );
  pinBenchmark(doc);
  doc.wave = 2;
  doc.waveStart = { wave: 2, damage: 100, kills: 3 };
  doc.stats.damage = 260;
  doc.stats.kills = 6;
  const live = compareLiveWave(doc);
  assert.equal(live?.wave, 2);
  assert.deepEqual(live?.current, { wave: 2, damage: 160, kills: 3 });
  assert.deepEqual(live?.baseline, { wave: 2, damage: 200, kills: 5 });
  assert.deepEqual(live?.delta, { damage: -40, kills: -2 });
});

test("old archives without wave data compare only final totals", () => {
  const doc = createRun(204004, [record({ waves: undefined })], undefined, "run-1");
  pinBenchmark(doc);
  assert.equal(doc.benchmark?.mode, "total");
  doc.waveStart = { wave: 1, damage: 0, kills: 0 };
  doc.stats.damage = 1200;
  doc.stats.kills = 40;
  doc.wave = 1;
  const live = compareLiveWave(doc);
  assert.equal(live?.mode, "total");
  assert.equal(live?.delta, null);
  const final = compareFinal(doc);
  assert.deepEqual(final?.total, { damage: 300, kills: 10 });
  assert.deepEqual(final?.perWave, []);
});

test("selecting a benchmark only locks at deployment", () => {
  const doc = createRun(204004, [record({ id: "run-1" }), record({ id: "run-2" })]);
  assert.equal(selectBenchmark(doc, "run-2"), true);
  assert.equal(doc.selectedBenchmarkId, "run-2");
  assert.equal(doc.benchmark, null);
  pinBenchmark(doc);
  assert.equal(doc.benchmark?.record.id, "run-2");
  assert.equal(selectBenchmark(doc, "missing"), false);
  assert.equal(doc.selectedBenchmarkId, "run-2");
});

test("finished runs save per-wave damage under a stable id", () => {
  const d = createRun();
  d.phase = "playing";
  stepWaves(d, 1 / 60);
  d.stats.damage = 80;
  d.stats.kills = 3;
  d.wave = 2;
  d.player.hp = 0;
  stepResults(d, {
    kills: [],
    damage: 0,
    taken: 0,
    shots: 0,
    collected: 0,
  });
  const saved = d.records[0];
  assert.equal(d.records.length, 1);
  assert.match(saved.id, /^run-204004-/);
  assert.deepEqual(saved.waves, waves([[1, 80, 3]]));
  stepResults(d, { kills: [], damage: 0, taken: 0, shots: 0, collected: 0 });
  assert.equal(d.records.length, 1);
});

test("parser rejects invalid wave entries and unsupported versions", () => {
  assert.equal(
    parseRecord({ ...record(), waves: [{ wave: 1, damage: -1, kills: 0 }] }),
    null,
  );
  assert.equal(
    parseRecord({ ...record(), waves: [{ wave: 1, damage: 1, kills: 0 }, { wave: 1, damage: 2, kills: 0 }] }),
    null,
  );
  const wrongVersion = JSON.stringify({
    format: "void-signal/run-archive",
    version: 2,
    records: [record()],
    benchmarkId: null,
  });
  assert.equal(parseArchive(wrongVersion).ok, false);
});

test("quota failure returns a downloadable archive of the pending library", async () => {
  const realWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    },
  };
  try {
    const { saveLibrary } = await import("../src/features/results/lib/storage");
    const status = saveLibrary([record({ id: "run-q" })], "run-q");
    assert.equal(status.ok, false);
    if (status.ok) return;
    assert.equal(status.reason, "quota");
    const parsed = parseArchive(status.pending);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.file.records.length, 1);
      assert.equal(parsed.file.records[0].id, "run-q");
      assert.equal(parsed.file.benchmarkId, "run-q");
    }
  } finally {
    (globalThis as { window?: unknown }).window = realWindow;
  }
});

test("library cap never evicts the selected benchmark", async () => {
  const { trimRecords, LIBRARY_LIMIT } = await import("../src/features/results/model/library");
  const records = Array.from({ length: LIBRARY_LIMIT + 5 }, (_, i) =>
    record({ id: `run-${i}`, playedAt: i + 1 }),
  );
  const oldestSelected = trimRecords(records, "run-0");
  assert.equal(oldestSelected.length, LIBRARY_LIMIT);
  assert.ok(oldestSelected.some((r) => r.id === "run-0"));
  const unselected = trimRecords(records, null);
  assert.equal(unselected.length, LIBRARY_LIMIT);
  assert.ok(!unselected.some((r) => r.id === "run-0"));
});

test("an idle library adopts the archive benchmark; a paused battle does not", () => {
  const idle = createRun();
  idle.phase = "ready";
  const file = exportArchive([record({ id: "run-9" })], "run-9");
  const adopted = importArchive(idle, file);
  assert.equal(adopted.adoptedBenchmark, true);
  assert.equal(idle.selectedBenchmarkId, "run-9");

  const paused = createRun();
  paused.phase = "paused";
  const report = importArchive(paused, exportArchive([record({ id: "run-8" })], "run-8"));
  assert.equal(report.adoptedBenchmark, false);
  assert.equal(paused.selectedBenchmarkId, null);
});

test("re-importing the same archive with different key order is a duplicate, not a conflict", () => {
  const existing = record({ id: "run-k" });
  const reordered = {
    waves: undefined,
    victory: existing.victory,
    weapons: existing.weapons,
    damage: existing.damage,
    kills: existing.kills,
    level: existing.level,
    wave: existing.wave,
    duration: existing.duration,
    playedAt: existing.playedAt,
    id: existing.id,
  };
  const merged = mergeRecords([existing], [reordered as RunRecord]);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.conflicts.length, 0);
});
