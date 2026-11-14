import type { RunRecord, WaveRecord } from "../../../shared/types";

export const ARCHIVE_FORMAT = "void-signal/run-archive";
export const ARCHIVE_VERSION = 1;
export const LIBRARY_LIMIT = 200;

export interface ArchiveFile {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_VERSION;
  exportedAt: number;
  records: RunRecord[];
  benchmarkId: string | null;
}

export type ParsedArchive =
  | { ok: true; file: ArchiveFile }
  | { ok: false; error: string };

/** Stable action identity: same run id means same action, regardless of timestamps. */
export function sameRecord(a: RunRecord, b: RunRecord): boolean {
  return a.id === b.id;
}

function normalizeWave(value: unknown): WaveRecord | null {
  if (!value || typeof value !== "object") return null;
  const w = value as WaveRecord;
  if (
    !Number.isFinite(w.wave) ||
    !Number.isFinite(w.damage) ||
    !Number.isFinite(w.kills) ||
    w.wave < 1 ||
    w.damage < 0 ||
    w.kills < 0
  )
    return null;
  return { wave: w.wave, damage: w.damage, kills: w.kills };
}

/** Validates one archive entry. Malformed entries are rejected, never repaired. */
export function parseRecord(value: unknown): RunRecord | null {
  if (!value || typeof value !== "object") return null;
  const r = value as RunRecord;
  if (typeof r.id !== "string" || !r.id.trim()) return null;
  for (const key of ["duration", "wave", "level", "kills", "damage"] as const) {
    if (typeof r[key] !== "number" || !Number.isFinite(r[key]) || r[key] < 0)
      return null;
  }
  if (!Array.isArray(r.weapons) || !r.weapons.every((w) => typeof w === "string"))
    return null;
  if (typeof r.victory !== "boolean") return null;
  if (r.playedAt !== undefined && !Number.isFinite(r.playedAt)) return null;
  let waves: WaveRecord[] | undefined;
  if (r.waves !== undefined) {
    if (!Array.isArray(r.waves) || !r.waves.length) return null;
    waves = [];
    for (const entry of r.waves) {
      const wave = normalizeWave(entry);
      if (!wave) return null;
      waves.push(wave);
    }
    waves.sort((a, b) => a.wave - b.wave);
    const seen = new Set<number>();
    for (const wave of waves) {
      if (seen.has(wave.wave)) return null;
      seen.add(wave.wave);
    }
  }
  return {
    id: r.id,
    playedAt: r.playedAt,
    duration: r.duration,
    wave: r.wave,
    level: r.level,
    kills: r.kills,
    damage: r.damage,
    weapons: [...r.weapons],
    victory: r.victory,
    ...(waves ? { waves } : {}),
  };
}

/**
 * Parses an archive file as a whole. Any corrupt entry rejects the entire
 * batch so half-imported data can never reach the library or the benchmark.
 */
export function parseArchive(text: string): ParsedArchive {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "文件不是有效的 JSON，已整批拒绝。" };
  }
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "档案格式无法识别，已整批拒绝。" };
  const file = raw as Partial<ArchiveFile>;
  if (file.format !== ARCHIVE_FORMAT || file.version !== ARCHIVE_VERSION)
    return { ok: false, error: "档案版本不受支持，已整批拒绝。" };
  if (!Array.isArray(file.records))
    return { ok: false, error: "档案缺少行动记录，已整批拒绝。" };
  if (file.benchmarkId !== null && typeof file.benchmarkId !== "string")
    return { ok: false, error: "档案的基准标记无效，已整批拒绝。" };
  const records: RunRecord[] = [];
  for (const entry of file.records) {
    const record = parseRecord(entry);
    if (!record)
      return { ok: false, error: "档案中存在损坏的行动记录，已整批拒绝。" };
    records.push(record);
  }
  return {
    ok: true,
    file: {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      exportedAt: Number.isFinite(file.exportedAt) ? file.exportedAt! : Date.now(),
      records,
      benchmarkId: typeof file.benchmarkId === "string" ? file.benchmarkId : null,
    },
  };
}

function canonical(record: RunRecord): unknown[] {
  return [
    record.id,
    record.playedAt ?? null,
    record.duration,
    record.wave,
    record.level,
    record.kills,
    record.damage,
    record.weapons,
    record.victory,
    record.waves
      ? record.waves.map((w) => [w.wave, w.damage, w.kills])
      : null,
  ];
}

/** Compares field-by-field so key order or omitted optional fields cannot fake a conflict. */
function sameValue(a: RunRecord, b: RunRecord): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** Identity order: newest playedAt first, then id. Records carry no wall-clock dependence. */
export function sortRecords(records: RunRecord[]): RunRecord[] {
  return [...records].sort(
    (a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0) || a.id.localeCompare(b.id),
  );
}

/** Caps the library while always keeping the benchmark entry, even if it is the oldest. */
export function trimRecords(
  records: RunRecord[],
  keepId: string | null = null,
): RunRecord[] {
  const sorted = sortRecords(records);
  if (sorted.length <= LIBRARY_LIMIT) return sorted;
  if (!keepId || !sorted.some((r) => r.id === keepId))
    return sorted.slice(0, LIBRARY_LIMIT);
  const others = sorted.filter((r) => r.id !== keepId);
  return sortRecords([...others.slice(0, LIBRARY_LIMIT - 1), sorted.find((r) => r.id === keepId)!]);
}

export interface MergeResult {
  records: RunRecord[];
  added: number;
  duplicates: number;
  conflicts: RunRecord[];
}

/**
 * Merges incoming records into the library keyed by stable action id.
 * - duplicate: identical entry -> ignored, never recorded twice.
 * - conflict: same id, different values -> original kept, incoming reported.
 */
export function mergeRecords(
  existing: RunRecord[],
  incoming: RunRecord[],
  keepId: string | null = null,
): MergeResult {
  const records = [...existing];
  const index = new Map(records.map((r, i) => [r.id, i]));
  let added = 0,
    duplicates = 0;
  const conflicts: RunRecord[] = [];
  for (const record of incoming) {
    const at = index.get(record.id);
    if (at === undefined) {
      index.set(record.id, records.length);
      records.push(record);
      added++;
    } else if (sameValue(records[at], record)) duplicates++;
    else conflicts.push(record);
  }
  return { records: trimRecords(records, keepId), added, duplicates, conflicts };
}

export function exportArchive(records: RunRecord[], benchmarkId: string | null): string {
  const file: ArchiveFile = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: Date.now(),
    records: trimRecords(records, benchmarkId),
    benchmarkId,
  };
  return JSON.stringify(file, null, 2);
}
