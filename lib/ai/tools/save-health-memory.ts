import { tool } from "ai";
import { z } from "zod";
import {
  getHealthMemories,
  upsertHealthMemory,
} from "@/lib/db/queries";

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
    .describe(
      "Brief explanation of why this update is worth remembering. One short sentence."
    ),
  category: z
    .enum(HEALTH_MEMORY_CATEGORIES)
    .describe(
      "The memory category to update. Must be one of: health_profile, medical_history, medications_allergies, lifestyle_habits, instructions_preferences."
    ),
  content: z
    .string()
    .describe(
      "The COMPLETE consolidated prose block that REPLACES the existing content for this category. Merge any previously stored information with the new details — do NOT just append. Write it as a clinical summary, not a transcript."
    ),
});

export const saveHealthMemory = ({
  memberId,
}: {
  memberId: string;
}) =>
  tool({
    description:
      "Persist a long-term health memory for the active family member. Use this whenever the user shares or changes information about their health: medications, vitals, symptoms, allergies, diagnoses, lifestyle habits, or communication preferences. The `content` field must be a complete consolidated prose block that REPLACES the existing category content (merge prior info with new info). Call this tool proactively as soon as health-relevant details are mentioned, even if the user does not explicitly ask.",
    inputSchema: healthMemorySchema,
    execute: async (input) => {
      // Guard: if no member is bound to the chat, fail loudly. The LLM must
      // be honest about this and tell the user, not hallucinate success.
      if (!memberId) {
        return {
          status: "error" as const,
          category: input.category,
          reason: input.reason,
          message:
            "No active family member is selected for this conversation. Ask the user to pick a member (or set up a family workspace) before persisting health memory.",
          saved: false,
        };
      }

      try {
        // Re-fetch the existing block so we can return a diff summary in the
        // result. The LLM is far less likely to "lie" about what changed if
        // the tool surfaces a clear before/after.
        const existingRows = await getHealthMemories({ memberId });
        const existing = existingRows.find((m) => m.category === input.category);
        const priorContent = existing?.content ?? null;

        const result = await upsertHealthMemory({
          memberId,
          category: input.category,
          content: input.content,
          source: "agent",
        });

        if (!result.saved) {
          return {
            status: "unchanged" as const,
            category: input.category,
            reason: input.reason,
            saved: false,
            message:
              "The new content was identical to what was already stored — no update was needed.",
            priorContent,
            newContent: input.content,
          };
        }

        const categoryLabel = input.category.replace(/_/g, " ");

        return {
          status: "saved" as const,
          category: input.category,
          reason: input.reason,
          saved: true,
          message: `Successfully updated the ${categoryLabel} memory for this family member.`,
          priorContent,
          newContent: input.content,
          createdNew: !priorContent,
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown database error";
        console.error("saveHealthMemory failed:", err);
        return {
          status: "error" as const,
          category: input.category,
          reason: input.reason,
          saved: false,
          message: `Failed to save health memory: ${errorMessage}`,
          priorContent: null,
          newContent: input.content,
        };
      }
    },
  });

