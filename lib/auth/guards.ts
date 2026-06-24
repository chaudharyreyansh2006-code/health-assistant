import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { guestRegex } from "@/lib/constants";

type RegularSession = Session & {
  user: NonNullable<Session["user"]> & {
    id: string;
    type: "regular";
  };
};

export function isGuestEmail(email: string | null | undefined) {
  return guestRegex.test(email ?? "");
}

export function isRegularSession(
  session: Session | null | undefined
): session is RegularSession {
  return Boolean(
    session?.user?.id &&
      session.user.type === "regular" &&
      !isGuestEmail(session.user.email)
  );
}

export function isRegularToken(token: JWT | null | undefined) {
  return Boolean(
    token?.id && token.type === "regular" && !isGuestEmail(token.email)
  );
}

export function getSafeCallbackUrl(
  callbackUrl: string | null | undefined,
  fallback = "/"
) {
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return fallback;
  }

  if (callbackUrl.startsWith("/login") || callbackUrl.startsWith("/register")) {
    return fallback;
  }

  return callbackUrl;
}
