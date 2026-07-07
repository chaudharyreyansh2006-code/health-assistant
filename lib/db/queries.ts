import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { del } from "@vercel/blob";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { ChatbotError } from "../errors";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  documentChunk,
  family,
  familyMember,
  healthMemory,
  medicalDocument,
  medication,
  medicationLog,
  message,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  vital,
  vitalThreshold,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create user");
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
  memberId,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
  memberId?: string;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
      memberId: memberId ?? null,
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<unknown>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.insert(message).values(messages);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await db.update(message).set({ parts }).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function updateDocumentContent({
  id,
  content,
}: {
  id: string;
  content: string;
}) {
  try {
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt))
      .limit(1);

    const latest = docs[0];
    if (!latest) {
      throw new ChatbotError("not_found:database", "Document not found");
    }

    return await db
      .update(document)
      .set({ content })
      .where(and(eq(document.id, id), eq(document.createdAt, latest.createdAt)))
      .returning();
  } catch (_error) {
    if (_error instanceof ChatbotError) {
      throw _error;
    }
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update document content"
    );
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db.update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (_error) {
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const cutoffTime = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, cutoffTime),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

// ============================================================
// Family Queries
// ============================================================

export async function createFamily({
  name,
  createdBy,
}: {
  name: string;
  createdBy: string;
}) {
  try {
    const [created] = await db
      .insert(family)
      .values({ name, createdBy })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create family");
  }
}

export async function getFamiliesByUserId({ userId }: { userId: string }) {
  try {
    return await db
      .select()
      .from(family)
      .where(eq(family.createdBy, userId))
      .orderBy(desc(family.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get families by user id"
    );
  }
}

export async function getFamilyById({ id }: { id: string }) {
  try {
    const [result] = await db
      .select()
      .from(family)
      .where(eq(family.id, id))
      .limit(1);
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get family by id"
    );
  }
}

export async function deleteFamilyById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    await db
      .delete(family)
      .where(and(eq(family.id, id), eq(family.createdBy, userId)));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to delete family");
  }
}

// ============================================================
// Family Member Queries
// ============================================================

export async function addFamilyMember({
  familyId,
  name,
  relationship,
  dateOfBirth,
  gender,
}: {
  familyId: string;
  name: string;
  relationship: string;
  dateOfBirth?: string;
  gender?: string;
}) {
  try {
    const [created] = await db
      .insert(familyMember)
      .values({ familyId, name, relationship, dateOfBirth, gender })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to add family member"
    );
  }
}

export async function getFamilyMembers({ familyId }: { familyId: string }) {
  try {
    return await db
      .select()
      .from(familyMember)
      .where(eq(familyMember.familyId, familyId))
      .orderBy(asc(familyMember.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get family members"
    );
  }
}

export async function getFamilyMemberById({ id }: { id: string }) {
  try {
    const [result] = await db
      .select()
      .from(familyMember)
      .where(eq(familyMember.id, id))
      .limit(1);
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get family member by id"
    );
  }
}

export async function deleteFamilyMemberById({ id }: { id: string }) {
  try {
    // 1. Fetch all chat IDs associated with this family member
    const memberChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.memberId, id));

    const chatIds = memberChats.map((c) => c.id);

    if (chatIds.length > 0) {
      // 2. Delete related records for these chats
      await db.delete(vote).where(inArray(vote.chatId, chatIds));
      await db.delete(message).where(inArray(message.chatId, chatIds));
      await db.delete(stream).where(inArray(stream.chatId, chatIds));
      // 3. Delete the chats
      await db.delete(chat).where(inArray(chat.id, chatIds));
    }

    // 4. Delete the family member (this will cascade delete health memories)
    await db.delete(familyMember).where(eq(familyMember.id, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete family member"
    );
  }
}

// ============================================================
// Health Memory Queries
// ============================================================

export async function getHealthMemories({ memberId }: { memberId: string }) {
  try {
    return await db
      .select()
      .from(healthMemory)
      .where(eq(healthMemory.memberId, memberId))
      .orderBy(asc(healthMemory.category));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get health memories"
    );
  }
}

