import { useRef, useState } from "react";
import type { GameDoc } from "../../../shared/types";
import { describeBenchmark } from "../model/compare";
import type { ImportReport } from "../model/archive";
import { RecordSummary, WaveBars } from "./RecordSummary";

export interface LibraryActions {
  select: (id: string | null) => void;
  importFile: (text: string) => ImportReport;
  download: (filename: string) => boolean;
  close: () => void;
}

export function HistoryPanel({
  doc,
  actions,
}: {
  doc: GameDoc;
  actions: LibraryActions;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const locked = doc.benchmark !== null && doc.phase !== "ready";

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const result = actions.importFile(text);
    setReport(result);
    setMessage(
      result.ok && result.save && !result.save.ok
        ? "本地空间不足：档案已生效，可下载待保存内容。"
        : null,
    );
  };

  const onExport = () => {
    const ok = actions.download("void-signal-archive.json");
    setMessage(ok ? "档案已开始下载。" : "下载被浏览器阻止。");
  };

  return (
    <div className="overlay">
      <div className="history-dialog library">
        <button className="close" onClick={actions.close}>
          关闭 ✕
        </button>
        <div className="eyebrow">FLIGHT RECORDER</div>
        <h2>行动档案库</h2>
        <p>
          选择一局作为比较基准。基准会在行动部署时锁定，战斗中导入新档案不会替换本局基准。
          {locked && " 本局正在使用已锁定的基准。"}
        </p>
        <div className="library-toolbar">
          <span className="tiny">
            已存档 {doc.records.length} 局 · 基准：{describeBenchmark(doc.benchmark)}
          </span>
          <div className="library-actions">
            <button className="outline small" onClick={() => fileInput.current?.click()}>
              导入档案
            </button>
            <button className="outline small" onClick={onExport}>
              导出档案
            </button>
            {doc.selectedBenchmarkId && (
              <button className="outline small" onClick={() => actions.select(null)}>
                清除基准
              </button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {report && (
          <div className={report.ok ? "import-report" : "import-report error"} role="status">
            <p>
              {report.ok
                ? `导入完成：新增 ${report.added} 局，重复 ${report.duplicates} 局已跳过` +
                  (report.conflicts.length
                    ? `，${report.conflicts.length} 条冲突保留原值`
                    : "") +
                  (report.adoptedBenchmark ? "；已采用档案中的基准" : "")
                : report.error}
            </p>
            {report.conflicts.length > 0 && (
              <ul className="conflict-list">
                {report.conflicts.map((conflict) => (
                  <li key={conflict.id}>
                    {conflict.id}：本地已有一局相同编号但数据不同，已保留本地记录。
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {doc.saveState && !doc.saveState.ok && (
          <p className="import-report warn" role="status">
            本地空间不足，档案未能写入浏览器。
            <button
              className="link"
              onClick={() => actions.download("void-signal-pending.json")}
            >
              下载待保存内容
            </button>
          </p>
        )}
        {message && (
          <p className="import-report warn" role="status">
            {message}
          </p>
        )}
        {!doc.records.length ? (
          <p>尚无行动记录，完成一局后自动保存在此浏览器。</p>
        ) : (
          <div className="library-list">
            {doc.records.map((record) => {
              const selected = doc.selectedBenchmarkId === record.id;
              const pinned = doc.benchmark?.record.id === record.id;
              return (
                <div
                  className={`history-row ${selected ? "selected" : ""}`}
                  key={record.id}
                >
                  <div className="history-main">
                    <span className="history-outcome">
                      {record.victory ? "撤离成功" : "信号中断"}
                      {pinned ? (
                        <em className="pinned">本局基准</em>
                      ) : (
                        selected && <em>下一局基准</em>
                      )}
                    </span>
                    <RecordSummary record={record} />
                    <WaveBars record={record} />
                  </div>
                  <button
                    className="outline small"
                    onClick={() => actions.select(selected ? null : record.id)}
                  >
                    {selected ? "取消" : "设为基准"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
