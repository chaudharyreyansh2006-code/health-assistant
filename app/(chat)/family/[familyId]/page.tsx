import { auth } from "@/app/(auth)/auth";
import { redirect } from "next/navigation";
import { getFamilyById, getFamilyMembers } from "@/lib/db/queries";
import { FamilyWorkspaceClient } from "./family-workspace-client";

export const metadata = {
  title: "Family Workspace | Health Assistant",
  description: "Manage clinical context and documents for family members.",
};

type Props = {
  params: Promise<{
    familyId: string;
  }>;
};

export default async function FamilyWorkspacePage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { familyId } = await params;

  const [family, members] = await Promise.all([
    getFamilyById({ id: familyId }),
    getFamilyMembers({ familyId }),
  ]);

  if (!family) {
    redirect("/family");
  }

  // Ensure the logged-in user is the owner of the family group
  if (family.createdBy !== session.user.id) {
    redirect("/family");
  }

  return (
    <FamilyWorkspaceClient
      family={family}
      initialMembers={members}
    />
  );
}
