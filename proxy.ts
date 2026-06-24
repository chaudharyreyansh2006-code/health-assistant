import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const isGuest = token ? guestRegex.test(token.email ?? "") : false;

  if (!token || isGuest) {
    if (["/", "/login", "/register"].includes(pathname)) {
      if (pathname === "/login") {
        return NextResponse.redirect(new URL(`${base}/?showLogin=true`, request.url));
      }
      if (pathname === "/register") {
        return NextResponse.redirect(new URL(`${base}/?showRegister=true`, request.url));
      }
      return NextResponse.next();
    }

    if (pathname.startsWith("/api/")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const redirectUrl = encodeURIComponent(new URL(request.url).pathname);
    return NextResponse.redirect(
      new URL(`${base}/?showLogin=true&callbackUrl=${redirectUrl}`, request.url)
    );
  }

  if (token && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL(`${base}/`, request.url));
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
