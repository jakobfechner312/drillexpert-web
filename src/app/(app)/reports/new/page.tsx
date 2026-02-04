import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";

export const dynamic = "force-dynamic";

export default function NewReportPage() {
  return <TagesberichtForm mode="create" stepper />;
}
