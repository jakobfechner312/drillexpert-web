"use client";

export const dynamic = "force-dynamic";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const redirectTo = sp.get("redirectTo") ?? "/reports/new";

  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ✅ WENN SCHON EINGELOGGT → SOFORT WEITER
  useEffect(() => {
    let mounted = true;

    (async () => {
      setChecking(true);
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;

      if (data.user) {
        router.replace(redirectTo);
        router.refresh();
        return;
      }

      setChecking(false);
    })();

    return () => {
      mounted = false;
    };
  }, [supabase, router, redirectTo]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }

    // ✅ nach Login sauber weiter
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-base-bg text-base-ink flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-base-border bg-white p-6 shadow-soft">
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-12 w-48">
            <Image
              src="/drillexpert-logo.png"
              alt="Drillexpert"
              width={200}
              height={50}
              priority
              unoptimized
              className="object-contain"
            />
          </div>

          <h1 className="text-xl font-semibold">Anmeldung</h1>
          <p className="text-sm text-base-muted">
            {checking
              ? "Session wird geprüft..."
              : "Bitte einloggen, um fortzufahren."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-base-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-drill-200"
          />

          <input
            type="password"
            placeholder="Passwort"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-xl border border-base-border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-drill-200"
          />

          {errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || checking}
            className="w-full rounded-xl bg-drill-500 px-4 py-3 text-white font-medium hover:bg-drill-600 disabled:opacity-60"
          >
            {loading ? "Login..." : "Login"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="w-full rounded-xl border border-base-border bg-white px-4 py-3 text-sm hover:bg-base-bg"
          >
            Zurück
          </button>
        </form>
      </div>
    </div>
  );
}
