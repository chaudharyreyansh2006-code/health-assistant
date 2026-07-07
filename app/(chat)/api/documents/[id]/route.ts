import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deleteMedicalDocument } from "@/lib/db/queries";
import { isRegularSession } from "@/lib/auth/guards";

/**
 * Hard-deletes a medical document the caller owns. The query layer:
 *   1. Verifies the document belongs to a family member whose family was
 *      created by the signed-in user.
 *   2. Removes the file from Vercel Blob (private store).
 *   3. Deletes the `MedicalDocument` row, which cascades to every
 *      `DocumentChunk` for that document — so every embedding generated
 *      from that file is wiped, not just the file itself.
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
  if (!id) {
    return NextResponse.json({ error: "Missing document id" }, { status: 400 });
  }

  const result = await deleteMedicalDocument({
    id,
    userId: session.user.id,
  });

  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.json({ success: true, id: result.id });
}
