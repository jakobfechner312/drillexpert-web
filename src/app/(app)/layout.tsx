"use client";

import AppShell from "@/components/AppShell";
import { DraftActionsProvider } from "@/components/DraftActions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <DraftActionsProvider>
      <AppShell>{children}</AppShell>
    </DraftActionsProvider>
  );
}