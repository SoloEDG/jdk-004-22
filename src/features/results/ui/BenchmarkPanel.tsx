import type { GameDoc } from "../../../shared/types";
import { compareLiveWave } from "../model/compare";
import { describeBenchmark } from "../model/compare";
import { formatDelta } from "../model/archive";

export function BenchmarkPanel({ doc }: { doc: GameDoc }) {
  const live = compareLiveWave(doc);
  const benchmark = doc.benchmark;
  return (
    <section className="panel benchmark-panel">
      <div className="section-caption">
        <span>基准对比</span>
        <span className={`badge ${benchmark ? "" : "muted"}`}>
          {benchmark ? (benchmark.mode === "waves" ? "逐波" : "汇总") : "未锁定"}
        </span>
      </div>
      {!benchmark ? (
        <p className="tiny">在行动档案中选择一局基准，部署后即可实时对比本波成绩。</p>
      ) : (
        <>
          <p className="benchmark-source">{describeBenchmark(benchmark)}</p>
          {live ? (
            <div className="live-compare">
              <div className="live-wave">
                第 <b>{live.wave}</b> 波 · 本波进行中
              </div>
              <div className="stat-row">
                <span>本波伤害</span>
                <strong className="mono">
                  {Math.round(live.current?.damage ?? 0)}
                  {live.delta && (
                    <em className={live.delta.damage >= 0 ? "up" : "down"}>
                      {formatDelta(live.delta.damage)}
                    </em>
                  )}
                </strong>
              </div>
              <div className="stat-row">
                <span>本波击杀</span>
                <strong className="mono">
                  {live.current?.kills ?? 0}
                  {live.delta && (
                    <em className={live.delta.kills >= 0 ? "up" : "down"}>
                      {formatDelta(live.delta.kills)}
                    </em>
                  )}
                </strong>
              </div>
              {live.mode === "total" ? (
                <p className="tiny">
                  该基准没有逐波数据，将在行动结束后比较总差值。
                </p>
              ) : !live.delta ? (
                <p className="tiny">该基准未记录第 {live.wave} 波成绩。</p>
              ) : null}
            </div>
          ) : (
            <p className="tiny">
              {doc.phase === "ready"
                ? "部署后开始实时对比。"
                : "本局尚未进入战斗波次。"}
            </p>
          )}
        </>
      )}
    </section>
  );
}
