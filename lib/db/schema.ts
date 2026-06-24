import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  foreignKey,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Custom pgvector type for Drizzle ORM (matches Gemini text-embedding-004 output)
const vector = customType<{ data: number[] }>({
  dataType() {
    return "vector(768)";
  },
});

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

// Families: Grouping shared records for family rooms
export const family = pgTable("Family", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: text("name").notNull(),
  createdBy: uuid("createdBy").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Family = InferSelectModel<typeof family>;

// Family Members: Individual members under a family workspace
export const familyMember = pgTable("FamilyMember", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  familyId: uuid("familyId")
    .notNull()
    .references(() => family.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(), // 'self', 'spouse', 'child', 'parent', etc.
  dateOfBirth: date("dateOfBirth"),
  gender: text("gender"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type FamilyMember = InferSelectModel<typeof familyMember>;

// Health Memories: Long-term memory summaries (one prose block per category per member)
export const healthMemory = pgTable(
  "HealthMemory",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    memberId: uuid("memberId")
      .notNull()
      .references(() => familyMember.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 64 }).notNull(),
    content: text("content").notNull(),
    source: varchar("source", { length: 32 }).notNull(), // 'agent' | 'manual'
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    uniqueMemberCategory: unique().on(table.memberId, table.category),
  })
);

export type HealthMemory = InferSelectModel<typeof healthMemory>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  memberId: uuid("memberId").references(() => familyMember.id, {
    onDelete: "set null",
  }),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  runningSummary: text("runningSummary").default(""),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// Medical Documents: Uploaded scans/reports metadata (stored in Vercel Blob)
export const medicalDocument = pgTable("MedicalDocument", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  memberId: uuid("memberId")
    .notNull()
    .references(() => familyMember.id, { onDelete: "cascade" }),
  fileName: text("fileName").notNull(),
  url: text("url").notNull(), // Vercel Blob URL
  fileType: text("fileType").notNull(),
  uploadedAt: timestamp("uploadedAt").notNull().defaultNow(),
});

export type MedicalDocument = InferSelectModel<typeof medicalDocument>;

// Document Chunks: Vectorized segments of medical documents for RAG
export const documentChunk = pgTable("DocumentChunk", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  documentId: uuid("documentId")
    .notNull()
    .references(() => medicalDocument.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  embedding: vector("embedding"),
});

export type DocumentChunk = InferSelectModel<typeof documentChunk>;
