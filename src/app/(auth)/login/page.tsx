export const dynamic = "force-dynamic";

import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-base-bg" />}>
      <LoginClient />
    </Suspense>
  );
}
