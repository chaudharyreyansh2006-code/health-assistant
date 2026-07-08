import { tool } from "ai";
import { z } from "zod";
import {
  getFamilyMemberById,
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
      "Brief explanation of why this update is worth remembering. One short sentence.",
    ),
  category: z
    .enum(HEALTH_MEMORY_CATEGORIES)
    .describe(
      "The memory category to update. Must be one of: health_profile, medical_history, medications_allergies, lifestyle_habits, instructions_preferences.",
    ),
  content: z
    .string()
    .min(1, "content cannot be empty")
    .describe(
      "The COMPLETE consolidated prose block that REPLACES the existing content for this category. Merge any previously stored information with the new details — do NOT just append. Write it as a clinical summary, not a transcript.",
    ),
});

/**
 * Maps a Postgres error code to a friendly, actionable message. The AI is
 * expected to relay this message verbatim to the user instead of inventing
 * a plausible-sounding excuse when the save fails.
 */
function explainDbError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  switch (e?.code) {
    case "23503":
      return "The selected family member no longer exists. Ask the user to refresh and pick a member from the family workspace.";
    case "23502":
      return "A required field was missing on the memory record. Please try again.";
    case "23514":
      return "The memory record violated a database constraint. Please try again.";
    case "22P02":
      return "The member id was malformed. Please refresh and try again.";
    default:
      return e?.message
        ? `Database error: ${e.message}`
        : "Unknown database error.";
  }
}

export const saveHealthMemory = ({
  memberId,
  userId,
}: {
  memberId: string;
  userId: string;
}) =>
  tool({
    description:
      "Persist a long-term health memory for the active family member. Use this whenever the user shares or changes information about their health: medications, vitals, symptoms, allergies, diagnoses, lifestyle habits, or communication preferences. The `content` field must be a complete consolidated prose block that REPLACES the existing category content (merge prior info with new info). Call this tool proactively as soon as health-relevant details are mentioned, even if the user does not explicitly ask. The tool name is exactly `saveHealthMemory` (camelCase).",
    inputSchema: healthMemorySchema,
    execute: async (input) => {
      // Guard 1: no memberId at all.
      if (!memberId) {
        return {
          status: "error" as const,
          category: input.category,
          reason: input.reason,
          saved: false,
          message:
            "No active family member is selected for this conversation. Ask the user to pick a member (or set up a family workspace) before persisting health memory.",
          priorContent: null,
          newContent: input.content,
        };
      }

      // Guard 2: verify the memberId actually exists. A stale chat or stale
      // local state can hold a UUID for a member that was deleted, which
      // would otherwise surface as a generic FK violation toast.
      let memberExists = true;
      try {
        const member = await getFamilyMemberById({ id: memberId });
        memberExists = !!member;
      } catch (err) {
        console.error("[saveHealthMemory] failed to verify member:", err);
        return {
          status: "error" as const,
          category: input.category,
          reason: input.reason,
          saved: false,
          message: `Could not verify the active family member: ${explainDbError(err)}`,
          priorContent: null,
          newContent: input.content,
        };
      }

      if (!memberExists) {
        return {
          status: "error" as const,
          category: input.category,
          reason: input.reason,
          saved: false,
          message:
            "The active family member no longer exists. Ask the user to pick a member from the family workspace, then try again.",
          priorContent: null,
          newContent: input.content,
        };
      }

      // Re-fetch the existing block so the LLM sees a clear before/after.
      let priorContent: string | null = null;
      try {
        const existingRows = await getHealthMemories({
          memberId,
          userId,
        });
        const existing = existingRows.find(
          (m) => m.category === input.category,
        );
        priorContent = existing?.content ?? null;
      } catch (err) {
        console.error(
          "[saveHealthMemory] failed to read existing memory:",
          err,
        );
        // Non-fatal: we can still attempt the upsert.
      }

      try {
        const result = await upsertHealthMemory({
          memberId,
          userId,
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
        const friendly = explainDbError(err);
        console.error("[saveHealthMemory] upsert failed:", err);
        return {
          status: "error" as const,
          category: input.category,
          reason: input.reason,
          saved: false,
          message: `Failed to save: ${friendly}`,
          priorContent,
          newContent: input.content,
        };
      }
    },
  });

