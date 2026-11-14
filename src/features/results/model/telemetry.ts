import type { GameDoc, WaveRecord, WaveStart } from "../../../shared/types";

/** Snapshot of one wave's counters at the moment that wave began. */
export function resetWaveStart(doc: GameDoc): void {
  doc.waveStart = {
    wave: Math.max(0, doc.wave),
    damage: doc.stats.damage,
    kills: doc.stats.kills,
  };
}

/**
 * Commits finished waves to doc.waves using counter deltas, so each entry holds
 * only that wave's effective damage and kills rather than a running total.
 */
export function syncWaveTelemetry(doc: GameDoc): void {
  if (doc.waveStart.wave === 0) {
    resetWaveStart(doc);
    return;
  }
  if (doc.wave <= doc.waveStart.wave) return;
  const damage = Math.max(0, doc.stats.damage - doc.waveStart.damage);
  const kills = Math.max(0, doc.stats.kills - doc.waveStart.kills);
  // Frames are far shorter than a wave, so a jump beyond one wave only happens
  // on fast-forward; attribute the delta to the wave that was actually running.
  let first = true;
  for (let wave = doc.waveStart.wave; wave < doc.wave; wave++) {
    const entry: WaveRecord = {
      wave,
      damage: first ? damage : 0,
      kills: first ? kills : 0,
    };
    first = false;
    const at = doc.waves.findIndex((w) => w.wave === wave);
    if (at >= 0) doc.waves[at] = entry;
    else doc.waves.push(entry);
  }
  doc.waves.sort((a, b) => a.wave - b.wave);
  doc.waveStart = {
    wave: doc.wave,
    damage: doc.stats.damage,
    kills: doc.stats.kills,
  } satisfies WaveStart;
}

/** Current wave's effective damage and kills, measured from the wave start. */
export function liveWaveScore(doc: GameDoc): WaveRecord {
  return {
    wave: Math.max(1, doc.wave),
    damage: Math.max(0, doc.stats.damage - doc.waveStart.damage),
    kills: Math.max(0, doc.stats.kills - doc.waveStart.kills),
  };
}

/**
 * Wave entries for a finished record: completed waves plus the partial wave the
 * run ended on. A record without any completed wave keeps the partial one.
 */
export function wavesForRecord(doc: GameDoc): WaveRecord[] | undefined {
  const current = liveWaveScore(doc);
  const partialActive =
    doc.waveStart.wave > 0 && (current.damage > 0 || current.kills > 0);
  if (!doc.waves.length && !partialActive) return undefined;
  const entries = doc.waves.map((w) => ({ ...w }));
  if (partialActive) entries.push({ ...current });
  return entries.sort((a, b) => a.wave - b.wave);
}

/**
 * Freezes telemetry when the run ends: the partial wave the player fell in is
 * appended once, and the counter snapshot is advanced so later frames cannot
 * count that wave again.
 */
export function finalizeWaves(doc: GameDoc): void {
  const entries = wavesForRecord(doc);
  if (entries) doc.waves = entries;
  doc.waveStart = {
    wave: Math.max(0, doc.wave),
    damage: doc.stats.damage,
    kills: doc.stats.kills,
  };
}