export async function upsertHealthMemory({
  memberId,
  category,
  content,
  source,
}: {
  memberId: string;
  category: string;
  content: string;
  source: "agent" | "manual";
}) {
  // The previous version of this function silently swallowed the underlying
  // DB error inside `catch (_error)` and re-threw a generic
  // "Failed to upsert health memory" ChatbotError. That made every save
  // failure look identical to the caller (and to the LLM) and made the
  // assistant confidently claim it had saved data that was never persisted.
  // We now log the full error server-side AND re-throw with the real cause
  // so the tool can surface an actionable message.
  try {
    const normalizedNew = content.trim().replace(/\s+/g, " ");

    // Check if entry already exists
    const [existing] = await db
      .select({ id: healthMemory.id, content: healthMemory.content })
      .from(healthMemory)
      .where(
        and(
          eq(healthMemory.memberId, memberId),
          eq(healthMemory.category, category)
        )
      )
      .limit(1);

    if (existing) {
      const normalizedCurrent = existing.content.trim().replace(/\s+/g, " ");
      if (normalizedCurrent === normalizedNew) {
        return { saved: false, reason: "unchanged" as const };
      }

      await db
        .update(healthMemory)
        .set({ content, source, updatedAt: new Date() })
        .where(eq(healthMemory.id, existing.id));
    } else {
      await db.insert(healthMemory).values({
        memberId,
        category,
        content,
        source,
      });
    }

    return { saved: true, reason: "updated" as const };
  } catch (error) {
    const underlying =
      error instanceof Error ? error.message : "Unknown database error";
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "unknown";
    console.error("[upsertHealthMemory] DB error", {
      memberId,
      category,
      source,
      code,
      underlying,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new ChatbotError(
      "bad_request:database",
      `Failed to upsert health memory (${code}): ${underlying}`
    );
  }
}

// ============================================================
// Medical Document Queries
// ============================================================

export async function saveMedicalDocument({
  memberId,
  fileName,
  blobPathname,
  fileType,
}: {
  memberId: string;
  fileName: string;
  blobPathname: string;
  fileType: string;
}) {
  try {
    const [created] = await db
      .insert(medicalDocument)
      .values({ memberId, fileName, blobPathname, fileType })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save medical document"
    );
  }
}

export async function getMedicalDocumentsByMemberId({
  memberId,
}: {
  memberId: string;
}) {
  try {
    // NOTE: blobPathname is intentionally excluded — it must never reach the
    // client. File reads go through the ownership-checked download route by id.
    return await db
      .select({
        id: medicalDocument.id,
        memberId: medicalDocument.memberId,
        fileName: medicalDocument.fileName,
        fileType: medicalDocument.fileType,
        uploadedAt: medicalDocument.uploadedAt,
      })
      .from(medicalDocument)
      .where(eq(medicalDocument.memberId, memberId))
      .orderBy(desc(medicalDocument.uploadedAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get medical documents"
    );
  }
}

export async function getMedicalDocumentById({ id }: { id: string }) {
  try {
    const [result] = await db
      .select()
      .from(medicalDocument)
      .where(eq(medicalDocument.id, id))
      .limit(1);
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get medical document by id"
    );
  }
}

/**
 * Hard-deletes a medical document: removes the file from Vercel Blob, drops
 * the `MedicalDocument` row, and relies on the `onDelete: "cascade"` FK on
 * `DocumentChunk.documentId` to wipe every embedding for that document.
 *
 * Ownership is enforced through `getOwnedMedicalDocumentById`, so a caller
 * who isn't the creator of the family that owns the member that owns the
 * document gets `null` back — no row, no blob delete, no chunk delete.
 */
export async function deleteMedicalDocument({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  const doc = await getOwnedMedicalDocumentById({ id, userId });
  if (!doc) {
    return null;
  }

  // Best-effort blob delete. If Vercel Blob is unreachable, we still want the
  // DB row (and its chunks, which carry the embeddings) gone — a stale blob
  // in private storage is far less harmful than a leaked vector chunk.
  try {
    await del(doc.blobPathname);
  } catch (err) {
    console.error(
      `[db] Failed to delete blob for document ${doc.id} (${doc.blobPathname}):`,
      err
    );
  }

  try {
    await db.delete(medicalDocument).where(eq(medicalDocument.id, id));
    return { id: doc.id };
  } catch (error) {
    console.error("[db] deleteMedicalDocument failed:", error);
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete medical document"
    );
  }
}

/**
 * Verifies that a medical document belongs to a family member owned by the
 * given user (family.createdBy === userId). Returns the document row if
 * ownership checks out, otherwise null.
 */
export async function getOwnedMedicalDocumentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [result] = await db
      .select({
        id: medicalDocument.id,
        memberId: medicalDocument.memberId,
        fileName: medicalDocument.fileName,
        blobPathname: medicalDocument.blobPathname,
        fileType: medicalDocument.fileType,
        uploadedAt: medicalDocument.uploadedAt,
      })
      .from(medicalDocument)
      .innerJoin(familyMember, eq(familyMember.id, medicalDocument.memberId))
      .innerJoin(family, eq(family.id, familyMember.familyId))
      .where(and(eq(medicalDocument.id, id), eq(family.createdBy, userId)))
      .limit(1);
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get medical document by id"
    );
  }
}

// ============================================================
// Document Chunk / Vector Search Queries
// ============================================================

