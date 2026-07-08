import { tool } from "ai";
import { z } from "zod";
import {
  getFamilyMemberById,
  getMedicationLogsForDay,
  getMedicationsByMemberId,
  getVitalsByMemberId,
} from "@/lib/db/queries";

const queryHealthDataSchema = z.object({
  question: z
    .string()
    .min(3, "Question should be at least 3 characters")
    .max(500)
    .describe(
      "The user's natural-language question, e.g. 'Did dad take his morning pill?' or 'What was his BP last week?'. Echoed back in the response so the model can reference the same wording.",
    ),
  scope: z
    .enum(["all", "medications", "vitals"])
    .default("all")
    .describe(
      "Limit the lookup. 'medications' = medication schedule + dose logs. 'vitals' = recent readings. 'all' (default) = both.",
    ),
  lookbackDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(7)
    .describe(
      "How many days of history to scan. Defaults to 7 (one week). For trend questions the model can ask for 30 or 90.",
    ),
});

/**
 * Maps a Postgres error code to a friendly, actionable message. Same
 * pattern as `saveHealthMemory` — never let the LLM silently paper over
 * a real DB failure.
 */
function explainDbError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  switch (e?.code) {
    case "23503":
      return "The active family member no longer exists. Ask the user to refresh and pick a member from the family workspace.";
    case "22P02":
      return "The member id was malformed. Please refresh and try again.";
    default:
      return e?.message
        ? `Database error: ${e.message}`
        : "Unknown database error.";
  }
}

type DoseStatus = "taken" | "skipped" | "missed" | "snoozed";

type DoseEventLite = {
  medicationId: string;
  drugName: string;
  scheduledFor: string;
  status: DoseStatus | null;
  takenAt: string | null;
};

type MedicationLite = {
  id: string;
  drugName: string;
  brandName: string | null;
  doseValue: string;
  doseUnit: string;
  scheduleTimes: string[];
  withFood: string;
  status: string;
};

type VitalLite = {
  id: string;
  type: string;
  recordedAt: string;
  value: string | null;
  unit: string | null;
  systolic: string | null;
  diastolic: string | null;
  pulse: string | null;
  context: string | null;
};

type VitalStat = {
  type: string;
  count: number;
  latest?: VitalLite;
  averageValue?: number | null;
  averageSystolic?: number | null;
  averageDiastolic?: number | null;
};

