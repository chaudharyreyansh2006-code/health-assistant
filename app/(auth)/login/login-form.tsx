"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { type LoginActionState, login } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/chat/auth-form";
import { SubmitButton } from "@/components/chat/submit-button";
import { toast } from "@/components/chat/toast";
import { getSafeCallbackUrl } from "@/lib/auth/callback";

export function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [isSuccessful, setIsSuccessful] = useState(false);

  const safeCallbackUrl = useMemo(
    () => getSafeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams]
  );
  const registerHref =
    safeCallbackUrl === "/"
      ? "/register"
      : `/register?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`;

  const [state, formAction] = useActionState<LoginActionState, FormData>(
    login,
    { status: "idle" }
  );

  const { update: updateSession } = useSession();

  useEffect(() => {
    if (state.status === "failed") {
      toast({ type: "error", description: "Invalid credentials!" });
    } else if (state.status === "invalid_data") {
      toast({
        type: "error",
        description: "Failed validating your submission!",
      });
    } else if (state.status === "success") {
      setIsSuccessful(true);
      updateSession().finally(() => {
        router.replace(safeCallbackUrl);
        router.refresh();
      });
    }
  }, [router, safeCallbackUrl, state.status, updateSession]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get("email") as string);
    formAction(formData);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="text-sm text-muted-foreground">
        Sign in to your account to continue
      </p>
      <AuthForm action={handleSubmit} defaultEmail={email}>
        <SubmitButton isSuccessful={isSuccessful}>Sign in</SubmitButton>
        <p className="text-center text-[13px] text-muted-foreground">
          {"No account? "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href={registerHref}
          >
            Sign up
          </Link>
        </p>
      </AuthForm>
    </>
  );
}