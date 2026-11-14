import type { RunRecord } from "../../../shared/types";
import { formatTime } from "../../../shared/math";

export function WaveBars({ record }: { record: RunRecord }) {
  if (!record.waves?.length)
    return <span className="wave-bars empty">无逐波遥测 · 仅汇总比较</span>;
  const peak = Math.max(1, ...record.waves.map((w) => w.damage));
  return (
    <span className="wave-bars" title="每波有效伤害 / 击杀">
      {record.waves.map((w) => (
        <i key={w.wave}>
          <b style={{ height: `${Math.max(6, (w.damage / peak) * 100)}%` }} />
          <small>{w.kills}</small>
        </i>
      ))}
    </span>
  );
}

export function RecordSummary({ record }: { record: RunRecord }) {
  return (
    <span className="record-summary">
      <span>{formatTime(record.duration)}</span>
      <span>波次 {record.wave}</span>
      <span>{record.kills} 击杀</span>
      <span>{Math.round(record.damage).toLocaleString()} DMG</span>
    </span>
  );
}
