"use client";

import React, { createContext, useCallback, useContext, useRef } from "react";

type Handler = (() => Promise<void>) | null;

type DraftActionsCtx = {
  setSaveDraftHandler: (fn: Handler) => void;
  setSaveReportHandler: (fn: Handler) => void;
  triggerSaveDraft: () => Promise<void>;
  triggerSaveReport: () => Promise<void>;
};

const Ctx = createContext<DraftActionsCtx | null>(null);

export function DraftActionsProvider({ children }: { children: React.ReactNode }) {
  const draftHandlerRef = useRef<Handler>(null);
  const reportHandlerRef = useRef<Handler>(null);

  // Hard mutex: verhindert doppeltes gleichzeitiges Ausführen
  const runningDraftRef = useRef(false);
  const runningReportRef = useRef(false);

  const setSaveDraftHandler = useCallback((fn: Handler) => {
    draftHandlerRef.current = fn; // ✅ überschreibt immer
  }, []);

  const setSaveReportHandler = useCallback((fn: Handler) => {
    reportHandlerRef.current = fn; // ✅ überschreibt immer
  }, []);

  const triggerSaveDraft = useCallback(async () => {
    if (runningDraftRef.current) return;
    runningDraftRef.current = true;
    try {
      await draftHandlerRef.current?.();
    } finally {
      runningDraftRef.current = false;
    }
  }, []);

  const triggerSaveReport = useCallback(async () => {
    if (runningReportRef.current) return;
    runningReportRef.current = true;
    try {
      await reportHandlerRef.current?.();
    } finally {
      runningReportRef.current = false;
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        setSaveDraftHandler,
        setSaveReportHandler,
        triggerSaveDraft,
        triggerSaveReport,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDraftActions() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDraftActions must be used within DraftActionsProvider");
  return v;
}