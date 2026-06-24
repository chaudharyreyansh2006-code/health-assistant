# Product Requirements Document (PRD): Family Health Assistant

This document outlines the product requirements, database schema, and detailed implementation code for a production-grade **Family Health Assistant** using **Next.js (App Router)**, **Neon Postgres** with **Drizzle ORM**, **NextAuth.js** (Auth), **Vercel Blob** (Storage), and the **Vercel AI SDK** with the **Google Gemini** provider (`@ai-sdk/google`).

---

## 1. Tech Stack & Infrastructure

*   **Frontend:** Next.js 16 (App Router, React 19, TailwindCSS 4, TypeScript)
*   **AI SDK:** Vercel AI SDK (`ai` package) with the `@ai-sdk/google` provider (running directly via your Google AI Studio Gemini API Key)
*   **LLM Model:** `gemini-2.5-flash` or `gemini-2.5-pro` (configured via Google AI provider)
*   **Database:** Neon serverless PostgreSQL with `pgvector` enabled for similarity search
*   **ORM:** Drizzle ORM (TypeScript schema and type-safe query builder)
*   **Auth:** NextAuth.js (v5 Beta)
*   **Storage:** Vercel Blob (for uploading medical reports, scans, and PDFs)
*   **Deployment:** Vercel

---

## 2. Database Schema (Drizzle ORM TypeScript Definitions)

The application partitions data by families and family members, maintaining a single-prose-block design for long-term health summaries, standard messaging logs, and vectorized chunks of uploaded health reports.

We extend the existing codebase's database schema ([lib/db/schema.ts](file:///c:/Users/harva/Videos/health-assistant/lib/db/schema.ts)) to include families, family members, health memories, medical documents, and vector chunks.

```typescript
// lib/db/schema.ts
import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
  customType,
} from "drizzle-orm/pg-core";

// Custom pgvector type for Drizzle
const pgVector = customType<{ data: number[] }>({
  dataType() {
    return "vector(768)"; // Vector size matching Gemini 'text-embedding-004'
  },
});

// Existing Users table (defined in codebase)
export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  name: text("name"),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

// NEW: Families - Grouping shared records for family rooms
export const families = pgTable("Family", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  createdBy: uuid("createdBy")
    .references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Family = InferSelectModel<typeof families>;

// NEW: Family Members - Individual members under a family workspace
export const familyMembers = pgTable("FamilyMember", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  familyId: uuid("familyId")
    .notNull()
    .references(() => families.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(), // 'self', 'spouse', 'child', 'parent', etc.
  dateOfBirth: timestamp("dateOfBirth"),
  gender: text("gender"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type FamilyMember = InferSelectModel<typeof familyMembers>;

// NEW: Health Memories - Long-term memory summaries (One prose block per category per member)
export const healthMemories = pgTable("HealthMemory", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  memberId: uuid("memberId")
    .notNull()
    .references(() => familyMembers.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 64 }).notNull(), // 'health_profile', 'medical_history', 'medications_allergies', 'lifestyle_habits', 'instructions_preferences'
  content: text("content").notNull(),
  source: varchar("source", { length: 32 }).notNull(), // 'agent', 'manual'
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type HealthMemory = InferSelectModel<typeof healthMemories>;

// Chat Sessions (extends existing Chat table in schema.ts)
export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  memberId: uuid("memberId")
    .references(() => familyMembers.id, { onDelete: "cascade" }), // Link to family member context
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  runningSummary: text("runningSummary").default(""), // Rolling dialogue summary
});

export type Chat = InferSelectModel<typeof chat>;

// Messages Table (Message_v2 in codebase)
export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(), // 'user', 'assistant'
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// NEW: Medical Documents - Uploaded medical scans / reports metadata
export const medicalDocuments = pgTable("MedicalDocument", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  memberId: uuid("memberId")
    .notNull()
    .references(() => familyMembers.id, { onDelete: "cascade" }),
  fileName: text("fileName").notNull(),
  url: text("url").notNull(), // Vercel Blob URL
  fileType: text("fileType").notNull(),
  uploadedAt: timestamp("uploadedAt").notNull().defaultNow(),
});

export type MedicalDocument = InferSelectModel<typeof medicalDocuments>;

// NEW: Document Chunks - Vectorized segments of medical documents for RAG
export const documentChunks = pgTable("DocumentChunk", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  documentId: uuid("documentId")
    .notNull()
    .references(() => medicalDocuments.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: pgVector("embedding"), // 768-dimension vector
});

export type DocumentChunk = InferSelectModel<typeof documentChunks>;
```

