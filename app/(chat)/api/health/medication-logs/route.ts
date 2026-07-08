import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getMedicationLogsForDay, upsertMedicationLog } from "@/lib/db/queries";
import { isRegularSession } from "@/lib/auth/guards";

const schema = z.object({
  medicationId: z.string().uuid(),
  memberId: z.string().uuid(),
  scheduledFor: z.string().datetime(),
  status: z.enum(["taken", "skipped", "missed", "snoozed"]),
  skipReason: z.string().max(64).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * GET — returns dose events for a member inside an optional [from, to) window.
 * Used by the Today screen to render the actual status (taken / skipped /
 * missed) next to each scheduled dose.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberId = request.nextUrl.searchParams.get("memberId");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!memberId || !from || !to) {
    return NextResponse.json(
      { error: "memberId, from, and to are required" },
      { status: 400 }
    );
  }

  const logs = await getMedicationLogsForDay({
    memberId,
    userId: session.user.id,
    dayStart: new Date(from),
    dayEnd: new Date(to),
  });
  return NextResponse.json({ logs });
}

/**
 * Records a dose event for a single scheduled slot. Idempotent — re-tapping
 * "Take" updates the same row rather than duplicating, thanks to the unique
 * (medicationId, scheduledFor) index on MedicationLog.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const log = await upsertMedicationLog({
    userId: session.user.id,
    medicationId: parsed.data.medicationId,
    memberId: parsed.data.memberId,
    scheduledFor: new Date(parsed.data.scheduledFor),
    status: parsed.data.status,
    skipReason: parsed.data.skipReason,
    notes: parsed.data.notes,
    source: "manual",
  });

  return NextResponse.json({ log });
}
