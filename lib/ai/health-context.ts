import "server-only";

import { eq, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { healthMemory } from "@/lib/db/schema";
import { embed } from "ai";
import { google } from "@ai-sdk/google";
import { similaritySearchChunks } from "@/lib/db/queries";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

const CATEGORY_LABELS: Record<string, string> = {
  health_profile: "Core Health Profile",
  medical_history: "Medical & Diagnostic History",
  medications_allergies: "Medications, Supplements & Allergies",
  lifestyle_habits: "Lifestyle & Daily Habits",
  instructions_preferences: "Formatting & Communication Preferences",
};

/**
 * Loads all long-term health memory blocks for a family member
 * and formats them as a system prompt section.
 */
export async function fetchHealthContext(
  memberId: string
): Promise<string> {
  const memories = await db
    .select({
      category: healthMemory.category,
      content: healthMemory.content,
    })
    .from(healthMemory)
    .where(eq(healthMemory.memberId, memberId))
    .orderBy(asc(healthMemory.category));

  if (!memories || memories.length === 0) return "";

  const promptParts = memories.map((m) => {
    const label = CATEGORY_LABELS[m.category] || m.category;
    return `## ${label}\n${m.content}`;
  });

  return `# ACTIVE HEALTH CONTEXT\n\n${promptParts.join("\n\n")}`;
}

/**
 * Performs pgvector similarity search on the member's medical document chunks
 * and formats matched content for prompt enrichment.
 */
export async function fetchDocumentContext({
  memberId,
  query,
}: {
  memberId: string;
  query: string;
}): Promise<string> {
  if (!query || !memberId) return "";

  try {
    const { embedding } = await embed({
      model: google.textEmbeddingModel("gemini-embedding-001"),
      value: query,
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });

    const chunks = await similaritySearchChunks({
      queryEmbedding: embedding,
      memberId,
      threshold: 0.35,
      limit: 4,
    });

    if (chunks.length === 0) return "";

    const contextParts = chunks.map(
      (c) => `[From Document: ${c.fileName} (Confidence: ${(c.similarity * 100).toFixed(1)}%)]\n${c.content}`
    );

    return `# RELEVANT MEDICAL RECORDS & REPORTS\n\n${contextParts.join("\n\n")}`;
  } catch (err) {
    console.error("Failed to fetch document context for RAG:", err);
    return "";
  }
}
