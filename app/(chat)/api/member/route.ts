import { auth } from "@/app/(auth)/auth";
import { getFamilyMemberById } from "@/lib/db/queries";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const member = await getFamilyMemberById({ id });
    if (!member) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }
    return Response.json(member);
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to fetch member details" },
      { status: 500 }
    );
  }
}
