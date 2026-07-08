import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deleteMedicationLog } from "@/lib/db/queries";
import { isRegularSession } from "@/lib/auth/guards";

/**
 * DELETE — removes a single dose event (used by the "Undo" affordance on
 * the Today screen when a user taps Take / Skip by mistake).
 *
 * Returns 404 if the row doesn't exist OR the caller doesn't own the
 * family. We collapse both cases to 404 on purpose so a probing caller
 * can't tell whether an id was valid-but-not-mine.
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
  const ok = await deleteMedicationLog({ id, userId: session.user.id });
  if (!ok) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.json({ success: true, id });
}
