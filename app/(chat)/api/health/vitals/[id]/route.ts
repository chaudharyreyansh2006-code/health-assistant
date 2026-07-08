import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deleteVital } from "@/lib/db/queries";
import { isRegularSession } from "@/lib/auth/guards";

/**
 * DELETE — removes a single vital reading (used when a wrong BP / weight /
 * glucose value was logged). Returns 404 if the row doesn't exist or the
 * caller doesn't own the family. `deleteVital` already enforces ownership
 * via the family join.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ok = await deleteVital({ id, userId: session.user.id });
  if (!ok) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.json({ success: true, id });
}
