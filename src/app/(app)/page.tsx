import { Suspense } from "react";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Lade…</div>}>
      <TagesberichtForm mode="create" />
    </Suspense>
  );
}