---

## 3. Core Memory Logic (Drizzle ORM implementation)

### A. Memory Query & Session System Prompt Injection
When starting a chat session for a family member, the server loads all active long-term memories from the database and inserts them into the system instruction of the Gemini model.

```typescript
// app/actions/chat-context.ts
import { db } from '@/lib/db/queries';
import { healthMemories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function fetchHealthContext(memberId: string): Promise<string> {
  const memories = await db
    .select({ category: healthMemories.category, content: healthMemories.content })
    .from(healthMemories)
    .where(eq(healthMemories.memberId, memberId));

  if (!memories || memories.length === 0) return '';

  const categoryLabels: Record<string, string> = {
    health_profile: 'Core Health Profile',
    medical_history: 'Medical & Diagnostic History',
    medications_allergies: 'Medications, Supplements & Allergies',
    lifestyle_habits: 'Lifestyle & Daily Habits',
    instructions_preferences: 'Formatting & Communication Preferences',
  };

  const promptParts = memories.map((m) => {
    const label = categoryLabels[m.category] || m.category;
    return `## ${label}\n${m.content}`;
  });

  return `# ACTIVE HEALTH CONTEXT\n\n${promptParts.join('\n\n')}`;
}
```

### B. Memory Save Logic (Consolidated Summary Overwrite Strategy)
Updates to long-term memory categories follow a single-prose-block lifecycle.
1.  **Normalize Content:** Trim whitespace and collapse repeating space characters.
2.  **Comparison Check:** If the normalized string matches the current value in the database, avoid running unnecessary database writes.
3.  **Overwrite:** Upsert or delete-insert the fresh consolidated summary block.

```typescript
// app/actions/save-memory.ts
import { db } from '@/lib/db/queries';
import { healthMemories } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

function normalizeMemoryContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

