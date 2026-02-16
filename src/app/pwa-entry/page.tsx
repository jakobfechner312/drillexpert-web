"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function PwaEntryPage() {
  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      window.location.replace(data.user ? "/dashboard" : "/login");
    };

    run();
  }, []);

  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-700">
      <p className="text-sm">Drillexpert wird gestartet…</p>
    </main>
  );
}

