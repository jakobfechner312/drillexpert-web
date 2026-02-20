"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";

type Handler = (() => Promise<void> | void) | null;

type DraftActionsCtx = {
  setSaveDraftHandler: (fn: Handler) => void;
  setSaveReportHandler: (fn: Handler) => void;
  setUndoHandler: (fn: Handler) => void;
  setUndoCount: (count: number) => void;
  triggerSaveDraft: () => Promise<void>;
  triggerSaveReport: () => Promise<void>;
  triggerUndo: () => Promise<void>;
  undoCount: number;
};

const Ctx = createContext<DraftActionsCtx | null>(null);

export function DraftActionsProvider({ children }: { children: React.ReactNode }) {
  const draftHandlerRef = useRef<Handler>(null);
  const reportHandlerRef = useRef<Handler>(null);
  const undoHandlerRef = useRef<Handler>(null);
  const [undoCount, setUndoCount] = useState(0);

  // Hard mutex: verhindert doppeltes gleichzeitiges Ausführen
  const runningDraftRef = useRef(false);
  const runningReportRef = useRef(false);
  const runningUndoRef = useRef(false);

  const setSaveDraftHandler = useCallback((fn: Handler) => {
    draftHandlerRef.current = fn; // ✅ überschreibt immer
  }, []);

  const setSaveReportHandler = useCallback((fn: Handler) => {
    reportHandlerRef.current = fn; // ✅ überschreibt immer
  }, []);

  const setUndoHandler = useCallback((fn: Handler) => {
    undoHandlerRef.current = fn;
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

  const triggerUndo = useCallback(async () => {
    if (runningUndoRef.current) return;
    runningUndoRef.current = true;
    try {
      await undoHandlerRef.current?.();
    } finally {
      runningUndoRef.current = false;
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        setSaveDraftHandler,
        setSaveReportHandler,
        setUndoHandler,
        setUndoCount,
        triggerSaveDraft,
        triggerSaveReport,
        triggerUndo,
        undoCount,
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
