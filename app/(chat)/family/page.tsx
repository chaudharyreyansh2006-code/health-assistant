import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";
import { redirect } from "next/navigation";
import { getFamilyByUserId, getFamilyMembers } from "@/lib/db/queries";
import { FamilyWorkspaceClient } from "./family-workspace-client";

export const metadata = {
  title: "Family | Sana Health",
  description: "Manage clinical context and documents for family members.",
};

type Props = {
  searchParams: Promise<{
    memberId?: string;
  }>;
};

export default async function FamilyPage({ searchParams }: Props) {
  const session = await auth();
  if (!isRegularSession(session)) {
    redirect("/login");
  }

  const [{ memberId }, family, members] = await Promise.all([
    searchParams,
    getFamilyByUserId({ userId: session.user.id }),
    getFamilyMembers({ userId: session.user.id }),
  ]);

  if (!family) {
    redirect("/login");
  }

  return (
    <FamilyWorkspaceClient
      familyName={family.name}
      initialActiveMemberId={memberId ?? null}
      initialMembers={members}
      userId={session.user.id}
    />
  );
}
