"use client";

import { createContext, useContext, useMemo, useRef } from "react";

type SaveFn = () => Promise<void> | void;

type DraftActionsCtx = {
  setSaveDraftHandler: (fn: SaveFn | null) => void;
  triggerSaveDraft: () => Promise<void>;

  // ✅ NEU: final report save
  setSaveReportHandler: (fn: SaveFn | null) => void;
  triggerSaveReport: () => Promise<void>;
};

const Ctx = createContext<DraftActionsCtx | null>(null);

export function DraftActionsProvider({ children }: { children: React.ReactNode }) {
  const draftRef = useRef<SaveFn | null>(null);
  const reportRef = useRef<SaveFn | null>(null);

  const value = useMemo<DraftActionsCtx>(() => {
    return {
      setSaveDraftHandler(fn) {
        draftRef.current = fn;
      },
      async triggerSaveDraft() {
        const fn = draftRef.current;
        console.log("[DraftActions] triggerSaveDraft – handler?", !!fn);
        if (!fn) return;
        await fn();
      },

      setSaveReportHandler(fn) {
        reportRef.current = fn;
      },
      async triggerSaveReport() {
        const fn = reportRef.current;
        console.log("[DraftActions] triggerSaveReport – handler?", !!fn);
        if (!fn) return;
        await fn();
      },
    };
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDraftActions() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDraftActions must be used inside DraftActionsProvider");
  return v;
}