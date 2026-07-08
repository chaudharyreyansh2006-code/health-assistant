"use server";

import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";
import {
  addFamilyMember,
  deleteFamilyMemberById,
  setUserFamilyName,
} from "@/lib/db/queries";
import { revalidatePath } from "next/cache";

/**
 * Sets the user's family name. After migration 0004 there is no
 * `Family` table — the family name lives on the user row.
 *
 * Calling this with a new name effectively "renames" the family.
 */
export async function setUserFamilyNameAction(name: string) {
  const session = await auth();
  if (!isRegularSession(session)) {
    throw new Error("Unauthorized");
  }
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error("Family name is required");
  }
  if (cleanName.length > 100) {
    throw new Error("Family name is too long");
  }

  await setUserFamilyName({ userId: session.user.id, name: cleanName });
  revalidatePath("/family");
  revalidatePath("/");
}

export async function addFamilyMemberAction({
  name,
  relationship,
  dateOfBirth,
  gender,
}: {
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
    userId: session.user.id,
    name: name.trim(),
    relationship: relationship.trim(),
    dateOfBirth: dateOfBirth || undefined,
    gender: gender || undefined,
  });

  revalidatePath("/family");
  revalidatePath("/");
  return result;
}

/**
 * Hard-deletes a family member. The query function checks ownership via
 * the denormalized `FamilyMember.userId` column — if the caller doesn't
 * own the member, the delete is a no-op (returns `false`). We mirror
 * that as a thrown "Unauthorized" to keep the server action's failure
 * surface clear.
 */
export async function deleteFamilyMemberAction(memberId: string) {
  const session = await auth();
  if (!isRegularSession(session)) {
    throw new Error("Unauthorized");
  }

  const ok = await deleteFamilyMemberById({
    id: memberId,
    userId: session.user.id,
  });
  if (!ok) {
    throw new Error(
      "Member not found, or you don't have permission to delete it."
    );
  }

  revalidatePath("/family");
  revalidatePath("/");
}
