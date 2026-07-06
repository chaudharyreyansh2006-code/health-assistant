import { get } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";

export async function GET(request: NextRequest) {
  // Authenticate the request before serving the Blob. The store is private,
  // so the blob can only be read here (server-side, with the read-write token)
  // and only for users with an active session.
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pathname = request.nextUrl.searchParams.get("pathname");
  if (!pathname) {
    return NextResponse.json({ error: "Missing pathname" }, { status: 400 });
  }

  const result = await get(pathname, {
    access: "private",
  });
  if (result === null) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (result.statusCode === 304) {
    return new NextResponse(null, { status: 304 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Cache-Control": "private, no-cache",
      "Content-Type": result.blob.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
