import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";
import {
  getFamilyMemberById,
  getHealthMemories,
  upsertHealthMemory,
} from "@/lib/db/queries";

/**
 * GET — returns the long-term health memory blocks for a member the caller
 * owns. The `userId` filter is on the denormalized `HealthMemory.userId`
 * column, so a foreign memberId yields an empty array, not someone else's
 * PHI. We also do an upfront ownership check on the member row to give
 * a 404 (not 403) for non-owned ids — consistent with the other PHI
 * routes in this app.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("memberId");

  if (!memberId) {
    return Response.json({ error: "memberId is required" }, { status: 400 });
  }

  try {
    const member = await getFamilyMemberById({ id: memberId });
    if (!member || member.userId !== session.user.id) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    const memories = await getHealthMemories({
      memberId,
      userId: session.user.id,
    });
    return Response.json(memories);
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to fetch health memories" },
      { status: 500 },
    );
  }
}

/**
 * POST — manual save of a long-term health memory. Same ownership check
 * as GET: the member must belong to the caller, and the upsert writes
 * `userId` (denormalized) for the same defense-in-depth reason.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { memberId, category, content } = await request.json();

    if (!memberId || !category || content === undefined) {
      return Response.json(
        { error: "memberId, category and content are required" },
        { status: 400 },
      );
    }

    const member = await getFamilyMemberById({ id: memberId });
    if (!member || member.userId !== session.user.id) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    const result = await upsertHealthMemory({
      memberId,
      userId: session.user.id,
      category,
      content,
      source: "manual",
    });

    return Response.json(result);
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to save health memory" },
      { status: 500 },
    );
  }
}
