"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

const EXCEL_BETA_USERS_CLIENT = new Set(
  (process.env.NEXT_PUBLIC_EXCEL_BETA_USERS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
);

const canUseExcelBetaClient = (email: string | null | undefined) => {
  const normalized = String(email ?? "").trim().toLowerCase();
  return Boolean(normalized) && EXCEL_BETA_USERS_CLIENT.has(normalized);
};

export default function ExcelIndexPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
      setAuthLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl border border-base-border bg-white p-6 text-sm text-base-muted">
          Lade Excel-Bereich...
        </div>
      </div>
    );
  }

  if (!canUseExcelBetaClient(email)) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Kein Zugriff auf die Excel-Beta.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
          Excel-Beta
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Meine Excel</h1>
        <p className="mt-2 text-sm text-slate-600">
          Wähle das Protokoll. Beide Bereiche sind technisch getrennt und können unabhängig weiterentwickelt werden.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link
          href="/excel/pumpversuch"
          className="group rounded-2xl border border-base-border bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Pumpversuch</div>
              <div className="text-xs text-slate-500">Eigenes Formular / eigene Export-Route</div>
            </div>
          </div>
        </Link>

        <Link
          href="/excel/klarspuelprotokoll"
          className="group rounded-2xl border border-base-border bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
              <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Klarspülprotokoll</div>
              <div className="text-xs text-slate-500">Aktuell Kopie, jetzt separat anpassbar</div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
