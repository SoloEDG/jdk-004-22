import { useEffect, useRef, useState } from "react";
import { createRun } from "../shared/createRun";
import type { Input, RunRecord } from "../shared/types";
import { simulate } from "./simulate";
import { chooseUpgrade } from "../features/progression";
import {
  loadLibrary,
  saveLibrary,
  downloadText,
  exportLibrary,
  importArchive,
  pinBenchmark,
  selectBenchmark,
  type ImportReport,
  type LibrarySnapshot,
} from "../features/results";
export function useGame() {
  const library = useRef<LibrarySnapshot>(loadLibrary());
  const game = useRef(
    createRun(
      204004,
      library.current.records,
      undefined,
      library.current.benchmarkId,
    ),
  );
  const input = useRef<Input>({
    x: 0,
    y: 0,
    aim: { x: 500, y: 0 },
    firing: false,
  });
  const keys = useRef(new Set<string>());
  const [, render] = useState(0);
  // Bumping this state re-renders the archive dialog after selections and imports.
  const [, bumpLibrary] = useState(0);
  useEffect(() => {
    let raf = 0,
      last = 0,
      acc = 0,
      paint = 0;
    const tick = (now: number) => {
      const elapsed = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      const d = game.current;
      input.current.x =
        Number(keys.current.has("d") || keys.current.has("arrowright")) -
        Number(keys.current.has("a") || keys.current.has("arrowleft"));
      input.current.y =
        Number(keys.current.has("s") || keys.current.has("arrowdown")) -
        Number(keys.current.has("w") || keys.current.has("arrowup"));
      if (d.phase === "playing") {
        acc += elapsed;
        while (acc >= 1 / 60) {
          simulate(d, input.current, 1 / 60);
          acc -= 1 / 60;
          if (d.phase !== "playing") {
            acc = 0;
            break;
          }
        }
      } else acc = 0;
      if (now - paint > 32) {
        render((n) => n + 1);
        paint = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const pause = () => {
      if (game.current.phase === "playing") game.current.phase = "paused";
      keys.current.clear();
      input.current.firing = false;
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k))
        e.preventDefault();
      keys.current.add(k);
      if ((k === "escape" || k === "p") && !e.repeat) {
        const d = game.current;
        if (d.phase === "playing") d.phase = "paused";
        else if (d.phase === "paused") d.phase = "playing";
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const hidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const syncLibrary = () => {
    library.current = {
      records: game.current.records,
      benchmarkId: game.current.selectedBenchmarkId,
    };
    bumpLibrary((n) => n + 1);
  };
  return {
    game,
    input,
    start: () => {
      pinBenchmark(game.current);
      game.current.phase = "playing";
    },
    toggle: () => {
      const d = game.current;
      if (d.phase === "playing") d.phase = "paused";
      else if (d.phase === "paused") d.phase = "playing";
    },
    choose: (id: string) => chooseUpgrade(game.current, id),
    select: (id: string | null) => {
      selectBenchmark(game.current, id);
      syncLibrary();
    },
    importFile: (text: string): ImportReport => {
      const report = importArchive(game.current, text);
      syncLibrary();
      return report;
    },
    download: (filename: string) => {
      const pending = game.current.saveState;
      const text =
        pending && !pending.ok ? pending.pending : exportLibrary(game.current);
      return downloadText(text, filename);
    },
    retrySave: () => {
      game.current.saveState = saveLibrary(
        game.current.records,
        game.current.selectedBenchmarkId,
      );
      render((n) => n + 1);
    },
    restart: () => {
      saveLibrary(game.current.records, game.current.selectedBenchmarkId);
      game.current = createRun(
        204004,
        game.current.records,
        undefined,
        game.current.selectedBenchmarkId,
      );
      pinBenchmark(game.current);
      keys.current.clear();
      game.current.phase = "playing";
    },
  };
}
export type { LibrarySnapshot, RunRecord };
