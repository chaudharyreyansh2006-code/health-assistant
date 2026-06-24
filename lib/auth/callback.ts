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