import { get } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";
import { getOwnedMedicalDocumentById } from "@/lib/db/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing document id" }, { status: 400 });
  }

  // Ownership check: the document must belong to a family member whose
  // family was created by the signed-in user. This is the whole point of the
  // private-store rewrite — no public URL to a medical file exists, and the
  // only way to read one is through this server-side, ownership-scoped fetch.
  const doc = await getOwnedMedicalDocumentById({
    id,
    userId: session.user.id,
  });
  if (!doc) {
    return new NextResponse("Not found", { status: 404 });
  }

  const result = await get(doc.blobPathname, { access: "private" });
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
