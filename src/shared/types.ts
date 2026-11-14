export type Vec = { x: number; y: number };
export type Phase = "ready" | "playing" | "paused" | "upgrade" | "ended";
export type WeaponId = "pulse" | "orbit" | "nova";
export interface Player extends Vec {
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  invincible: number;
}
export interface Enemy extends Vec {
  id: number;
  kind: "chaser" | "shooter" | "elite";
  hp: number;
  maxHp: number;
  radius: number;
  cooldown: number;
}
export interface Bullet extends Vec {
  id: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  owner: "player" | "enemy";
  weapon: WeaponId | "enemy";
  pierce: number;
  hit: number[];
}
export interface Drop extends Vec {
  id: number;
  kind: "xp" | "heal" | "magnet";
  value: number;
  life: number;
}
export interface Weapon {
  id: WeaponId;
  level: number;
  cooldown: number;
}
export interface Upgrade {
  id: string;
  name: string;
  description: string;
  category: string;
  max: number;
}
export interface RunStats {
  kills: number;
  damage: number;
  taken: number;
  collected: number;
  shots: number;
  byWeapon: Record<WeaponId, number>;
}
/** Effective damage/kills of one wave, independent of earlier waves. */
export interface WaveRecord {
  wave: number;
  damage: number;
  kills: number;
}
/** Counter snapshot taken when a wave begins. */
export interface WaveStart {
  wave: number;
  damage: number;
  kills: number;
}
export interface RunRecord {
  /** Stable identity of the action. Imports merge on this, never on timestamps. */
  id: string;
  playedAt?: number;
  duration: number;
  wave: number;
  level: number;
  kills: number;
  damage: number;
  weapons: string[];
  victory: boolean;
  /** Missing on archives written before per-wave telemetry existed. */
  waves?: WaveRecord[];
}
export type BenchmarkMode = "waves" | "total";
export interface BenchmarkState {
  record: RunRecord;
  /** "waves" when the archive carries per-wave telemetry, "total" otherwise. */
  mode: BenchmarkMode;
  lockedAt: number;
}
export type SaveStatus =
  | { ok: true }
  | { ok: false; reason: "quota" | "blocked"; pending: string };
export interface GameDoc {
  version: 1;
  /** Identity of this action; makes any repeated save a duplicate, not a new entry. */
  runId: string;
  seed: number;
  initialSeed: number;
  nextId: number;
  phase: Phase;
  time: number;
  player: Player;
  enemies: Enemy[];
  bullets: Bullet[];
  drops: Drop[];
  weapons: Weapon[];
  upgrades: Record<string, number>;
  choices: string[];
  xp: number;
  level: number;
  pendingLevels: number;
  wave: number;
  waveTime: number;
  /** Counters when the current wave began, so per-wave values exclude earlier waves. */
  waveStart: WaveStart;
  spawnBudget: number;
  stats: RunStats;
  /** Completed waves of this run, filled as each wave ends. */
  waves: WaveRecord[];
  /** Benchmark pinned when this run started; imports never swap it mid-run. */
  benchmark: BenchmarkState | null;
  /** Library selection, persisted across sessions; applied to the next run at start. */
  selectedBenchmarkId: string | null;
  /** Last persistence attempt, surfaced so a full store can offer a download. */
  saveState: SaveStatus | null;
  records: RunRecord[];
  notice: string;
  victory: boolean;
}
export interface Input {
  x: number;
  y: number;
  aim: Vec;
  firing: boolean;
}
export interface KillEvent {
  enemy: Enemy;
  weapon: WeaponId;
}
export interface FrameEvents {
  weaponDamage?: Partial<Record<WeaponId, number>>;
  kills: KillEvent[];
  damage: number;
  taken: number;
  shots: number;
  collected: number;
}
export const WIDTH = 1000;
export const HEIGHT = 650;
