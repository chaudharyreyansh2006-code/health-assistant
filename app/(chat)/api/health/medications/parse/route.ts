import { generateText } from "ai";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { getLanguageModel } from "@/lib/ai/providers";
import { isRegularSession } from "@/lib/auth/guards";

export const maxDuration = 20;

// We accept anything the user typed and let the model extract a structured
// record. We intentionally do NOT use `ai`'s `generateObject` here because we
// want to be tolerant of messy LLM output (prose around the JSON, a leading
// "Here you go:" line, missing fences). Same pattern as the existing
// `requestHealthSuggestions` tool.
const parseSchema = z.object({
  drugName: z.string().min(1).max(160),
  brandName: z.string().max(160).nullable().optional(),
  doseValue: z.number().positive().max(10000),
  doseUnit: z.string().min(1).max(32),
  frequency: z
    .enum(["once-daily", "twice-daily", "thrice-daily", "as-needed"])
    .default("once-daily"),
  scheduleTimes: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM 24h"))
    .min(1)
    .max(8),
  withFood: z
    .enum(["before", "after", "with", "any"])
    .default("any"),
  notes: z.string().max(500).nullable().optional(),
});

type ParsedMedication = z.infer<typeof parseSchema>;

const PARSE_PROMPT = `You extract a medication schedule from a single free-text line the user typed. Examples:

- "Amlodipine 5 mg morning after breakfast, for dad" → { drugName: "Amlodipine", doseValue: 5, doseUnit: "mg", frequency: "once-daily", scheduleTimes: ["08:00"], withFood: "after" }
- "Metformin 500 mg twice daily" → { drugName: "Metformin", doseValue: 500, doseUnit: "mg", frequency: "twice-daily", scheduleTimes: ["08:00", "20:00"] }
- "Atorvastatin 10 mg at bedtime" → { drugName: "Atorvastatin", doseValue: 10, doseUnit: "mg", frequency: "once-daily", scheduleTimes: ["21:00"], withFood: "any" }
- "Paracetamol 650 mg as needed" → { drugName: "Paracetamol", doseValue: 650, doseUnit: "mg", frequency: "as-needed", scheduleTimes: ["12:00"] }
- "Tums 2 tablets with lunch" → { drugName: "Tums", doseValue: 2, doseUnit: "tablet", frequency: "once-daily", scheduleTimes: ["13:00"], withFood: "with" }

Rules:
- Time inference: morning → "08:00", afternoon → "13:00", evening → "18:00", night / bedtime → "21:00", lunch → "13:00", dinner → "20:00". Twice-daily defaults to ["08:00", "20:00"]; thrice-daily to ["08:00", "14:00", "20:00"].
- "after food" / "after meals" → withFood = "after". "before food" → "before". "with food" / "with meals" → "with". No mention → "any".
- "as needed" / "PRN" / "sos" → frequency = "as-needed" with a single representative slot (noon).
- If dose unit is missing but drug is taken as tablets, default to "tablet".
- Output ONLY a single JSON object matching the schema. No prose, no markdown fences, no commentary.

Text: """{INPUT}"""`;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const body = z
    .object({
      text: z.string().min(3).max(800),
      memberId: z.string().uuid().optional(),
    })
    .safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid input", details: body.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { text } = await generateText({
      // Use Flash for sub-second latency. The user is sitting in front of
      // a dialog waiting for a parse.
      model: getLanguageModel("gemini-3.1-flash-lite"),
      prompt: PARSE_PROMPT.replace("{INPUT}", body.data.text.trim()),
    });

    // Tolerant JSON extraction: strip fences, find the first { … } block,
    // try to parse it. If it still doesn't parse, surface a 422 with the
    // raw text so the client can show "couldn't parse" without lying about
    // success.
    const cleaned = text
      .replace(/```json\n?|\n?```/g, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const candidate =
      start !== -1 && end !== -1 && end > start
        ? cleaned.slice(start, end + 1)
        : cleaned;

    let parsed: ParsedMedication;
    try {
      const obj = JSON.parse(candidate);
      const result = parseSchema.safeParse(obj);
      if (!result.success) {
        return NextResponse.json(
          {
            error: "Could not parse that prescription.",
            details: result.error.flatten(),
            raw: text,
          },
          { status: 422 }
        );
      }
      parsed = result.data;
    } catch {
      return NextResponse.json(
        {
          error: "Could not parse that prescription.",
          raw: text,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ parsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[medications/parse] failed:", err);
    return NextResponse.json(
      { error: `Parser failed: ${message}` },
      { status: 500 }
    );
  }
}