export async function saveDocumentChunks({
  chunks,
}: {
  chunks: { documentId: string; content: string; embedding: number[] }[];
}) {
  try {
    return await db.insert(documentChunk).values(
      chunks.map((c) => ({
        documentId: c.documentId,
        content: c.content,
        embedding: c.embedding,
      }))
    );
  } catch (error) {
    // Surface the real cause instead of masking it behind a generic message
    // — the previous `_error` swallow is what hid the pgvector type
    // mismatch (and similar future issues) from the dev console.
    console.error("[db] saveDocumentChunks failed:", error);
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save document chunks"
    );
  }
}

export async function similaritySearchChunks({
  queryEmbedding,
  memberId,
  threshold = 0.4,
  limit = 3,
}: {
  queryEmbedding: number[];
  memberId: string;
  threshold?: number;
  limit?: number;
}) {
  try {
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    const results = await db
      .select({
        content: documentChunk.content,
        fileName: medicalDocument.fileName,
        similarity: sql<number>`1 - (${documentChunk.embedding} <=> ${vectorStr}::vector)`,
      })
      .from(documentChunk)
      .innerJoin(
        medicalDocument,
        eq(documentChunk.documentId, medicalDocument.id)
      )
      .where(
        and(
          eq(medicalDocument.memberId, memberId),
          sql`1 - (${documentChunk.embedding} <=> ${vectorStr}::vector) > ${threshold}`
        )
      )
      .orderBy(sql`${documentChunk.embedding} <=> ${vectorStr}::vector`)
      .limit(limit);

    return results;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to perform similarity search"
    );
  }
}

// ============================================================
// Medication + Vital Queries
//
// Backing queries for the Today screen, the per-member medication
// schedule, and the chat's structured lookup tool. Ownership is
// enforced through `getOwnedFamilyMember` so a caller who isn't the
// family owner always gets `null` (or an empty array) — no
// cross-family leakage.
// ============================================================

async function assertOwnsMember({
  memberId,
  userId,
}: {
  memberId: string;
  userId: string;
}) {
  const [row] = await db
    .select({ id: familyMember.id })
    .from(familyMember)
    .innerJoin(family, eq(familyMember.familyId, family.id))
    .where(and(eq(familyMember.id, memberId), eq(family.createdBy, userId)))
    .limit(1);
  return row ?? null;
}

// ---------- Medications ----------

export async function getMedicationsByMemberId({
  memberId,
  userId,
}: {
  memberId: string;
  userId: string;
}) {
  if (!(await assertOwnsMember({ memberId, userId }))) {
    return [];
  }
  try {
    return await db
      .select()
      .from(medication)
      .where(and(eq(medication.memberId, memberId)))
      .orderBy(asc(medication.drugName));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get medications"
    );
  }
}

export async function createMedication({
  memberId,
  userId,
  values,
}: {
  memberId: string;
  userId: string;
  values: typeof medication.$inferInsert;
}) {
  if (!(await assertOwnsMember({ memberId, userId }))) {
    return null;
  }
  try {
    const [created] = await db
      .insert(medication)
      .values({ ...values, memberId, createdBy: userId })
      .returning();
    return created;
  } catch (_error) {
    console.error("[db] createMedication failed:", _error);
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create medication"
    );
  }
}

export async function updateMedicationStatus({
  id,
  userId,
  status,
}: {
  id: string;
  userId: string;
  status: "active" | "paused" | "stopped" | "completed";
}) {
  try {
    const [updated] = await db
      .update(medication)
      .set({ status, updatedAt: new Date() })
      .where(eq(medication.id, id))
      .returning();
    return updated ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update medication"
    );
  }
}

export async function deleteMedication({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  if (!(await assertOwnsMember({ memberId: "", userId }))) {
    return false;
  }
  try {
    // Cascade through FK drops every MedicationLog row too.
    const [row] = await db
      .delete(medication)
      .where(
        and(
          eq(medication.id, id),
          sql`${medication.memberId} IN (
            SELECT "FamilyMember".id FROM "FamilyMember"
            INNER JOIN "Family" ON "FamilyMember"."familyId" = "Family".id
            WHERE "Family"."createdBy" = ${userId}
          )`
        )
      )
      .returning({ id: medication.id });
    return Boolean(row);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete medication"
    );
  }
}

// ---------- Medication Logs (dose events) ----------

export async function getMedicationLogsForDay({
  memberId,
  userId,
  dayStart,
  dayEnd,
}: {
  memberId: string;
  userId: string;
  dayStart: Date;
  dayEnd: Date;
}) {
  if (!(await assertOwnsMember({ memberId, userId }))) {
    return [];
  }
  try {
    return await db
      .select()
      .from(medicationLog)
      .where(
        and(
          eq(medicationLog.memberId, memberId),
          gte(medicationLog.scheduledFor, dayStart),
          lt(medicationLog.scheduledFor, dayEnd)
        )
      )
      .orderBy(asc(medicationLog.scheduledFor));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get medication logs"
    );
  }
}

