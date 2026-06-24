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
  sql,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  documentChunk,
  type DocumentChunk,
  family,
  type Family,
  familyMember,
  type FamilyMember,
  healthMemory,
  type HealthMemory,
  medicalDocument,
  type MedicalDocument,
  message,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
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

export async function getFamiliesByUserId({
  userId,
}: {
  userId: string;
}) {
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

export async function getFamilyMembers({
  familyId,
}: {
  familyId: string;
}) {
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

// ============================================================
// Health Memory Queries
// ============================================================

export async function getHealthMemories({
  memberId,
}: {
  memberId: string;
}) {
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
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to upsert health memory"
    );
  }
}

// ============================================================
// Medical Document Queries
// ============================================================

export async function saveMedicalDocument({
  memberId,
  fileName,
  url,
  fileType,
}: {
  memberId: string;
  fileName: string;
  url: string;
  fileType: string;
}) {
  try {
    const [created] = await db
      .insert(medicalDocument)
      .values({ memberId, fileName, url, fileType })
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
    return await db
      .select()
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
  } catch (_error) {
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
        similarity:
          sql<number>`1 - (${documentChunk.embedding} <=> ${vectorStr}::vector)`,
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
      .orderBy(
        sql`${documentChunk.embedding} <=> ${vectorStr}::vector`
      )
      .limit(limit);

    return results;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to perform similarity search"
    );
  }
}
