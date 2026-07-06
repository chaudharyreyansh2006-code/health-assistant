import { put } from "@vercel/blob";
import { auth } from "@/app/(auth)/auth";
import {
  chunkText,
  extractTextFromFile,
  generateEmbeddings,
} from "@/lib/ai/document-processor";
import { isRegularSession } from "@/lib/auth/guards";
import { saveDocumentChunks, saveMedicalDocument } from "@/lib/db/queries";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

function isAllowedFileType(
  type: string
): type is (typeof ALLOWED_MIME_TYPES)[number] {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(type);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!isRegularSession(session)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Failed to parse multipart form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const memberId = formData.get("memberId");

  if (
    !file ||
    typeof file !== "object" ||
    !("size" in file) ||
    !("type" in file) ||
    !memberId ||
    typeof memberId !== "string"
  ) {
    return Response.json(
      { error: "file and memberId are required" },
      { status: 400 }
    );
  }

  const fileType = (file as { type: string }).type;
  const fileSize = (file as { size: number }).size;

  if (fileSize <= 0) {
    return Response.json({ error: "Uploaded file is empty" }, { status: 400 });
  }

  if (fileSize > MAX_FILE_SIZE) {
    return Response.json(
      { error: `File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
      { status: 400 }
    );
  }

  if (!isAllowedFileType(fileType)) {
    return Response.json(
      {
        error:
          "Only PDF, TXT, and image (PNG/JPEG/WebP/GIF) medical documents are supported",
      },
      { status: 400 }
    );
  }

  try {
    // Convert file to buffer once and reuse it for parsing + blob upload.
    const arrayBuffer = await (file as File).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Extract text and chunk it. We surface a clean error if the PDF is
    //    password-protected / corrupt so the client can show something useful.
    const text = await extractTextFromFile(buffer, fileType);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return Response.json(
        { error: "No extractable text found in this document" },
        { status: 400 }
      );
    }

    // 2. Generate vector embeddings for the chunks.
    const embeddings = await generateEmbeddings(chunks);

    // 3. Upload file to Vercel Blob in the PRIVATE store. Sanitize the
    //    filename and prefix a timestamp to prevent collisions. The returned
    //    `url` is NOT publicly readable — reads go through the authenticated
    //    download route which calls `get(pathname, { access: "private" })`.
    const originalName =
      (file as File).name?.replace(/[^a-zA-Z0-9.-]/g, "_") || "document";
    const sanitizedName = `${Date.now()}-${originalName}`;
    const blob = await put(sanitizedName, buffer, {
      access: "private",
      addRandomSuffix: true,
      contentType: fileType,
    });

    // 4. Save file metadata to DB. We persist the blob *pathname* (not a URL)
    //    so the only way to read the file is via the ownership-checked route.
    const dbDoc = await saveMedicalDocument({
      memberId,
      fileName: (file as File).name || sanitizedName,
      blobPathname: blob.pathname,
      fileType,
    });

    // 5. Save chunk vectors to DB.
    const dbChunks = chunks.map((content, idx) => ({
      documentId: dbDoc.id,
      content,
      embedding: embeddings[idx],
    }));
    await saveDocumentChunks({ chunks: dbChunks });

    return Response.json({
      success: true,
      document: dbDoc,
      chunksCount: chunks.length,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Failed to process document";
    console.error("Document upload & processing error:", err);
    return Response.json({ error: errorMessage }, { status: 500 });
  }
}
