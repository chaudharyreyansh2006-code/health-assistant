"use server";

import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";
import { createFamily, addFamilyMember } from "@/lib/db/queries";
import { revalidatePath } from "next/cache";

export async function createFamilyAction(name: string) {
  const session = await auth();
  if (!isRegularSession(session)) {
    throw new Error("Unauthorized");
  }
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("Family name is required");
  }

  const result = await createFamily({
    name: cleanName,
    createdBy: session.user.id,
  });

  revalidatePath("/family");
  return result;
}

export async function addFamilyMemberAction({
  familyId,
  name,
  relationship,
  dateOfBirth,
  gender,
}: {
  familyId: string;
  name: string;
  relationship: string;
  dateOfBirth?: string;
  gender?: string;
}) {
  const session = await auth();
  if (!isRegularSession(session)) {
    throw new Error("Unauthorized");
  }
  if (!name.trim()) {
    throw new Error("Name is required");
  }
  if (!relationship.trim()) {
    throw new Error("Relationship is required");
  }

  const result = await addFamilyMember({
    familyId,
    name: name.trim(),
    relationship: relationship.trim(),
    dateOfBirth: dateOfBirth || undefined,
    gender: gender || undefined,
  });

  revalidatePath(`/family/${familyId}`);
  return result;
}