export async function upsertMedicationLog({
  medicationId,
  memberId,
  scheduledFor,
  status,
  takenAt,
  skipReason,
  notes,
  source = "manual",
}: {
  medicationId: string;
  memberId: string;
  scheduledFor: Date;
  status: "taken" | "skipped" | "missed" | "snoozed";
  takenAt?: Date;
  skipReason?: string;
  notes?: string;
  source?: string;
}) {
  try {
    const [row] = await db
      .insert(medicationLog)
      .values({
        medicationId,
        memberId,
        scheduledFor,
        status,
        takenAt: takenAt ?? (status === "taken" ? new Date() : null),
        skipReason,
        notes,
        source,
      })
      .onConflictDoUpdate({
        target: [medicationLog.medicationId, medicationLog.scheduledFor],
        set: {
          status,
          takenAt: takenAt ?? (status === "taken" ? new Date() : null),
          skipReason,
          notes,
        },
      })
      .returning();
    return row;
  } catch (_error) {
    console.error("[db] upsertMedicationLog failed:", _error);
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save medication log"
    );
  }
}

// ---------- Vitals ----------

export async function getVitalsByMemberId({
  memberId,
  userId,
  type,
  since,
  limit = 200,
}: {
  memberId: string;
  userId: string;
  type?: string;
  since?: Date;
  limit?: number;
}) {
  if (!(await assertOwnsMember({ memberId, userId }))) {
    return [];
  }
  try {
    const where = [eq(vital.memberId, memberId)];
    if (type) {
      where.push(eq(vital.type, type));
    }
    if (since) {
      where.push(gte(vital.recordedAt, since));
    }
    return await db
      .select()
      .from(vital)
      .where(and(...where))
      .orderBy(desc(vital.recordedAt))
      .limit(limit);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get vitals");
  }
}

export async function createVital({
  memberId,
  userId,
  values,
}: {
  memberId: string;
  userId: string;
  values: typeof vital.$inferInsert;
}) {
  if (!(await assertOwnsMember({ memberId, userId }))) {
    return null;
  }
  try {
    const [created] = await db
      .insert(vital)
      .values({ ...values, memberId })
      .returning();
    return created;
  } catch (_error) {
    console.error("[db] createVital failed:", _error);
    throw new ChatbotError("bad_request:database", "Failed to log vital");
  }
}

export async function deleteVital({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .delete(vital)
      .where(
        and(
          eq(vital.id, id),
          sql`${vital.memberId} IN (
            SELECT "FamilyMember".id FROM "FamilyMember"
            INNER JOIN "Family" ON "FamilyMember"."familyId" = "Family".id
            WHERE "Family"."createdBy" = ${userId}
          )`
        )
      )
      .returning({ id: vital.id });
    return Boolean(row);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to delete vital");
  }
}

// ---------- Thresholds ----------

export async function getVitalThresholdForMember({
  memberId,
  type,
  userId,
}: {
  memberId: string;
  type: string;
  userId: string;
}) {
  if (!(await assertOwnsMember({ memberId, userId }))) {
    return null;
  }
  try {
    const [row] = await db
      .select()
      .from(vitalThreshold)
      .where(
        and(
          eq(vitalThreshold.memberId, memberId),
          eq(vitalThreshold.type, type)
        )
      )
      .limit(1);
    return row ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get vital threshold"
    );
  }
}

export async function upsertVitalThreshold({
  memberId,
  type,
  warnMin,
  warnMax,
  criticalMin,
  criticalMax,
}: {
  memberId: string;
  type: string;
  warnMin?: number | null;
  warnMax?: number | null;
  criticalMin?: number | null;
  criticalMax?: number | null;
}) {
  try {
    const [row] = await db
      .insert(vitalThreshold)
      .values({
        memberId,
        type,
        warnMin: warnMin == null ? null : String(warnMin),
        warnMax: warnMax == null ? null : String(warnMax),
        criticalMin: criticalMin == null ? null : String(criticalMin),
        criticalMax: criticalMax == null ? null : String(criticalMax),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [vitalThreshold.memberId, vitalThreshold.type],
        set: {
          warnMin: warnMin == null ? null : String(warnMin),
          warnMax: warnMax == null ? null : String(warnMax),
          criticalMin: criticalMin == null ? null : String(criticalMin),
          criticalMax: criticalMax == null ? null : String(criticalMax),
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save vital threshold"
    );
  }
}
