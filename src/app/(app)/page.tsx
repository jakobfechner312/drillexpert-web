// src/app/page.tsx
import AppShell from "@/components/AppShell";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";


export default function Home() {
  return (
    <AppShell
      title="Tagesbericht"
      subtitle="Drillexpert • Digitaler Tagesbericht"
    >
      <TagesberichtForm />
    </AppShell>
  );
}
