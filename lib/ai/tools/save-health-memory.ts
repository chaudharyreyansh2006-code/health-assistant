import { tool } from "ai";
import { z } from "zod";
import { upsertHealthMemory } from "@/lib/db/queries";

export const HEALTH_MEMORY_CATEGORIES = [
  "health_profile",
  "medical_history",
  "medications_allergies",
  "lifestyle_habits",
  "instructions_preferences",
] as const;

const healthMemorySchema = z.object({
  reason: z
    .string()
    .describe("Brief explanation of why this update is worth remembering"),
  category: z
    .enum(HEALTH_MEMORY_CATEGORIES)
    .describe("The memory category to update"),
  content: z
    .string()
    .describe(
      "The complete consolidated prose representing the new summary block for this category. Must incorporate any previously known info and the new details."
    ),
});

export const saveHealthMemory = ({
  memberId,
}: {
  memberId: string;
}) =>
  tool({
    description:
      "Propose an update to the user's long-term health memory. Use when they share details about medications, vitals, allergies, diagnoses, lifestyle habits, or communication preferences. The content should be a complete consolidated prose block that replaces the existing category content.",
    inputSchema: healthMemorySchema,
    execute: async (input) => {
      const result = await upsertHealthMemory({
        memberId,
        category: input.category,
        content: input.content,
        source: "agent",
      });

      if (result.saved) {
        return {
          status: "saved" as const,
          category: input.category,
          reason: input.reason,
          message: `Health memory updated: ${input.category}`,
        };
      }

      return {
        status: "unchanged" as const,
        category: input.category,
        reason: input.reason,
        message: "Content was identical to existing memory — no update needed.",
      };
    },
  });
