import { tool, generateText } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { getHealthMemories } from "@/lib/db/queries";

const healthSuggestionsSchema = z.object({
  focus: z
    .string()
    .min(3, "Focus area should be at least 3 characters")
    .max(200, "Focus area should be under 200 characters")
    .describe(
      "The health topic or area to focus suggestions on, e.g. 'medication adherence', 'diet for diabetes', 'preventive screenings', or 'general wellness'",
    ),
});

export const requestHealthSuggestions = ({
  memberId,
  userId,
}: {
  memberId: string;
  userId: string;
}) =>
  tool({
    description:
      "Generate personalized health suggestions and follow-up action items for the active family member based on their health profile, recent conversations, and medical best practices. Use when the user asks for health recommendations, a wellness check-in, or when proactive suggestions are contextually appropriate. Do NOT call this for emergencies — in emergencies, advise calling emergency services instead.",
    inputSchema: healthSuggestionsSchema,
    execute: async (input) => {
      // Guard: no active family member bound to this chat.
      if (!memberId) {
        return {
          status: "error" as const,
          focus: input.focus,
          suggestions: [],
          count: 0,
          message:
            "No active family member is selected. Ask the user to pick a member before generating suggestions.",
        };
      }

      try {
        // Load the member's health context for personalized suggestions.
        // `userId` gates the read so a forged memberId can't pull PHI from
        // a foreign user (defense in depth — the chat route also checks
        // ownership before exposing the tool).
        const memories = await getHealthMemories({ memberId, userId });

        const contextBlock = memories
          .map((m) => `[${m.category}]: ${m.content}`)
          .join("\n\n");

        const { text } = await generateText({
          model: getLanguageModel("gemini-3.1-flash-lite"),
          prompt: `You are a careful, evidence-based health advisor. Based on the following health profile and the requested focus area, generate 3-5 specific, actionable health suggestions for this family member.

Each suggestion must include:
- "action": a clear, concrete action item the user can take
- "rationale": why it matters for this person specifically (1-2 sentences)
- "priority": one of "high", "medium", or "low"

Rules:
- Tailor to the actual profile; do not give generic advice.
- If the profile is empty, provide general wellness guidance and clearly mark it as such.
- Output ONLY a JSON array. No markdown fences, no prose around it.

Focus area: ${input.focus}

Health profile:
${contextBlock || "No health profile available yet. Provide general suggestions and indicate that personalization will improve with more data."}`,
        });

        // Try to parse structured output. Be tolerant: strip fences, find
        // the first JSON array, and fall back to the raw text if that fails.
        const cleaned = text
          .replace(/```json\n?|\n?```/g, "")
          .trim();
        const arrayStart = cleaned.indexOf("[");
        const arrayEnd = cleaned.lastIndexOf("]");
        const jsonCandidate =
          arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart
            ? cleaned.slice(arrayStart, arrayEnd + 1)
            : cleaned;

        try {
          const parsed = JSON.parse(jsonCandidate);
          const suggestions = Array.isArray(parsed) ? parsed : [parsed];
          return {
            status: "success" as const,
            focus: input.focus,
            suggestions,
            count: suggestions.length,
            message: `Generated ${suggestions.length} suggestion(s) for: ${input.focus}`,
          };
        } catch {
          // Fallback: return raw text so the LLM can still surface the
          // suggestions inline without losing the work the model did.
          return {
            status: "success" as const,
            focus: input.focus,
            suggestions: text,
            count: 0,
            message:
              "Suggestions were generated but could not be parsed as structured data. Showing raw output.",
          };
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        console.error("requestHealthSuggestions failed:", err);
        return {
          status: "error" as const,
          focus: input.focus,
          suggestions: [],
          count: 0,
          message: `Failed to generate suggestions: ${errorMessage}`,
        };
      }
    },
  });
