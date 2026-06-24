import { tool, generateText } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { getHealthMemories } from "@/lib/db/queries";

const healthSuggestionsSchema = z.object({
  focus: z
    .string()
    .describe(
      "The health topic or area to focus suggestions on, e.g. 'medication adherence', 'diet for diabetes', 'preventive screenings', or 'general wellness'"
    ),
});

export const requestHealthSuggestions = ({
  memberId,
}: {
  memberId: string;
}) =>
  tool({
    description:
      "Generate personalized health suggestions and follow-up action items for the family member based on their health profile, recent conversations, and medical best practices. Use when the user asks for health recommendations, a wellness check-in, or when proactive suggestions are contextually appropriate.",
    inputSchema: healthSuggestionsSchema,
    execute: async (input) => {
      // Load the member's health context for personalized suggestions
      const memories = await getHealthMemories({ memberId });

      const contextBlock = memories
        .map((m) => `[${m.category}]: ${m.content}`)
        .join("\n\n");

      const { text } = await generateText({
        model: getLanguageModel("gemini-2.5-flash"),
        prompt: `You are a health advisor. Based on the following health profile and the requested focus area, generate 3-5 specific, actionable health suggestions. Each suggestion should include:
- A clear action item
- Why it matters for this person specifically
- A priority level (high/medium/low)

Focus area: ${input.focus}

Health profile:
${contextBlock || "No health profile available yet. Provide general suggestions."}

Format as a JSON array of objects with fields: action, rationale, priority`,
      });

      try {
        // Try to parse structured output
        const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
        const suggestions = JSON.parse(cleaned);
        return {
          status: "success" as const,
          focus: input.focus,
          suggestions,
          count: suggestions.length,
        };
      } catch {
        // Fallback: return raw text if JSON parsing fails
        return {
          status: "success" as const,
          focus: input.focus,
          suggestions: text,
          count: 0,
        };
      }
    },
  });
