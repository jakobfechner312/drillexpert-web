"use client";

import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";

export default function EditReportPage() {
  const params = useParams<{ reportId: string }>();
  return (
    <TagesberichtForm reportId={params.reportId} mode="edit" stepper />
  );
}