function isoDayBounds(daysAgo: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function summarizeVitals(rows: VitalLite[]): VitalStat[] {
  const byType = new Map<string, VitalLite[]>();
  for (const v of rows) {
    if (!byType.has(v.type)) {
      byType.set(v.type, []);
    }
    byType.get(v.type)!.push(v);
  }
  const out: VitalStat[] = [];
  for (const [type, list] of byType) {
    const values = list
      .map((v) => (v.value == null ? null : Number(v.value)))
      .filter((n): n is number => Number.isFinite(n));
    const sys = list
      .map((v) => (v.systolic == null ? null : Number(v.systolic)))
      .filter((n): n is number => Number.isFinite(n));
    const dia = list
      .map((v) => (v.diastolic == null ? null : Number(v.diastolic)))
      .filter((n): n is number => Number.isFinite(n));
    out.push({
      type,
      count: list.length,
      latest: list[0],
      averageValue: values.length
        ? Number(
            (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
          )
        : null,
      averageSystolic: sys.length
        ? Number((sys.reduce((a, b) => a + b, 0) / sys.length).toFixed(2))
        : null,
      averageDiastolic: dia.length
        ? Number((dia.reduce((a, b) => a + b, 0) / dia.length).toFixed(2))
        : null,
    });
  }
  return out;
}

export const queryHealthData = ({
  memberId,
  userId,
}: {
  memberId: string;
  userId: string;
}) =>
  tool({
    description:
      "Read the structured medication schedule, dose logs, and recent vitals for the ACTIVE family member. Use this when the user asks factual questions about adherence, BP / glucose trends, or anything that needs the actual numbers. The `content` of `HealthMemory` is already in the system prompt; reach for THIS tool when you need live, row-level data. Do NOT use it for emergencies — in emergencies, advise calling emergency services. The tool name is exactly `queryHealthData` (camelCase).",
    inputSchema: queryHealthDataSchema,
    execute: async (input) => {
      // Guard 1: no memberId bound to this chat. We surface an explicit,
      // friendly error so the LLM doesn't fabricate an answer.
      if (!memberId) {
        return {
          status: "error" as const,
          question: input.question,
          scope: input.scope,
          lookbackDays: input.lookbackDays,
          message:
            "No active family member is selected for this conversation. Ask the user to pick a member (or set up a family workspace) before querying health data.",
        };
      }

      // Guard 2: verify the member still exists. A stale chat / local
      // state can carry a UUID for a member that was deleted.
      let memberExists = true;
      try {
        const member = await getFamilyMemberById({ id: memberId });
        memberExists = !!member;
      } catch (err) {
        console.error("[queryHealthData] failed to verify member:", err);
        return {
          status: "error" as const,
          question: input.question,
          scope: input.scope,
          lookbackDays: input.lookbackDays,
          message: `Could not verify the active family member: ${explainDbError(err)}`,
        };
      }

      if (!memberExists) {
        return {
          status: "error" as const,
          question: input.question,
          scope: input.scope,
          lookbackDays: input.lookbackDays,
          message:
            "The active family member no longer exists. Ask the user to pick a member from the family workspace and try again.",
        };
      }

      const { start, end } = isoDayBounds(input.lookbackDays);
      const includeMeds = input.scope !== "vitals";
      const includeVitals = input.scope !== "medications";

      let medications: MedicationLite[] = [];
      let recentDoses: DoseEventLite[] = [];
      let vitals: VitalLite[] = [];
      let vitalStats: VitalStat[] = [];
      const errors: string[] = [];

      // ----- Medications + dose logs -----
      if (includeMeds) {
        try {
          const medsRaw = await getMedicationsByMemberId({
            memberId,
            userId,
          });
          medications = medsRaw
            .filter((m) => m.status === "active")
            .map((m) => ({
              id: m.id,
              drugName: m.drugName,
              brandName: m.brandName ?? null,
              doseValue: String(m.doseValue),
              doseUnit: m.doseUnit,
              scheduleTimes: m.scheduleTimes ?? [],
              withFood: m.withFood,
              status: m.status,
            }));

          // Walk each day in the window once. We pull the day's logs and
          // join them to the active medications to project scheduled slots.
          const medById = new Map(medications.map((m) => [m.id, m]));
          const dayMs = 24 * 60 * 60 * 1000;
          for (
            let dayStart = new Date(start);
            dayStart.getTime() < end.getTime();
            dayStart = new Date(dayStart.getTime() + dayMs)
          ) {
            const dayEnd = new Date(dayStart.getTime() + dayMs);
            try {
              const logs = await getMedicationLogsForDay({
                memberId,
                userId,
                dayStart,
                dayEnd,
              });
              for (const med of medications) {
                for (const hhmm of med.scheduleTimes) {
                  const [h, m] = hhmm.split(":").map((n) => Number(n));
                  if (!Number.isFinite(h) || !Number.isFinite(m)) {
                    continue;
                  }
                  const slot = new Date(dayStart);
                  slot.setHours(h, m, 0, 0);
                  const iso = slot.toISOString();
                  const log = logs.find(
                    (l) =>
                      l.medicationId === med.id &&
                      l.scheduledFor.toISOString() === iso,
                  );
                  recentDoses.push({
                    medicationId: med.id,
                    drugName: med.drugName,
                    scheduledFor: iso,
                    status: (log?.status as DoseStatus | undefined) ?? null,
                    takenAt: log?.takenAt
                      ? log.takenAt.toISOString()
                      : null,
                  });
                }
              }
              // Suppress unused-var warning when logs is empty.
              void medById;
            } catch (err) {
              errors.push(
                `medicationLogs(${dayStart.toISOString().slice(0, 10)}): ${explainDbError(err)}`,
              );
            }
          }

          // Sort most-recent first so the model sees "today" at the top.
          recentDoses.sort(
            (a, b) =>
              new Date(b.scheduledFor).getTime() -
              new Date(a.scheduledFor).getTime(),
          );
        } catch (err) {
          errors.push(`medications: ${explainDbError(err)}`);
        }
      }

      // ----- Vitals -----
      if (includeVitals) {
        try {
          const vitalsRaw = await getVitalsByMemberId({
            memberId,
            userId,
            since: start,
            limit: 500,
          });
          vitals = vitalsRaw.map((v) => ({
            id: v.id,
            type: v.type,
            recordedAt: v.recordedAt.toISOString(),
            value: v.value == null ? null : String(v.value),
            unit: v.unit ?? null,
            systolic: v.systolic == null ? null : String(v.systolic),
            diastolic: v.diastolic == null ? null : String(v.diastolic),
            pulse: v.pulse == null ? null : String(v.pulse),
            context: v.context ?? null,
          }));
          vitalStats = summarizeVitals(vitals);
        } catch (err) {
          errors.push(`vitals: ${explainDbError(err)}`);
        }
      }

      // Build a short prose summary the LLM can quote directly without
      // doing arithmetic itself. This is the single thing the model is
      // most likely to read first.
      const proseLines: string[] = [];
      if (includeMeds) {
        const taken = recentDoses.filter((d) => d.status === "taken").length;
        const skipped = recentDoses.filter((d) => d.status === "skipped")
          .length;
        const missed = recentDoses.filter((d) => d.status === "missed").length;
        const scheduled = recentDoses.length;
        proseLines.push(
          `Medication adherence over the last ${input.lookbackDays} day(s): ${taken}/${scheduled} doses taken, ${skipped} skipped, ${missed} missed. Active medications: ${medications.map((m) => m.drugName).join(", ") || "none"}.`,
        );
      }
      if (includeVitals) {
        for (const s of vitalStats) {
          const parts: string[] = [`${s.type}: ${s.count} reading(s)`];
          if (s.averageSystolic != null && s.averageDiastolic != null) {
            parts.push(
              `avg ${s.averageSystolic}/${s.averageDiastolic}`,
              `latest ${s.latest?.systolic ?? "?"}/${s.latest?.diastolic ?? "?"}`,
            );
          } else if (s.averageValue != null) {
            parts.push(
              `avg ${s.averageValue} ${s.latest?.unit ?? ""}`.trim(),
              `latest ${s.latest?.value ?? "?"} ${s.latest?.unit ?? ""}`.trim(),
            );
          }
          proseLines.push(parts.join(" · "));
        }
        if (vitalStats.length === 0) {
          proseLines.push(`No vitals logged in the last ${input.lookbackDays} day(s).`);
        }
      }

      return {
        status:
          errors.length > 0 && medications.length === 0 && vitals.length === 0
            ? ("error" as const)
            : ("ok" as const),
        question: input.question,
        scope: input.scope,
        lookbackDays: input.lookbackDays,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        medications,
        recentDoses,
        vitals,
        vitalStats,
        summary: proseLines.join("\n"),
        ...(errors.length > 0 ? { warnings: errors } : {}),
        message:
          errors.length > 0
            ? `Partial result. ${errors.length} sub-query warning(s). Treat any missing section as "no data" rather than "no issue".`
            : `Looked back ${input.lookbackDays} day(s) across ${includeMeds && includeVitals ? "medications and vitals" : includeMeds ? "medications" : "vitals"}.`,
      };
    },
  });
