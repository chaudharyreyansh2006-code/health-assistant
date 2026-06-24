import { Suspense } from "react";
import { RegisterPageClient } from "./register-form";

export default function Page() {
  return (
    <Suspense>
      <RegisterPageClient />
    </Suspense>
  );
}