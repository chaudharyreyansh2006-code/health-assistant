import { auth } from "@/app/(auth)/auth";
import { getHealthMemories, upsertHealthMemory } from "@/lib/db/queries";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("memberId");

  if (!memberId) {
    return Response.json({ error: "memberId is required" }, { status: 400 });
  }

  try {
    const memories = await getHealthMemories({ memberId });
    return Response.json(memories);
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to fetch health memories" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { memberId, category, content } = await request.json();

    if (!memberId || !category || content === undefined) {
      return Response.json(
        { error: "memberId, category and content are required" },
        { status: 400 }
      );
    }

    const result = await upsertHealthMemory({
      memberId,
      category,
      content,
      source: "manual",
    });

    return Response.json(result);
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to save health memory" },
      { status: 500 }
    );
  }
}
