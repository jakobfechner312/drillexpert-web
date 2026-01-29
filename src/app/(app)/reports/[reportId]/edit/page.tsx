"use client";

import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";

export default function EditReportPage() {
  const params = useParams<{ projectId: string; reportId: string }>();
  return (
    <TagesberichtForm projectId={params.projectId} reportId={params.reportId} mode="edit" />
  );
}