"use client";

import { useParams } from "next/navigation";
import SchichtenverzeichnisForm from "@/app/(app)/reports/schichtenverzeichnis/SchichtenverzeichnisForm";

export default function EditSchichtenverzeichnisPage() {
  const params = useParams<{ reportId: string }>();
  return <SchichtenverzeichnisForm reportId={params.reportId} mode="edit" />;
}
