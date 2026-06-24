import { Suspense } from "react";
import { LoginPageClient } from "./login-form";

export default function Page() {
  return (
    <Suspense>
      <LoginPageClient />
    </Suspense>
  );
}