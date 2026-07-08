import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getFamilyByUserId, getFamilyMembers } from "@/lib/db/queries";
import { isRegularSession } from "@/lib/auth/guards";

/**
 * Returns the user's single "family" — the family name (from
 * `User.familyName`) and the list of members. There is no longer a
 * list-of-workspaces concept; every user has exactly one family,
 * identified by the user id itself.
 *
 * Response shape: `{ family: { name, members } }` — kept
 * backwards-compatible with the old `/api/families` shape (a single
 * entry in the `families` array) so the AppSidebar can switch over
 * without restructuring.
 */
export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const family = await getFamilyByUserId({ userId: session.user.id });
  if (!family) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const members = await getFamilyMembers({ userId: session.user.id });

  return NextResponse.json({
    families: [
      {
        id: family.id,
        name: family.name,
        members,
      },
    ],
  });
}
