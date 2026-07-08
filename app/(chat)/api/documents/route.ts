import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";
import { getMedicalDocumentsByMemberId } from "@/lib/db/queries";

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
    const docs = await getMedicalDocumentsByMemberId({
      memberId,
      userId: session.user.id,
    });
    return Response.json(docs);
  } catch (err: any) {
    return Response.json({ error: err.message || "Failed to fetch documents" }, { status: 500 });
  }
}
