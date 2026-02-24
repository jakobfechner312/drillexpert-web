"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { FileClock, FileText, Layers3, MoreHorizontal, Search } from "lucide-react";

type DraftRow = {
  id: string;
  title: string;
  created_at: string;
};

type DraftKind = "all" | "tb" | "rml" | "sv";

export default function DraftsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<DraftKind>("all");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const deleteDraft = async (draftId: string) => {
    if (!confirm("Entwurf wirklich löschen?")) return;
    const { error } = await supabase.from("drafts").delete().eq("id", draftId);
    if (error) {
      setErr("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    setDrafts((prev) => prev.filter((x) => x.id !== draftId));
  };

  const load = async () => {
    setLoading(true);
    setErr(null);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      setErr("Nicht eingeloggt.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("drafts")
      .select("id,title,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErr("Entwürfe laden fehlgeschlagen: " + error.message);
      setLoading(false);
      return;
    }

    setDrafts((data ?? []) as DraftRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-kebab-menu]")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  const draftKind = (title: string): Exclude<DraftKind, "all"> => {
    const lower = (title ?? "").toLowerCase();
    if (lower.includes("rhein-main-link") || lower.includes("rml")) return "rml";
    if (lower.includes("schichtenverzeichnis")) return "sv";
    return "tb";
  };

  const filteredDrafts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drafts.filter((d) => {
      const matchesQuery = !q || (d.title ?? "").toLowerCase().includes(q);
      const matchesKind = kindFilter === "all" || draftKind(d.title) === kindFilter;
      return matchesQuery && matchesKind;
    });
  }, [drafts, query, kindFilter]);

  const draftTone = (title: string) => {
    const kind = draftKind(title);
    if (kind === "sv") {
      return {
        card: "from-amber-50/80 via-white to-orange-50/60",
        badge: "border-amber-200 bg-amber-50 text-amber-800",
        label: "Schichtenverzeichnis",
        icon: Layers3,
      };
    }
    if (kind === "rml") {
      return {
        card: "from-indigo-50/80 via-white to-cyan-50/70",
        badge: "border-indigo-200 bg-indigo-50 text-indigo-800",
        label: "TB Rhein-Main-Link",
        icon: FileClock,
      };
    }
    return {
      card: "from-sky-50/80 via-white to-cyan-50/60",
      badge: "border-sky-200 bg-sky-50 text-sky-800",
      label: "Tagesbericht",
      icon: FileText,
    };
  };

  return (
    <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-3 py-6 sm:px-6 lg:px-8 space-y-6">
      <section className="rounded-3xl border border-teal-200/60 bg-gradient-to-br from-teal-50 via-white to-cyan-50 px-5 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 ring-1 ring-teal-200/80">
              <FileClock className="h-3.5 w-3.5" aria-hidden="true" />
              Entwürfe
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Meine Entwürfe</h1>
            <p className="mt-1 text-sm text-slate-600">Schnell weiterarbeiten und später finalisieren.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            <FileText className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
            {drafts.length} Gesamt
          </div>
        </div>
      </section>

      {loading && <p className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">Lade…</p>}
      {err && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

      {!loading && !err && (
        <div className="rounded-3xl border border-teal-200/70 bg-gradient-to-b from-white via-white to-teal-50/40 shadow-sm">
          <div className="border-b border-teal-200/60 bg-gradient-to-r from-teal-50/60 to-white p-4">
            <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Entwürfe</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {filteredDrafts.length} Einträge
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
                <div className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white p-1 text-xs">
                  {[
                    { id: "all", label: "Alle" },
                    { id: "tb", label: "TB" },
                    { id: "rml", label: "RML" },
                    { id: "sv", label: "SV" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setKindFilter(option.id as DraftKind)}
                      className={[
                        "rounded-full px-2.5 py-1 font-semibold transition",
                        kindFilter === option.id
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 hover:bg-slate-100",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm lg:w-64">
                  <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input
                    className="w-full border-0 bg-transparent p-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                    placeholder="Suchen…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {filteredDrafts.length === 0 ? (
            <div className="p-5 text-sm text-slate-600">
              Keine passenden Entwürfe gefunden.
            </div>
          ) : (
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredDrafts.map((d) => {
                const tone = draftTone(d.title);
                const ToneIcon = tone.icon;
                const draftMenuId = `draft-${d.id}`;
                return (
                <div
                  key={d.id}
                  className={[
                    "relative rounded-2xl border border-slate-200/80 bg-gradient-to-br p-4 shadow-sm transition",
                    "hover:-translate-y-0.5 hover:shadow-md",
                    openMenuId === draftMenuId ? "z-20" : "z-0",
                    tone.card,
                  ].join(" ")}
                >
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-700 ring-1 ring-slate-200">
                        <ToneIcon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="text-base font-semibold leading-snug text-slate-900 break-words">{d.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {new Date(d.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className={`max-w-full rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tone.badge}`}>
                      {tone.label}
                    </span>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <div className="relative" data-kebab-menu>
                      {(() => {
                        const isOpen = openMenuId === draftMenuId;
                        return (
                          <>
                            <button
                              type="button"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50"
                              onClick={() => setOpenMenuId(isOpen ? null : draftMenuId)}
                              aria-label="Aktionen"
                              aria-expanded={isOpen}
                            >
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </button>
                            {isOpen ? (
                              <div className="absolute right-0 top-full z-[80] mt-2 w-44 rounded-xl border border-slate-200/80 bg-white p-1 shadow-lg">
                                <Link
                                  href={`/reports/new?draftId=${d.id}`}
                                  className="flex rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                  onClick={() => setOpenMenuId(null)}
                                >
                                  Öffnen
                                </Link>
                                <button
                                  type="button"
                                  className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    deleteDraft(d.id);
                                  }}
                                >
                                  Löschen
                                </button>
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
