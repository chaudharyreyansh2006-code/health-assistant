import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteMedication,
  updateMedicationStatus,
} from "@/lib/db/queries";
import { isRegularSession } from "@/lib/auth/guards";

const patchSchema = z.object({
  status: z.enum(["active", "paused", "stopped", "completed"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await updateMedicationStatus({
    id,
    userId: session.user.id,
    status: parsed.data.status,
  });
  if (!updated) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.json({ medication: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const ok = await deleteMedication({ id, userId: session.user.id });
  if (!ok) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.json({ success: true, id });
}
