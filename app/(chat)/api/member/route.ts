import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";
import { getFamilyMemberById } from "@/lib/db/queries";

/**
 * Returns a single family member iff the caller owns it. Ownership is
 * checked against the denormalized `FamilyMember.userId` column — a
 * caller who isn't the owner gets a 404 (not 403), so a probing caller
 * can't tell whether the id was valid-but-not-mine vs. just bogus.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const member = await getFamilyMemberById({ id });
    if (!member || member.userId !== session.user.id) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }
    return Response.json(member);
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to fetch member details" },
      { status: 500 },
    );
  }
}
