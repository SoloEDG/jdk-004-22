import type { GameDoc, FrameEvents, RunRecord } from "../../../shared/types";
import { wavesForRecord } from "./telemetry";
export function applyEvents(doc: GameDoc, events: FrameEvents): void {
  doc.stats.kills += events.kills.length;
  doc.stats.damage += events.damage;
  doc.stats.taken += events.taken;
  doc.stats.shots += events.shots;
  doc.stats.collected += events.collected;
  for (const weapon of ["pulse", "orbit", "nova"] as const)
    doc.stats.byWeapon[weapon] += events.weaponDamage?.[weapon] || 0;
}
export function makeRecord(
  doc: GameDoc,
  now = Date.now(),
  waves = wavesForRecord(doc),
): RunRecord {
  return {
    id: `run-${doc.initialSeed}-${doc.runId}`,
    playedAt: now,
    duration: doc.time,
    wave: doc.wave,
    level: doc.level,
    kills: doc.stats.kills,
    damage: Math.round(doc.stats.damage),
    weapons: doc.weapons.map((w) => `${w.id}:${w.level}`),
    victory: doc.victory,
    ...(waves ? { waves } : {}),
  };
}
