import { auth } from "@/app/(auth)/auth";
import { getFamiliesByUserId, getFamilyMembers } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const families = await getFamiliesByUserId({ userId: session.user.id });
    
    // Fetch members for each family
    const familiesWithMembers = await Promise.all(
      families.map(async (f) => {
        const members = await getFamilyMembers({ familyId: f.id });
        return {
          ...f,
          members,
        };
      })
    );

    return Response.json(familiesWithMembers);
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Failed to fetch families list" },
      { status: 500 }
    );
  }
}
