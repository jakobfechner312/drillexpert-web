"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [email, setEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [lastSignIn, setLastSignIn] = useState<string>("");

  const [fullName, setFullName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");

  const [autoLoadDraft, setAutoLoadDraft] = useState<boolean>(true);
  const [customWorkCycles, setCustomWorkCycles] = useState<string[]>([]);
  const [customCycleDraft, setCustomCycleDraft] = useState<string>("");
  const [savingCycles, setSavingCycles] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      const { data, error: userErr } = await supabase.auth.getUser();
      const user = data?.user;
      if (userErr || !user) {
        setError("Nicht eingeloggt.");
        setLoading(false);
        return;
      }

      setEmail(user.email ?? "");
      setUserId(user.id);
      setCreatedAt(user.created_at ?? "");
      setLastSignIn(user.last_sign_in_at ?? "");
      setFullName((user.user_metadata as any)?.full_name ?? "");
      setPhone((user.user_metadata as any)?.phone ?? "");

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("custom_work_cycles")
        .eq("id", user.id)
        .single();
      if (!profileErr && Array.isArray(profile?.custom_work_cycles)) {
        setCustomWorkCycles(profile.custom_work_cycles);
      }

      try {
        const saved = localStorage.getItem("pref_autoload_draft");
        if (saved != null) setAutoLoadDraft(saved === "true");
      } catch {
        // ignore
      }

      setLoading(false);
    };

    run();
  }, [supabase]);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { error: updErr } = await supabase.auth.updateUser({
      data: {
        full_name: fullName.trim(),
        phone: phone.trim(),
      },
    });

    if (updErr) {
      setError("Speichern fehlgeschlagen: " + updErr.message);
      setSaving(false);
      return;
    }

    setSuccess("Profil gespeichert ✅");
    setSaving(false);
  };

  const savePreferences = () => {
    try {
      localStorage.setItem("pref_autoload_draft", String(autoLoadDraft));
      setSuccess("Einstellungen gespeichert ✅");
    } catch {
      setError("Einstellungen konnten nicht gespeichert werden.");
    }
  };

  const saveCustomCycles = async (next: string[]) => {
    setSavingCycles(true);
    setError(null);
    setSuccess(null);
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) {
      setError("Nicht eingeloggt.");
      setSavingCycles(false);
      return;
    }
    const cleaned = next
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .slice(0, 5);
    const { error: upErr } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        custom_work_cycles: cleaned,
      },
      { onConflict: "id" }
    );
    if (upErr) {
      setError("Speichern fehlgeschlagen: " + upErr.message);
      setSavingCycles(false);
      return;
    }
    setCustomWorkCycles(cleaned);
    setSuccess("Arbeitstakte gespeichert ✅");
    setSavingCycles(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Einstellungen
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Profil & Standardwerte</h1>
        <p className="mt-1 text-sm text-slate-600">
          Verwalte deine Profildaten und Standard‑Optionen.
        </p>
      </div>

      {loading && <p className="mt-6 text-sm text-slate-600">Lade…</p>}
      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-6 text-sm text-emerald-700">{success}</p>}

      {!loading && !error && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Profil */}
          <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Profil</h2>

            <div className="mt-4 grid gap-4">
              <label className="space-y-1">
                <span className="text-sm text-slate-600">Voller Name</span>
                <input
                  className="w-full rounded-xl border p-3"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="z.B. Jakob Fechner"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm text-slate-600">Telefon</span>
                <input
                  className="w-full rounded-xl border p-3"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+49 …"
                />
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                onClick={saveProfile}
                disabled={saving}
              >
                {saving ? "Speichere…" : "Profil speichern"}
              </button>
            </div>
          </section>

          {/* Account */}
          <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Account</h2>

            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-slate-500">E‑Mail</span>
                <span className="font-medium">{email || "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-slate-500">User ID</span>
                <span className="font-mono text-xs">{userId || "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-slate-500">Erstellt</span>
                <span>{createdAt ? new Date(createdAt).toLocaleString() : "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border p-3">
                <span className="text-slate-500">Letzter Login</span>
                <span>{lastSignIn ? new Date(lastSignIn).toLocaleString() : "—"}</span>
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900">Standard‑Optionen</h2>

            <div className="mt-4 flex items-center justify-between rounded-xl border p-3">
              <div>
                <div className="font-medium">Lokalen Entwurf automatisch laden</div>
                <div className="text-xs text-slate-500">
                  Lädt gespeicherten Entwurf beim Öffnen des Formulars.
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoLoadDraft}
                  onChange={(e) => setAutoLoadDraft(e.target.checked)}
                />
              </label>
            </div>

            <div className="mt-4">
              <button
                type="button"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={savePreferences}
              >
                Einstellungen speichern
              </button>
            </div>
          </section>

          {/* Arbeitstakte */}
          <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-900">Eigene Arbeitstakte (Tagesbericht)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Du kannst bis zu 5 eigene Arbeitstakte speichern. Diese erscheinen im Dropdown des Tagesberichts.
            </p>

            <div className="mt-4 space-y-3">
              {customWorkCycles.length === 0 ? (
                <p className="text-sm text-slate-500">Noch keine eigenen Arbeitstakte vorhanden.</p>
              ) : (
                customWorkCycles.map((cycle, idx) => (
                  <div key={`${cycle}-${idx}`} className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">#{23 + idx}</span>
                    <input
                      className="flex-1 min-w-[220px] rounded-xl border p-2 text-sm"
                      value={cycle}
                      onChange={(e) =>
                        setCustomWorkCycles((prev) => {
                          const next = [...prev];
                          next[idx] = e.target.value;
                          return next;
                        })
                      }
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      onClick={() =>
                        setCustomWorkCycles((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Löschen
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                className="flex-1 min-w-[240px] rounded-xl border p-2 text-sm"
                placeholder="Neuer Arbeitstakt…"
                value={customCycleDraft}
                onChange={(e) => setCustomCycleDraft(e.target.value)}
              />
              <button
                type="button"
                className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                disabled={customWorkCycles.length >= 5}
                onClick={() => {
                  const text = customCycleDraft.trim();
                  if (!text) return;
                  if (customWorkCycles.length >= 5) return;
                  setCustomWorkCycles((prev) => [...prev, text]);
                  setCustomCycleDraft("");
                }}
              >
                + Hinzufügen
              </button>
              <button
                type="button"
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                disabled={savingCycles}
                onClick={() => saveCustomCycles(customWorkCycles)}
              >
                {savingCycles ? "Speichere…" : "Arbeitstakte speichern"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