export async function saveHealthMemory(payload: {
  memberId: string;
  category: string;
  content: string;
  source: 'agent' | 'manual';
}) {
  const normalizedNew = normalizeMemoryContent(payload.content);

  // 1. Fetch current memory entry
  const [currentEntry] = await db
    .select({ id: healthMemories.id, content: healthMemories.content })
    .from(healthMemories)
    .where(
      and(
        eq(healthMemories.memberId, payload.memberId),
        eq(healthMemories.category, payload.category)
      )
    )
    .limit(1);

  if (currentEntry) {
    const normalizedCurrent = normalizeMemoryContent(currentEntry.content);
    // 2. Return early if content is unchanged
    if (normalizedCurrent === normalizedNew) {
      return { saved: false, reason: 'unchanged' };
    }

    // 3. Update existing
    await db
      .update(healthMemories)
      .set({
        content: payload.content,
        source: payload.source,
        updatedAt: new Date(),
      })
      .where(eq(healthMemories.id, currentEntry.id));
  } else {
    // 4. Create new
    await db.insert(healthMemories).values({
      memberId: payload.memberId,
      category: payload.category,
      content: payload.content,
      source: payload.source,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return { saved: true };
}
```

---

## 4. Vercel AI SDK Integration & Tool Approvals

The app uses the **Vercel AI SDK (`ai`)**. Memory updates are cooperative. When the model detects changes in the user's profile, it calls the `save_health_memory` tool. The client intercepts this tool call, displays a UI confirmation card, and only executes the database write upon manual confirmation by the user.

### A. Next.js API Route (Vercel AI SDK & Tool Definition)

```typescript
// app/api/chat/route.ts
import { streamText, tool } from 'ai';
import { google } from '@ai-sdk/google'; // Import direct google provider
import { fetchHealthContext } from '@/app/actions/chat-context';
import { auth } from '@/app/(auth)/auth';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages, memberId, id: chatId } = await req.json();

  // 1. Verify Authentication
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Fetch the active health context for this member
  const healthContext = await fetchHealthContext(memberId);
  const systemInstruction = `You are a professional Family Health Assistant. If the user shares new personal parameters (medications, vitals, allergic episodes, lifestyles), update their profile block using save_health_memory. Always prioritize clinical accuracy.

${healthContext}`;

  // 3. Initiate the Stream
  const result = streamText({
    model: google('gemini-2.5-flash'),
    messages,
    system: systemInstruction,
    tools: {
      save_health_memory: tool({
        description: 'Propose an update to the user\'s long-term health memory categories. Use when they share details about drugs, habits, histories, or core profiles.',
        parameters: z.object({
          reason: z.string().describe('Brief explanation of why this update is worth remembering'),
          category: z.enum([
            'health_profile',
            'medical_history',
            'medications_allergies',
            'lifestyle_habits',
            'instructions_preferences'
          ]).describe('The memory category to overwrite'),
          content: z.string().describe('The complete consolidated prose representing the new summary block.')
        }),
        // Execute is left empty or returns state because it requires user confirmation in the UI
        execute: async (args) => {
          return { ...args, status: 'requires-approval' };
        }
      })
    }
  });

  return result.toDataStreamResponse();
}
```

### B. React Frontend UI (Vercel AI SDK `useChat` Integration)

The frontend uses the Vercel AI SDK's client hooks. When a tool call is received, the client intercepts the `toolCalls` state and shows a confirmation card.

```tsx
// app/components/ChatInterface.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { saveHealthMemory } from '@/app/actions/save-memory';
import { useState } from 'react';

export default function ChatInterface({ memberId }: { memberId: string }) {
  const [isSaving, setIsSaving] = useState(false);
  
  const { messages, input, handleInputChange, handleSubmit, setMessages } = useChat({
    api: '/api/chat',
    body: { memberId },
    maxSteps: 5, // Enable multi-step tool calls
  });

  // Extract pending tool calls that require approval
  const lastMessage = messages[messages.length - 1];
  const pendingToolCalls = lastMessage?.toolCalls?.filter(
    (tc) => tc.toolName === 'save_health_memory'
  );

  const handleToolConfirm = async (toolCallId: string, args: any, approved: boolean) => {
    setIsSaving(true);
    try {
      if (approved) {
        await saveHealthMemory({
          memberId,
          category: args.category,
          content: args.content,
          source: 'agent',
        });
      }

      // Update UI state to show approval or rejection
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id === lastMessage.id) {
            return {
              ...msg,
              toolCalls: msg.toolCalls?.map((tc) =>
                tc.toolCallId === toolCallId
                  ? { ...tc, result: approved ? 'Approved & Saved' : 'Skipped by User' }
                  : tc
              ),
            };
          }
          return msg;
        })
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4 bg-slate-950 text-slate-100">
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.map((m) => (
          <div key={m.id} className="space-y-1">
            <span className={`text-xs ${m.role === 'user' ? 'text-blue-400' : 'text-emerald-400'}`}>
              {m.role === 'user' ? 'User' : 'Assistant'}
            </span>
            <div className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-sm leading-relaxed whitespace-pre-wrap">
              {m.content}
            </div>

            {/* Render any grounding sources/citations metadata */}
            {m.annotations && m.annotations.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {m.annotations.map((ann: any, idx) => (
                  <a
                    key={idx}
                    href={ann.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/25 hover:bg-blue-500/20"
                  >
                    {ann.title || 'Source'}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* User confirmation card for proposed memory saves */}
        {pendingToolCalls?.map((tc) => {
          const args = tc.args as any;
          return (
            <div key={tc.toolCallId} className="border border-amber-500/30 rounded-lg p-3 bg-amber-500/5 my-2">
              <div className="text-xs font-semibold text-amber-400 mb-1">
                Confirm Profile Update ({args.category})
              </div>
              <p className="text-xs text-slate-400 mb-2">Reason: "{args.reason}"</p>
              <div className="bg-slate-950 p-2 text-xs rounded border border-slate-800 mb-3 max-h-40 overflow-y-auto">
                {args.content}
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  disabled={isSaving}
                  onClick={() => handleToolConfirm(tc.toolCallId, args, false)}
                  className="px-2.5 py-1 text-xs border border-slate-700 rounded hover:bg-slate-800 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  disabled={isSaving}
                  onClick={() => handleToolConfirm(tc.toolCallId, args, true)}
                  className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-500 rounded text-white font-medium disabled:opacity-50"
                >
                  Approve & Save
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="Ask a health question or record vitals..."
          className="flex-1 bg-slate-900 border border-slate-800 rounded px-3 py-2 text-sm outline-none focus:border-slate-700"
        />
        <button type="submit" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-semibold">
          Send
        </button>
      </form>
    </div>
  );
}
```

---

## 5. Cost-Effective, High-Performance Chat History

### Strategy A: Sliding Window + Rolling Context Summary
To manage token usage and latency:
*   Only the active long-term context summaries, the rolling conversation summary, and the last **8 messages** are sent to the LLM.
*   An asynchronous Next.js worker compresses older history and updates the `runningSummary` column in the `Chat` table.

```typescript
// app/actions/summarize-session.ts
import { db } from '@/lib/db/queries';
import { chat, message } from '@/lib/db/schema';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { eq, asc } from 'drizzle-orm';

export async function compressSessionHistory(chatId: string) {
  // 1. Fetch all raw messages for the chat session
  const messages = await db
    .select()
    .from(message)
    .where(eq(message.chatId, chatId))
    .orderBy(asc(message.createdAt));

  if (!messages || messages.length <= 10) return;

  // 2. Keep the last 8 messages raw, extract older messages for summarization
  const messagesToSummarize = messages.slice(0, messages.length - 8);
  const formattedTranscript = messagesToSummarize
    .map((m) => {
      // Handles parsing simple text contents from raw JSON records
      const textVal = typeof m.parts === 'string' ? m.parts : JSON.stringify(m.parts);
      return `${m.role === 'user' ? 'User' : 'Assistant'}: ${textVal}`;
    })
    .join('\n');

  // 3. Load the previous rolling summary
  const [chatSession] = await db
    .select({ runningSummary: chat.runningSummary })
    .from(chat)
    .where(eq(chat.id, chatId))
    .limit(1);

  const prevSummary = chatSession?.runningSummary ? `Previous Summary:\n${chatSession.runningSummary}\n\n` : '';

  // 4. Request summary update from Gemini
  const { text } = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: `Review the following running dialogue summary and the new transcript segment. Update the summary to incorporate the new details as a bulleted log. Keep it brief and focused on medical concerns, symptoms, advice given, and follow-ups.

${prevSummary}New Segment:
${formattedTranscript}

Updated Summary:`,
  });

  // 5. Update the runningSummary in the chat session
  await db
    .update(chat)
    .set({ runningSummary: text })
    .where(eq(chat.id, chatId));
}
```

### B. Vercel Blob + Drizzle pgvector RAG for Uploaded Medical Reports
1.  **Storage:** Files are uploaded to Vercel Blob (`put()` from `@vercel/blob`), and their URLs are stored in `MedicalDocument`.
2.  **Chunking & Embeddings:** Text is extracted, split into ~500 character chunks, and embedded via `@ai-sdk/google`'s embedding model (e.g., `text-embedding-004`).
3.  **Vector Store:** Chunks and 768-dimension vectors are saved in the `DocumentChunk` table.
4.  **Similarity Search:** When the user asks a question, the vector similarity search finds matching document chunks.

```typescript
// app/actions/query-rag.ts
import { db } from '@/lib/db/queries';
import { documentChunks, medicalDocuments } from '@/lib/db/schema';
import { embed } from 'ai';
import { google } from '@ai-sdk/google';
import { eq, sql } from 'drizzle-orm';

export async function fetchDocumentContext(memberId: string, userQuery: string): Promise<string> {
  // 1. Generate text embedding vector using the SDK
  const { embedding } = await embed({
    model: google.textEmbeddingModel('text-embedding-004'),
    value: userQuery,
  });

  // 2. Query the Neon database using cosine distance (<=> operator in pgvector)
  const similarityThreshold = 0.4; // 1 - cosine_distance >= threshold
  
  // Drizzle syntax for vector similarity search
  const matchedChunks = await db
    .select({
      content: documentChunks.content,
      fileName: medicalDocuments.fileName,
      similarity: sql<number>`1 - (${documentChunks.embedding} <=> ${sql.raw(`ARRAY[${embedding.join(',')}]::vector`)})`
    })
    .from(documentChunks)
    .innerJoin(medicalDocuments, eq(documentChunks.documentId, medicalDocuments.id))
    .where(
      sql`1 - (${documentChunks.embedding} <=> ${sql.raw(`ARRAY[${embedding.join(',')}]::vector`)}) > ${similarityThreshold} AND ${medicalDocuments.memberId} = ${memberId}`
    )
    .orderBy(sql`${documentChunks.embedding} <=> ${sql.raw(`ARRAY[${embedding.join(',')}]::vector`)}`)
    .limit(3);

  if (!matchedChunks || matchedChunks.length === 0) return '';

  const matchedTexts = matchedChunks.map(
    (c) => `[From Document: ${c.fileName}] (Similarity: ${Math.round(c.similarity * 100)}%): "${c.content}"`
  );

  return `### Relevant Medical Document Context:\n${matchedTexts.join('\n\n')}`;
}
```

---

## 6. Gemini Grounding & Web Search

To get real-time medical facts, the assistant uses Gemini Search Grounding.
*   **Vercel AI SDK Integration:** Search grounding is configured directly on the model call by enabling search settings if supported by the provider, or using a search tool when available.
*   **Web Results:** The web pages consulted are annotated and displayed under the messages as source credentials for medical safety.
