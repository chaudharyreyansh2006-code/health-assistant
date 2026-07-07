import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createMedication,
  getMedicationsByMemberId,
} from "@/lib/db/queries";
import { isRegularSession } from "@/lib/auth/guards";

const scheduleTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");

const createSchema = z.object({
  memberId: z.string().uuid(),
  drugName: z.string().min(1).max(160),
  brandName: z.string().max(160).optional(),
  doseValue: z.number().positive().max(10000),
  doseUnit: z.string().min(1).max(32),
  frequency: z.string().min(1).max(32),
  scheduleTimes: z.array(scheduleTimeSchema).min(1).max(8),
  withFood: z.enum(["before", "after", "with", "any"]).default("any"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  prescribedBy: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
  remainingQty: z.number().nonnegative().optional(),
  refillAt: z.string().optional(),
  pharmacy: z.string().max(160).optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberId = request.nextUrl.searchParams.get("memberId");
  if (!memberId) {
    return NextResponse.json(
      { error: "Missing memberId" },
      { status: 400 }
    );
  }

  const items = await getMedicationsByMemberId({
    memberId,
    userId: session.user.id,
  });
  return NextResponse.json({ medications: items });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { memberId, ...rest } = parsed.data;
  const created = await createMedication({
    memberId,
    userId: session.user.id,
    values: {
      drugName: rest.drugName,
      brandName: rest.brandName,
      doseValue: String(rest.doseValue),
      doseUnit: rest.doseUnit,
      frequency: rest.frequency,
      scheduleTimes: rest.scheduleTimes,
      withFood: rest.withFood,
      startDate: rest.startDate,
      endDate: rest.endDate,
      prescribedBy: rest.prescribedBy,
      notes: rest.notes,
      remainingQty:
        rest.remainingQty == null ? null : String(rest.remainingQty),
      refillAt: rest.refillAt,
      pharmacy: rest.pharmacy,
      status: "active",
    },
  });

  if (!created) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.json({ medication: created }, { status: 201 });
}
