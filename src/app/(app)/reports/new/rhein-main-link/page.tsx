import { redirect } from "next/navigation";
import { RHEIN_MAIN_LINK_PROJECT_ID } from "@/lib/reportAccess";

export const dynamic = "force-dynamic";

export default function NewRheinMainLinkReportPage() {
  redirect(`/projects/${RHEIN_MAIN_LINK_PROJECT_ID}/reports/rhein-main-link/new`);
}
