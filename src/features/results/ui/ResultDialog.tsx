import type { GameDoc } from "../../../shared/types";
import { formatTime } from "../../../shared/math";
import { compareFinal } from "../model/compare";
import { formatDelta } from "../model/archive";

export function ResultDialog({
  doc,
  restart,
  downloadPending,
}: {
  doc: GameDoc;
  restart: () => void;
  downloadPending: () => boolean;
}) {
  const comparison = compareFinal(doc);
  return (
    <div className="overlay">
      <div className="result-dialog">
        <div className="eyebrow">
          MISSION {doc.victory ? "COMPLETE" : "ENDED"}
        </div>
        <h2>{doc.victory ? "信号已送达。" : "信号暂时中断。"}</h2>
        <p>每一次坠落，都是下一次进化的起点。</p>
        <div className="result-grid">
          <div>
            <strong>{formatTime(doc.time)}</strong>
            <small>生存时间</small>
          </div>
          <div>
            <strong>{doc.stats.kills}</strong>
            <small>击败敌人</small>
          </div>
          <div>
            <strong>{doc.level}</strong>
            <small>最终等级</small>
          </div>
        </div>
        <div className="damage-breakdown">
          {Object.entries(doc.stats.byWeapon).map(([key, value]) => (
            <div key={key}>
              <span>{key.toUpperCase()}</span>
              <span>{Math.round(value)} DMG</span>
            </div>
          ))}
        </div>
        {comparison && (
          <div className="final-comparison">
            <div className="section-caption">
              <span>对比基准 · {comparison.mode === "waves" ? "逐波汇总" : "仅最终汇总"}</span>
              <span className="mono">总差值</span>
            </div>
            <div className="final-totals">
              <div>
                <strong>{Math.round(comparison.current.damage)}</strong>
                <small>本局伤害</small>
                <em className={comparison.total.damage >= 0 ? "up" : "down"}>
                  {formatDelta(comparison.total.damage)}
                </em>
              </div>
              <div>
                <strong>{comparison.current.kills}</strong>
                <small>本局击杀</small>
                <em className={comparison.total.kills >= 0 ? "up" : "down"}>
                  {formatDelta(comparison.total.kills)}
                </em>
              </div>
              <div>
                <strong>{Math.round(comparison.baseline.damage)}</strong>
                <small>基准伤害</small>
              </div>
              <div>
                <strong>{comparison.baseline.kills}</strong>
                <small>基准击杀</small>
              </div>
            </div>
            {comparison.mode === "total" ? (
              <p className="tiny">该基准没有逐波数据，仅比较最终汇总。</p>
            ) : (
              <div className="per-wave">
                {comparison.perWave.map((wave) => (
                  <div key={wave.wave} className="per-wave-row">
                    <span>W{wave.wave.toString().padStart(2, "0")}</span>
                    <span className="mono">{Math.round(wave.current?.damage ?? 0)}</span>
                    <span className="mono muted">
                      {Math.round(wave.baseline?.damage ?? 0)}
                    </span>
                    <em
                      className={
                        (wave.delta?.damage ?? 0) >= 0 ? "up" : "down"
                      }
                    >
                      {formatDelta(wave.delta?.damage ?? 0)}
                    </em>
                  </div>
                ))}
                {comparison.unplayedWaves.length > 0 && (
                  <p className="tiny">
                    本局未到达的基准波次：
                    {comparison.unplayedWaves.map((w) => `W${w}`).join("、")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {doc.saveState && !doc.saveState.ok && (
          <p className="import-report warn" role="status">
            本地空间不足，本局战绩尚未写入浏览器。
            <button className="link" onClick={downloadPending}>
              下载待保存内容
            </button>
          </p>
        )}
        <button className="primary" onClick={restart}>
          重新接入 ↗
        </button>
        <p className="tiny">本地已记录 {doc.records.length} 次行动</p>
      </div>
    </div>
  );
}
