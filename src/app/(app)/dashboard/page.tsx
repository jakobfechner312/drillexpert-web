"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

type ReportRow = {
  id: string;
  title: string;
  created_at: string;
  report_type?: string | null;
};

type DraftRow = {
  id: string;
  title: string;
  created_at: string;
};

type ProjectRow = {
  id: string;
  name: string;
};

type ProjectMemberSelectRow = {
  project: ProjectRow | ProjectRow[] | null;
};

type DomainSuggestionRow = {
  id: string;
  user_id: string;
  domain: string;
  created_at: string;
};

type DomainVoteRow = {
  id: string;
  suggestion_id: string;
  voter_user_id: string;
  created_at: string;
};

type ProfileLiteRow = {
  id: string;
  email: string | null;
};

type DomainCheckInfo = {
  domain: string;
  checkedAt: string;
  availability: {
    available: boolean | null;
    status: string;
  };
  pricing: {
    currency: string | null;
    registration: number | null;
    renewal: number | null;
    transfer: number | null;
  };
};

type DomainCheckState = {
  loading: boolean;
  error: string | null;
  data: DomainCheckInfo | null;
};

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [createReportOpen, setCreateReportOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [domainSuggestions, setDomainSuggestions] = useState<DomainSuggestionRow[]>([]);
  const [domainVotes, setDomainVotes] = useState<DomainVoteRow[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainErr, setDomainErr] = useState<string | null>(null);
  const [domainSetupMissing, setDomainSetupMissing] = useState(false);
  const [domainChecks, setDomainChecks] = useState<Record<string, DomainCheckState>>({});
  const [suggestionUserLabels, setSuggestionUserLabels] = useState<Record<string, string>>({});
  const [totalVotingMembers, setTotalVotingMembers] = useState<number>(1);
  const [draftDomainCheck, setDraftDomainCheck] = useState<DomainCheckState>({
    loading: false,
    error: null,
    data: null,
  });
  const [draftCheckedDomain, setDraftCheckedDomain] = useState<string | null>(null);

  useEffect(() => {
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
      setCurrentUserId(user.id);

      const [projRes, repRes, draftRes, suggRes, voteRes] = await Promise.all([
        supabase
          .from("project_members")
          .select("project:projects(id,name)")
          .eq("user_id", user.id),
        supabase
          .from("reports")
          .select("id,title,created_at,report_type")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("drafts")
          .select("id,title,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("domain_suggestions")
          .select("id,user_id,domain,created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("domain_votes")
          .select("id,suggestion_id,voter_user_id,created_at")
          .order("created_at", { ascending: false }),
      ]);

      if (projRes.error || repRes.error || draftRes.error) {
        setErr(
          projRes.error?.message ||
            repRes.error?.message ||
            draftRes.error?.message ||
            "Laden fehlgeschlagen."
        );
        setLoading(false);
        return;
      }

      const projMapped = ((projRes.data ?? []) as ProjectMemberSelectRow[])
        .flatMap((row) => {
          if (!row.project) return [];
          return Array.isArray(row.project) ? row.project : [row.project];
        })
        .filter((p) => Boolean(p?.id && p?.name));

      setProjects(projMapped);
      setReports((repRes.data ?? []) as ReportRow[]);
      setDrafts((draftRes.data ?? []) as DraftRow[]);
      if (suggRes.error || voteRes.error) {
        setDomainSetupMissing(true);
        setDomainErr("Domain-Voting ist noch nicht eingerichtet (DB-Tabellen fehlen).");
        setDomainSuggestions([]);
        setDomainVotes([]);
        setSuggestionUserLabels({});
      } else {
        const suggestions = (suggRes.data ?? []) as DomainSuggestionRow[];
        setDomainSetupMissing(false);
        setDomainErr(null);
        setDomainSuggestions(suggestions);
        setDomainVotes((voteRes.data ?? []) as DomainVoteRow[]);

        const userIds = Array.from(new Set(suggestions.map((s) => s.user_id)));
        if (userIds.length > 0) {
          const { data: profileRows, error: profileErr } = await supabase
            .from("profiles")
            .select("id,email")
            .in("id", userIds);

          if (!profileErr) {
            const labelMap = new Map<string, string>();
            (profileRows as ProfileLiteRow[] | null | undefined)?.forEach((p) => {
              const email = String(p.email ?? "").trim();
              const localPart = email.includes("@") ? email.split("@")[0] : email;
              if (localPart) labelMap.set(p.id, localPart);
            });

            const fallback = (id: string) => `User ${id.slice(0, 6)}`;
            const nextLabels: Record<string, string> = {};
            userIds.forEach((id) => {
              nextLabels[id] = labelMap.get(id) ?? fallback(id);
            });
            setSuggestionUserLabels(nextLabels);
          } else {
            const fallbackLabels: Record<string, string> = {};
            userIds.forEach((id) => {
              fallbackLabels[id] = `User ${id.slice(0, 6)}`;
            });
            setSuggestionUserLabels(fallbackLabels);
          }
        } else {
          setSuggestionUserLabels({});
        }
      }

      // Gesamtzahl möglicher Voter (für Vote-Balken):
      // 1) Team-Mitglieder aus allen Projekten, in denen der User Mitglied ist
      // 2) plus bekannte Teilnehmer aus Vorschlägen/Votes als Fallback-Ergänzung
      const participantIds = new Set<string>([
        user.id,
        ...((suggRes.data ?? []) as DomainSuggestionRow[]).map((s) => s.user_id),
        ...((voteRes.data ?? []) as DomainVoteRow[]).map((v) => v.voter_user_id),
      ]);

      const { data: myMemberships } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id);

      const myProjectIds = Array.from(
        new Set(
          ((myMemberships ?? []) as Array<{ project_id: string | null }>)
            .map((m) => m.project_id)
            .filter((v): v is string => Boolean(v))
        )
      );

      if (myProjectIds.length > 0) {
        const { data: teamMembers } = await supabase
          .from("project_members")
          .select("user_id")
          .in("project_id", myProjectIds);

        ((teamMembers ?? []) as Array<{ user_id: string | null }>).forEach((m) => {
          if (m.user_id) participantIds.add(m.user_id);
        });

        // Owner zählen ebenfalls mit, falls sie nicht in project_members stehen.
        const { data: projectOwners } = await supabase
          .from("projects")
          .select("owner_id")
          .in("id", myProjectIds);
        ((projectOwners ?? []) as Array<{ owner_id: string | null }>).forEach((p) => {
          if (p.owner_id) participantIds.add(p.owner_id);
        });
      }

      setTotalVotingMembers(Math.max(1, participantIds.size));
      setLoading(false);
    };

    load();
  }, [supabase]);

  const typeBadge = (type: string | null | undefined) => {
    if (type === "schichtenverzeichnis") {
      return "bg-amber-50 text-amber-800 border-amber-200";
    }
    return "bg-sky-50 text-sky-800 border-sky-200";
  };

  const sanitizeDomain = (raw: string) => {
    const stripped = raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    return stripped;
  };

  const mySuggestion = useMemo(
    () => domainSuggestions.find((s) => s.user_id === currentUserId),
    [domainSuggestions, currentUserId]
  );

  const voteCountBySuggestion = useMemo(() => {
    const map = new Map<string, number>();
    domainVotes.forEach((v) => {
      map.set(v.suggestion_id, (map.get(v.suggestion_id) ?? 0) + 1);
    });
    return map;
  }, [domainVotes]);

  const myVoteSuggestionIds = useMemo(() => {
    const set = new Set<string>();
    domainVotes.forEach((v) => {
      if (v.voter_user_id === currentUserId) set.add(v.suggestion_id);
    });
    return set;
  }, [domainVotes, currentUserId]);

  const rankedSuggestions = useMemo(() => {
    return [...domainSuggestions].sort((a, b) => {
      const av = voteCountBySuggestion.get(a.id) ?? 0;
      const bv = voteCountBySuggestion.get(b.id) ?? 0;
      if (bv !== av) return bv - av;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [domainSuggestions, voteCountBySuggestion]);

  const submitDomainSuggestion = async () => {
    if (!currentUserId || domainSetupMissing) return;
    setDomainErr(null);
    const domain = sanitizeDomain(domainInput);
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      setDomainErr("Bitte eine gültige Domain eingeben (z. B. drill-expert.de).");
      return;
    }
    if (draftCheckedDomain !== domain || !draftDomainCheck.data) {
      setDomainErr("Bitte zuerst die Domain prüfen.");
      return;
    }
    if (draftDomainCheck.data.availability.available !== true) {
      setDomainErr("Domain nicht verfügbar. Bitte einen anderen Vorschlag prüfen.");
      return;
    }
    if (mySuggestion && mySuggestion.domain !== domain) {
      setDomainErr("Du hast bereits einen Vorschlag abgegeben.");
      return;
    }
    setDomainLoading(true);
    const { data, error } = await supabase
      .from("domain_suggestions")
      .upsert({ user_id: currentUserId, domain }, { onConflict: "user_id" })
      .select("id,user_id,domain,created_at")
      .single();
    setDomainLoading(false);
    if (error) {
      setDomainErr("Vorschlag speichern fehlgeschlagen: " + error.message);
      return;
    }
    setDomainInput("");
    setDomainSuggestions((prev) => {
      const rest = prev.filter((x) => x.user_id !== currentUserId);
      return [data as DomainSuggestionRow, ...rest];
    });
  };

  const checkDraftDomainWithVercel = async () => {
    if (domainSetupMissing) return;
    setDomainErr(null);
    const domain = sanitizeDomain(domainInput);
    if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      setDomainErr("Bitte eine gültige Domain eingeben (z. B. drill-expert.de).");
      return;
    }
    setDraftDomainCheck({ loading: true, error: null, data: null });
    setDraftCheckedDomain(domain);
    try {
      const res = await fetch(`/api/domain-check?domain=${encodeURIComponent(domain)}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as DomainCheckInfo | { error?: string };
      if (!res.ok || !("availability" in payload)) {
        const msg = "error" in payload && typeof payload.error === "string" ? payload.error : "Check fehlgeschlagen.";
        setDraftDomainCheck({ loading: false, error: msg, data: null });
        return;
      }
      setDraftDomainCheck({ loading: false, error: null, data: payload });
    } catch {
      setDraftDomainCheck({ loading: false, error: "Netzwerkfehler beim Vercel-Check.", data: null });
    }
  };

  const castDomainVote = async (suggestion: DomainSuggestionRow) => {
    if (!currentUserId || domainSetupMissing) return;
    if (suggestion.user_id === currentUserId) return;
    if (myVoteSuggestionIds.has(suggestion.id)) return;
    setDomainErr(null);
    setDomainLoading(true);
    const { data, error } = await supabase
      .from("domain_votes")
      .insert({
        suggestion_id: suggestion.id,
        voter_user_id: currentUserId,
      })
      .select("id,suggestion_id,voter_user_id,created_at")
      .single();
    setDomainLoading(false);
    if (error) {
      setDomainErr("Abstimmung fehlgeschlagen: " + error.message);
      return;
    }
    setDomainVotes((prev) => [data as DomainVoteRow, ...prev]);
  };

  const deleteMySuggestion = async () => {
    if (!currentUserId || !mySuggestion) return;
    if (!confirm("Deinen Domain-Vorschlag wirklich löschen?")) return;
    setDomainErr(null);
    setDomainLoading(true);
    const { error } = await supabase
      .from("domain_suggestions")
      .delete()
      .eq("id", mySuggestion.id)
      .eq("user_id", currentUserId);
    setDomainLoading(false);
    if (error) {
      setDomainErr("Löschen fehlgeschlagen: " + error.message);
      return;
    }
    setDomainSuggestions((prev) => prev.filter((s) => s.id !== mySuggestion.id));
    setDomainVotes((prev) => prev.filter((v) => v.suggestion_id !== mySuggestion.id));
    setDomainInput("");
    setDraftCheckedDomain(null);
    setDraftDomainCheck({ loading: false, error: null, data: null });
  };

  const checkDomainWithVercel = async (suggestion: DomainSuggestionRow) => {
    setDomainChecks((prev) => ({
      ...prev,
      [suggestion.id]: { loading: true, error: null, data: null },
    }));
    try {
      const res = await fetch(`/api/domain-check?domain=${encodeURIComponent(suggestion.domain)}`, {
        cache: "no-store",
      });
      const payload = (await res.json()) as DomainCheckInfo | { error?: string };
      if (!res.ok || !("availability" in payload)) {
        const msg = "error" in payload && typeof payload.error === "string" ? payload.error : "Check fehlgeschlagen.";
        setDomainChecks((prev) => ({
          ...prev,
          [suggestion.id]: { loading: false, error: msg, data: null },
        }));
        return;
      }
      setDomainChecks((prev) => ({
        ...prev,
        [suggestion.id]: { loading: false, error: null, data: payload },
      }));
    } catch {
      setDomainChecks((prev) => ({
        ...prev,
        [suggestion.id]: { loading: false, error: "Netzwerkfehler beim Vercel-Check.", data: null },
      }));
    }
  };

  const formatMoney = (value: number | null, currency: string | null) => {
    if (value == null) return "—";
    try {
      return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: currency || "EUR",
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currency ?? "EUR"}`;
    }
  };

  return (
    <div className="mx-auto max-w-[1800px] overflow-x-hidden px-4 py-6">
      <div className="rounded-3xl border border-slate-200/70 bg-gradient-to-b from-white via-white to-slate-50 p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dashboard</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Willkommen bei Drillexpert</h1>
            <p className="mt-1 text-sm text-slate-600">
              Tagesberichte & Schichtenverzeichnisse in Minuten erstellt.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
              <span className="relative inline-flex h-6 w-6 items-center justify-center">
                <span className="spin-slow absolute inset-0 rounded-full border border-slate-300/70" />
                <span className="floaty h-2 w-2 rounded-full bg-sky-500" />
              </span>
              Live-Aktivität
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreateReportOpen(true)}
            >
              + Bericht erstellen
            </button>
            <Link href="/projects" className="btn btn-secondary">
              Meine Projekte
            </Link>
          </div>
        </div>
      </div>

      {loading && <p className="mt-6 text-sm text-slate-600">Lade…</p>}
      {err && <p className="mt-6 text-sm text-red-600">{err}</p>}

      {!loading && !err && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Projekte</div>
              <div className="mt-2 text-2xl font-semibold">{projects.length}</div>
              <div className="mt-2 text-xs text-slate-500">Mitgliedschaften</div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Berichte</div>
              <div className="mt-2 text-2xl font-semibold">{reports.length}</div>
              <div className="mt-2 text-xs text-slate-500">Zuletzt bearbeitet</div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">Entwürfe</div>
              <div className="mt-2 text-2xl font-semibold">{drafts.length}</div>
              <div className="mt-2 text-xs text-slate-500">Lokale & Cloud</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">Zuletzt bearbeitete Berichte</h2>
                <Link href="/reports" className="text-xs text-slate-500 hover:text-slate-700">
                  Alle anzeigen
                </Link>
              </div>
              {reports.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Noch keine Berichte vorhanden.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {reports.slice(0, 3).map((r) => (
                    <div key={r.id} className="rounded-xl border border-slate-200/70 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium break-words">{r.title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="mt-2">
                        <span className={`inline-flex max-w-full rounded-full border border-slate-200/70 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${typeBadge(r.report_type)}`}>
                          {r.report_type === "schichtenverzeichnis" ? "Schichtenverzeichnis" : "Tagesbericht"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium">Zuletzt gespeicherte Entwürfe</h2>
                <Link href="/drafts" className="text-xs text-slate-500 hover:text-slate-700">
                  Alle anzeigen
                </Link>
              </div>
              {drafts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">Noch keine Entwürfe vorhanden.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {drafts.slice(0, 3).map((d) => (
                    <div key={d.id} className="rounded-xl border border-slate-200/70 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium break-words">{d.title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {new Date(d.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="mt-2">
                        <Link href={`/reports/new?draftId=${d.id}`} className="btn btn-secondary btn-xs w-full sm:w-auto">
                          Öffnen
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">Wunsch-Domain Voting</h2>
                <p className="text-xs text-slate-500">
                  1 Vorschlag pro Mitglied, 1 Stimme pro fremdem Vorschlag.
                </p>
              </div>
            </div>
            {domainSetupMissing ? (
              <p className="mt-3 text-sm text-amber-700">
                Domain-Voting ist noch nicht eingerichtet. Ich kann dir gleich die SQL für die zwei Tabellen geben.
              </p>
            ) : (
              <>
                <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
                  <input
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder={mySuggestion ? "Dein Vorschlag ist bereits gesetzt" : "z. B. drill-expert.de"}
                    value={domainInput}
                    onChange={(e) => {
                      setDomainInput(e.target.value);
                      setDraftCheckedDomain(null);
                      setDraftDomainCheck({ loading: false, error: null, data: null });
                    }}
                    disabled={Boolean(mySuggestion) || domainLoading}
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={checkDraftDomainWithVercel}
                      disabled={Boolean(mySuggestion) || domainLoading || draftDomainCheck.loading}
                    >
                      {draftDomainCheck.loading ? "Prüfe…" : "Domain prüfen"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={submitDomainSuggestion}
                      disabled={
                        Boolean(mySuggestion) ||
                        domainLoading ||
                        draftDomainCheck.loading ||
                        !draftDomainCheck.data ||
                        draftDomainCheck.data.availability.available !== true ||
                        draftCheckedDomain !== sanitizeDomain(domainInput)
                      }
                    >
                      {mySuggestion ? "Vorschlag gesetzt" : "Vorschlag speichern"}
                    </button>
                  </div>
                </div>
                {mySuggestion ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={deleteMySuggestion}
                      disabled={domainLoading || draftDomainCheck.loading}
                    >
                      Meinen Vorschlag löschen
                    </button>
                  </div>
                ) : null}
                {domainErr ? <p className="mt-2 text-sm text-red-600">{domainErr}</p> : null}
                {draftDomainCheck.error ? <p className="mt-2 text-sm text-red-600">{draftDomainCheck.error}</p> : null}
                {draftDomainCheck.data ? (
                  <div className="mt-3 rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-600">
                      Check für <span className="font-semibold">{draftDomainCheck.data.domain}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          draftDomainCheck.data.availability.available === true
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : draftDomainCheck.data.availability.available === false
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-100 text-slate-700 border-slate-200",
                        ].join(" ")}
                      >
                        {draftDomainCheck.data.availability.status}
                      </span>
                      <span className="text-xs text-slate-600">
                        Reg.: {formatMoney(draftDomainCheck.data.pricing.registration, draftDomainCheck.data.pricing.currency)}
                      </span>
                      <span className="text-xs text-slate-600">
                        Verl.: {formatMoney(draftDomainCheck.data.pricing.renewal, draftDomainCheck.data.pricing.currency)}
                      </span>
                    </div>
                  </div>
                ) : null}
                <div className="mt-4 space-y-2">
                  {rankedSuggestions.length === 0 ? (
                    <p className="text-sm text-slate-500">Noch keine Vorschläge vorhanden.</p>
                  ) : (
                    rankedSuggestions.map((s) => {
                      const own = s.user_id === currentUserId;
                      const voted = myVoteSuggestionIds.has(s.id);
                      const votes = voteCountBySuggestion.get(s.id) ?? 0;
                      const possibleVotes = Math.max(1, totalVotingMembers - 1);
                      const votePercent = Math.max(8, Math.min(100, Math.round((votes / possibleVotes) * 100)));
                      const check = domainChecks[s.id];
                      const checkData = check?.data ?? null;
                      const authorLabel =
                        s.user_id === currentUserId
                          ? "dir"
                          : suggestionUserLabels[s.user_id] ?? `User ${s.user_id.slice(0, 6)}`;
                      const available = checkData?.availability.available;
                      const statusCls =
                        available === true
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : available === false
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-slate-100 text-slate-700 border-slate-200";
                      return (
                        <div
                          key={s.id}
                          className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{s.domain}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {votes} / {possibleVotes} Stimmen · von {authorLabel}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className={[
                                  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                                  own || voted || domainLoading
                                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                                ].join(" ")}
                                disabled={own || voted || domainLoading}
                                onClick={() => castDomainVote(s)}
                                title={own ? "Eigener Vorschlag" : voted ? "Bereits abgestimmt" : "Abstimmen"}
                              >
                                {own ? (
                                  "Eigener Vorschlag"
                                ) : voted ? (
                                  "Abgestimmt"
                                ) : (
                                  <>
                                    <span className="text-[13px] leading-none">👍</span>
                                    <span className="text-[13px] leading-none">+</span>
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                disabled={check?.loading}
                                onClick={() => checkDomainWithVercel(s)}
                              >
                                {check?.loading ? "Prüfe…" : "Vercel Check"}
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200/80">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500"
                              style={{ width: `${votePercent}%` }}
                            />
                          </div>
                          {check?.error ? (
                            <p className="mt-2 text-xs text-rose-600">{check.error}</p>
                          ) : null}
                          {checkData ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                              <div className={`rounded-lg border px-2 py-1 text-xs font-semibold ${statusCls}`}>
                                {checkData.availability.status}
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                                Reg.: {formatMoney(checkData.pricing.registration, checkData.pricing.currency)}
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                                Verl.: {formatMoney(checkData.pricing.renewal, checkData.pricing.currency)}
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                                Transfer: {formatMoney(checkData.pricing.transfer, checkData.pricing.currency)}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {createReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Bericht erstellen</h3>
                <p className="text-xs text-slate-500">Wähle den Berichtstyp</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCreateReportOpen(false)}
              >
                Schließen
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Link
                href="/reports/new"
                className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <div className="text-sm font-semibold text-sky-900">Tagesbericht</div>
                <div className="mt-1 text-xs text-sky-700">
                  Tagesleistung, Bohrungen, Personal
                </div>
              </Link>
              <Link
                href="/reports/schichtenverzeichnis/step"
                className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <div className="text-sm font-semibold text-amber-900">Schichtenverzeichnis</div>
                <div className="mt-1 text-xs text-amber-700">
                  Schichten, Proben, Feststellungen
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
