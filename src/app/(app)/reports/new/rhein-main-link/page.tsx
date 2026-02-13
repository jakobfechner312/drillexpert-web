import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";

export const dynamic = "force-dynamic";

export default function NewRheinMainLinkReportPage() {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-sky-50 px-5 py-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-500">Rhein-Main-Link</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Tagesbericht</h1>
        <p className="mt-1 text-sm text-slate-600">
          Gleiche Step-Logik wie Standard-Tagesbericht, angepasst auf die TB_RML-PDF.
        </p>
      </section>

      <TagesberichtForm
        mode="create"
        stepper
        reportType="tagesbericht_rhein_main_link"
        formTitle="Tagesbericht Rhein-Main-Link"
        pdfEndpointBase="/api/pdf/tagesbericht-rhein-main-link"
        draftStorageKey="tagesbericht_rhein_main_link_draft"
        draftBlockStorageKey="tagesbericht_rhein_main_link_draft_block"
      />
    </div>
  );
}
