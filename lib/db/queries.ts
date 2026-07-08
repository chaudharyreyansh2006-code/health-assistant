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
  familyMember,
  healthMemory,
  medicalDocument,
  medication,
  medicationLog,
  message,
  stream,
  suggestion,
  type Suggestion,
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
//
// After migration 0004 the `Family` table is gone. Each user has exactly
// one family, identified by the user itself. The family name lives on
// `User.familyName`. The list-of-workspaces concept no longer exists.

/**
 * Returns the user's "family" view — basically the user row with the
 * family name + a placeholder id (which is just the user's id). The id
 * exists only so legacy callers that take `{ id, name }` keep working.
 */
export async function getFamilyByUserId({ userId }: { userId: string }) {
  try {
    const [result] = await db
      .select({
        id: user.id,
        name: user.familyName,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return result ?? null;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get family by user id"
    );
  }
}

/**
 * Sets the user's family name. This replaces the old "createFamily" flow —
 * there is no separate family row to create.
 */
export async function setUserFamilyName({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  try {
    await db
      .update(user)
      .set({ familyName: name, updatedAt: new Date() })
      .where(eq(user.id, userId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to set family name"
    );
  }
}

// ============================================================
// Family Member Queries
// ============================================================

export async function addFamilyMember({
  userId,
  name,
  relationship,
  dateOfBirth,
  gender,
}: {
  userId: string;
  name: string;
  relationship: string;
  dateOfBirth?: string;
  gender?: string;
}) {
  try {
    const [created] = await db
      .insert(familyMember)
      .values({ userId, name, relationship, dateOfBirth, gender })
      .returning();
    return created;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to add family member"
    );
  }
}

export async function getFamilyMembers({ userId }: { userId: string }) {
  try {
    return await db
      .select()
      .from(familyMember)
      .where(eq(familyMember.userId, userId))
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

/**
 * Hard-deletes a family member and every dependent row that doesn't have
 * its own cascade. The schema cascades FamilyMember → HealthMemory,
 * Medication, MedicationLog, Vital, VitalThreshold, MedicalDocument
 * (which cascades to DocumentChunk). Chats reference the member via a
 * nullable FK with `onDelete: "set null"`, so chats survive but become
 * member-less.
 *
 * `userId` is checked against `FamilyMember.userId` (denormalized) so a
 * caller who isn't the owner of this member gets a no-op (returns 0).
 */
export async function deleteFamilyMemberById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    // 1. Delete chats that referenced this member (member-less chats are
    //    useless and we don't want orphans).
    const memberChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.memberId, id));

    const chatIds = memberChats.map((c) => c.id);

    if (chatIds.length > 0) {
      await db.delete(vote).where(inArray(vote.chatId, chatIds));
      await db.delete(message).where(inArray(message.chatId, chatIds));
      await db.delete(stream).where(inArray(stream.chatId, chatIds));
      await db.delete(chat).where(inArray(chat.id, chatIds));
    }

    // 2. Delete the member. The schema cascades through every PHI table.
    //    We verify ownership via the denormalized `userId` column on
    //    `FamilyMember` — if a caller passes the wrong `userId` the WHERE
    //    matches zero rows and we return 0 instead of leaking.
    const [row] = await db
      .delete(familyMember)
      .where(
        and(eq(familyMember.id, id), eq(familyMember.userId, userId))
      )
      .returning({ id: familyMember.id });
    return Boolean(row);
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

export async function getHealthMemories({
  memberId,
  userId,
}: {
  memberId: string;
  userId: string;
}) {
  try {
    return await db
      .select()
      .from(healthMemory)
      .where(
        and(
          eq(healthMemory.memberId, memberId),
          eq(healthMemory.userId, userId)
        )
      )
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
  userId,
  category,
  content,
  source,
}: {
  memberId: string;
  userId: string;
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
          eq(healthMemory.userId, userId),
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
        userId,
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
      userId,
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
//
// `userId` is denormalized on every row. All read queries filter on
// `userId` first; writes require the caller to have already verified
// ownership (the upload route checks via `assertOwnsMember` before
// calling `saveMedicalDocument`).

export async function saveMedicalDocument({
  userId,
  memberId,
  fileName,
  blobPathname,
  fileType,
}: {
  userId: string;
  memberId: string;
  fileName: string;
  blobPathname: string;
  fileType: string;
}) {
  try {
    const [created] = await db
      .insert(medicalDocument)
      .values({ userId, memberId, fileName, blobPathname, fileType })
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
  userId,
}: {
  memberId: string;
  userId: string;
}) {
  try {
    // NOTE: blobPathname is intentionally excluded — it must never reach the
    // client. File reads go through the ownership-checked download route by id.
    // Defense-in-depth: filter on BOTH `userId` (denormalized owner) AND
    // `memberId` so a caller cannot fetch another member's documents even
    // if they share the same family.
    return await db
      .select({
        id: medicalDocument.id,
        memberId: medicalDocument.memberId,
        fileName: medicalDocument.fileName,
        fileType: medicalDocument.fileType,
        uploadedAt: medicalDocument.uploadedAt,
      })
      .from(medicalDocument)
      .where(
        and(
          eq(medicalDocument.memberId, memberId),
          eq(medicalDocument.userId, userId)
        )
      )
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
 * Ownership is enforced via the denormalized `medicalDocument.userId`
 * column — a single-column compare, no joins. A caller who isn't the
 * document's owner gets `null` back, no row touched, no blob deleted.
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
 * Returns the medical document iff the caller's userId matches the
 * document's denormalized `userId`. Single-column check, no joins, no
 * subqueries. Returns `null` for both "doesn't exist" and "exists but
 * not yours" — same shape, no information leak.
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
      .where(
        and(eq(medicalDocument.id, id), eq(medicalDocument.userId, userId))
      )
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
  userId,
  documentId,
  chunks,
}: {
  userId: string;
  documentId: string;
  chunks: { content: string; embedding: number[] }[];
}) {
  try {
    return await db.insert(documentChunk).values(
      chunks.map((c) => ({
        userId,
        documentId,
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
  userId,
  threshold = 0.4,
  limit = 3,
}: {
  queryEmbedding: number[];
  memberId: string;
  userId: string;
  threshold?: number;
  limit?: number;
}) {
  try {
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    // Defense-in-depth: filter on `userId` (denormalized owner) AND
    // `memberId` so a caller cannot pull another family member's chunks.
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
          eq(medicalDocument.userId, userId),
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
// enforced via the denormalized `userId` column on every row — a
// caller who isn't the owner of the member always gets `null` (or
// an empty array), no cross-family leakage possible.
// ============================================================

/**
 * Returns the family member iff it belongs to the given user.
 * Single-column check, no joins, no subqueries.
 */
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
    .where(
      and(eq(familyMember.id, memberId), eq(familyMember.userId, userId))
    )
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
      .where(
        and(
          eq(medication.memberId, memberId),
          eq(medication.userId, userId)
        )
      )
      .orderBy(asc(medication.drugName));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get medications"
    );
  }
}

type MedicationInsert = typeof medication.$inferInsert;
// Server-managed fields are excluded so the route doesn't have to (and
// can't) pass them — `userId` comes from the session, `memberId` is
// derived from `activeMemberId`, and the rest are DB timestamps.
type MedicationValues = Omit<
  MedicationInsert,
  "id" | "userId" | "memberId" | "createdAt" | "updatedAt"
>;

export async function createMedication({
  memberId,
  userId,
  values,
}: {
  memberId: string;
  userId: string;
  values: MedicationValues;
}) {
  if (!(await assertOwnsMember({ memberId, userId }))) {
    return null;
  }
  try {
    const [created] = await db
      .insert(medication)
      .values({ ...values, userId, memberId })
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
      .where(
        and(eq(medication.id, id), eq(medication.userId, userId))
      )
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
  try {
    // Cascade through FK drops every MedicationLog row too. Ownership is
    // enforced via the denormalized `medication.userId` column — a single
    // column compare, no joins, no subqueries.
    const [row] = await db
      .delete(medication)
      .where(
        and(eq(medication.id, id), eq(medication.userId, userId))
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
          eq(medicationLog.userId, userId),
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
  userId,
  medicationId,
  memberId,
  scheduledFor,
  status,
  takenAt,
  skipReason,
  notes,
  source = "manual",
}: {
  userId: string;
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
        userId,
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

/**
 * Hard-deletes a single dose event. Used by the "Undo" affordance on the
 * Today screen when a user taps Take / Skip by mistake. Ownership is
 * checked against the denormalized `medicationLog.userId` column so a
 * caller who isn't the owner gets `false` back, no row touched.
 *
 * Idempotent — calling it twice for the same id returns `false` the second
 * time, which the route maps to 404 (the row is already gone).
 */
export async function deleteMedicationLog({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  try {
    const [row] = await db
      .delete(medicationLog)
      .where(
        and(eq(medicationLog.id, id), eq(medicationLog.userId, userId))
      )
      .returning({ id: medicationLog.id });
    return Boolean(row);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete medication log"
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
    const where = [
      eq(vital.memberId, memberId),
      eq(vital.userId, userId),
    ];
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

type VitalInsert = typeof vital.$inferInsert;
type VitalValues = Omit<VitalInsert, "id" | "userId" | "memberId" | "createdAt">;

export async function createVital({
  memberId,
  userId,
  values,
}: {
  memberId: string;
  userId: string;
  values: VitalValues;
}) {
  if (!(await assertOwnsMember({ memberId, userId }))) {
    return null;
  }
  try {
    const [created] = await db
      .insert(vital)
      .values({ ...values, userId, memberId })
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
      .where(and(eq(vital.id, id), eq(vital.userId, userId)))
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
          eq(vitalThreshold.type, type),
          eq(vitalThreshold.userId, userId)
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
  userId,
  memberId,
  type,
  warnMin,
  warnMax,
  criticalMin,
  criticalMax,
}: {
  userId: string;
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
        userId,
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
