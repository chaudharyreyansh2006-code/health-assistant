import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getSafeCallbackUrl, isRegularToken } from "./lib/auth/guards";
import { isDevelopmentEnvironment } from "./lib/constants";

const PUBLIC_PATHS = new Set(["/login", "/register"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const isAuthPage = PUBLIC_PATHS.has(pathname);
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const isAuthenticated = isRegularToken(token);

  if (!isAuthenticated) {
    if (isAuthPage) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/api/")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(`${base}/login`, request.url);
    url.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (isAuthPage) {
    const callbackUrl = getSafeCallbackUrl(
      request.nextUrl.searchParams.get("callbackUrl")
    );
    return NextResponse.redirect(new URL(`${base}${callbackUrl}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/api/:path*",
    "/login",
    "/register",

    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};