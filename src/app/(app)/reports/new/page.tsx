"use client";

import { useParams } from "next/navigation";
import TagesberichtForm from "@/app/(app)/reports/new/TagesberichtForm";

export default function NewReportInProjectPage() {
  const params = useParams<{ projectId: string }>();
  return <TagesberichtForm projectId={params.projectId} mode="create" />;
}