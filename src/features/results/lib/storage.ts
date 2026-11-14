import type { RunRecord } from "../../../shared/types";
import type { SaveStatus } from "../../../shared/types";
import { exportArchive, parseRecord, trimRecords } from "../model/library";

const STORAGE_KEY = "neon-survivor.library.v1";
const LEGACY_KEY = "neon-survivor.records.v1";

export interface LibrarySnapshot {
  records: RunRecord[];
  benchmarkId: string | null;
}

interface StoredLibrary {
  version: 1;
  records: unknown[];
  benchmarkId: string | null;
}

/**
 * Reads the library. Corrupt storage is treated as empty rather than partially
 * resurrected, and legacy 20-match archives are migrated without inventing
 * per-wave telemetry they never had.
 */
export function loadLibrary(): LibrarySnapshot {
  try {
    if (typeof window === "undefined") return { records: [], benchmarkId: null };
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredLibrary>;
      if (parsed && Array.isArray(parsed.records)) {
        const records = parsed.records
          .map(parseRecord)
          .filter((r): r is RunRecord => r !== null);
        const benchmarkId =
          typeof parsed.benchmarkId === "string" &&
          records.some((r) => r.id === parsed.benchmarkId)
            ? parsed.benchmarkId
            : null;
        return { records: trimRecords(records, benchmarkId), benchmarkId };
      }
      return { records: [], benchmarkId: null };
    }
    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_KEY) || "[]");
    if (!Array.isArray(legacy)) return { records: [], benchmarkId: null };
    const records = legacy
      .map(parseRecord)
      .filter((r): r is RunRecord => r !== null);
    const snapshot = {
      records: trimRecords(records),
      benchmarkId: null as string | null,
    };
    // Best-effort migration; a full store simply keeps serving the legacy key.
    saveLibrary(snapshot.records, null);
    return snapshot;
  } catch {
    return { records: [], benchmarkId: null };
  }
}

export type { SaveStatus };

/**
 * Persists the library. Unlike the old silent save, quota failures are reported
 * with the exact payload so the UI can offer a download instead.
 */
export function saveLibrary(
  records: RunRecord[],
  benchmarkId: string | null,
): SaveStatus {
  const limited = trimRecords(records, benchmarkId);
  const payload = JSON.stringify({
    version: 1,
    records: limited,
    benchmarkId,
  } satisfies StoredLibrary);
  if (typeof window === "undefined")
    return { ok: false, reason: "blocked", pending: payload };
  try {
    window.localStorage.setItem(STORAGE_KEY, payload);
    return { ok: true };
  } catch (error) {
    const quota =
      (error instanceof DOMException &&
        (error.name === "QuotaExceededError" ||
          error.name === "NS_ERROR_DOM_QUOTA_REACHED")) ||
      (error instanceof Error && /quota|storage/i.test(error.name));
    return {
      ok: false,
      reason: quota ? "quota" : "blocked",
      // The pending payload is a valid archive file, so it can be re-imported later.
      pending: exportArchive(limited, benchmarkId),
    };
  }
}

/** Offers pending content as a file when local space is exhausted. */
export function downloadText(text: string, filename: string): boolean {
  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
