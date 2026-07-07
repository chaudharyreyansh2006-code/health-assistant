import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { createVital, getVitalsByMemberId } from "@/lib/db/queries";
import { isRegularSession } from "@/lib/auth/guards";

const vitalSchema = z.object({
  memberId: z.string().uuid(),
  type: z.enum(["bp", "glucose", "weight", "spo2", "hr", "temp", "sleep"]),
  recordedAt: z.string().datetime().optional(),
  value: z.number().nonnegative().optional(),
  unit: z.string().max(16).optional(),
  systolic: z.number().nonnegative().optional(),
  diastolic: z.number().nonnegative().optional(),
  pulse: z.number().nonnegative().optional(),
  context: z.string().max(32).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberId = request.nextUrl.searchParams.get("memberId");
  const type = request.nextUrl.searchParams.get("type") ?? undefined;
  const sinceParam = request.nextUrl.searchParams.get("since");
  if (!memberId) {
    return NextResponse.json(
      { error: "Missing memberId" },
      { status: 400 }
    );
  }
  const since = sinceParam ? new Date(sinceParam) : undefined;

  const items = await getVitalsByMemberId({
    memberId,
    userId: session.user.id,
    type,
    since,
  });
  return NextResponse.json({ vitals: items });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = vitalSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { memberId, recordedAt, ...rest } = parsed.data;
  const created = await createVital({
    memberId,
    userId: session.user.id,
    values: {
      type: rest.type,
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      value: rest.value == null ? null : String(rest.value),
      unit: rest.unit,
      systolic: rest.systolic == null ? null : String(rest.systolic),
      diastolic: rest.diastolic == null ? null : String(rest.diastolic),
      pulse: rest.pulse == null ? null : String(rest.pulse),
      context: rest.context,
      notes: rest.notes,
      source: "manual",
    },
  });

  if (!created) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.json({ vital: created }, { status: 201 });
}
