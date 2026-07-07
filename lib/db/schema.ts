import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  foreignKey,
  index,
  json,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Custom pgvector type for Drizzle ORM (matches Gemini text-embedding-001
// output at outputDimensionality=768). The default identity conversion
// sends a JS `number[]` straight to the driver, which PostgreSQL rejects
// because the column is `vector(768)`. `toDriver` formats the JS array as
// the pgvector literal `[0.1,0.2,...]` that the extension expects.
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    if (typeof value !== "string") {
      return value as unknown as number[];
    }
    const trimmed = value.replace(/^[\[]|[\]]$/g, "");
    if (!trimmed) {
      return [];
    }
    return trimmed.split(",").map((v) => Number(v));
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

// Medical Documents: Uploaded scans/reports metadata.
// The raw file lives in Vercel Blob in a PRIVATE store; only its pathname is
// persisted here. Reads go through the authenticated download route which
// calls `get(pathname, { access: "private" })` server-side, so no public URL
// to a medical file ever exists.
export const medicalDocument = pgTable("MedicalDocument", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  memberId: uuid("memberId")
    .notNull()
    .references(() => familyMember.id, { onDelete: "cascade" }),
  fileName: text("fileName").notNull(),
  blobPathname: text("blobPathname").notNull(),
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

// ---------------------------------------------------------------------------
// Medications & Vitals (per-member structured health data)
//
// Designed to back the "Today" screen and the chat's structured queries.
// Each row is a single *event* (a dose taken, a BP reading) so the chat and
// the alert engine can reason over time. The schedule itself lives on
// `Medication`; every actual dose is a `MedicationLog` row.
// ---------------------------------------------------------------------------

// A prescription / ongoing medication schedule.
export const medication = pgTable(
  "Medication",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    memberId: uuid("memberId")
      .notNull()
      .references(() => familyMember.id, { onDelete: "cascade" }),
    drugName: text("drugName").notNull(),
    brandName: text("brandName"),
    doseValue: numeric("doseValue", { precision: 10, scale: 3 }).notNull(),
    doseUnit: varchar("doseUnit", { length: 32 }).notNull(),
    frequency: varchar("frequency", { length: 32 }).notNull(),
    // Local clock times in 'HH:MM' (24h). Multiple = multiple daily doses.
    scheduleTimes: json("scheduleTimes").$type<string[]>().notNull(),
    withFood: varchar("withFood", { length: 16 }).notNull().default("any"),
    startDate: date("startDate").notNull().defaultNow(),
    endDate: date("endDate"),
    prescribedBy: text("prescribedBy"),
    notes: text("notes"),
    remainingQty: numeric("remainingQty", { precision: 10, scale: 2 }),
    refillAt: date("refillAt"),
    pharmacy: text("pharmacy"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdBy: uuid("createdBy").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    memberIdx: index("Medication_memberId_idx").on(table.memberId),
  })
);

export type Medication = InferSelectModel<typeof medication>;

// One row per scheduled dose. Created on demand when the alert engine or the
// user opens the Today screen; status flips to taken / skipped / missed.
export const medicationLog = pgTable(
  "MedicationLog",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    medicationId: uuid("medicationId")
      .notNull()
      .references(() => medication.id, { onDelete: "cascade" }),
    memberId: uuid("memberId")
      .notNull()
      .references(() => familyMember.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduledFor").notNull(),
    takenAt: timestamp("takenAt"),
    status: varchar("status", { length: 16 }).notNull(),
    skipReason: varchar("skipReason", { length: 64 }),
    notes: text("notes"),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    medIdx: index("MedicationLog_medicationId_idx").on(table.medicationId),
    memberScheduledIdx: index("MedicationLog_memberId_scheduledFor_idx").on(
      table.memberId,
      table.scheduledFor
    ),
    uniqScheduledSlot: unique("MedicationLog_medicationId_scheduledFor_unique").on(
      table.medicationId,
      table.scheduledFor
    ),
  })
);

export type MedicationLog = InferSelectModel<typeof medicationLog>;

// A single measurement. `value` + `unit` cover everything single-number
// (weight, SpO2, HR, temp). For BP we also store systolic/diastolic/pulse.
export const vital = pgTable(
  "Vital",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    memberId: uuid("memberId")
      .notNull()
      .references(() => familyMember.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    recordedAt: timestamp("recordedAt").notNull(),
    value: numeric("value", { precision: 12, scale: 3 }),
    unit: varchar("unit", { length: 16 }),
    systolic: numeric("systolic", { precision: 6, scale: 2 }),
    diastolic: numeric("diastolic", { precision: 6, scale: 2 }),
    pulse: numeric("pulse", { precision: 6, scale: 2 }),
    context: varchar("context", { length: 32 }),
    source: varchar("source", { length: 32 }).notNull().default("manual"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    memberTypeRecordedIdx: index("Vital_memberId_type_recordedAt_idx").on(
      table.memberId,
      table.type,
      table.recordedAt
    ),
  })
);

export type Vital = InferSelectModel<typeof vital>;

// Per-member, per-type alert thresholds. Created on demand the first time a
// user tunes them; defaults are computed in the app from member profile.
export const vitalThreshold = pgTable(
  "VitalThreshold",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    memberId: uuid("memberId")
      .notNull()
      .references(() => familyMember.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    warnMin: numeric("warnMin", { precision: 10, scale: 2 }),
    warnMax: numeric("warnMax", { precision: 10, scale: 2 }),
    criticalMin: numeric("criticalMin", { precision: 10, scale: 2 }),
    criticalMax: numeric("criticalMax", { precision: 10, scale: 2 }),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    uniqMemberType: unique("VitalThreshold_memberId_type_unique").on(
      table.memberId,
      table.type
    ),
  })
);

export type VitalThreshold = InferSelectModel<typeof vitalThreshold>;
