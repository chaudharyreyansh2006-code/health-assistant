import { auth } from "@/app/(auth)/auth";
import { put } from "@vercel/blob";
import { saveMedicalDocument, saveDocumentChunks } from "@/lib/db/queries";
import { extractTextFromFile, chunkText, generateEmbeddings } from "@/lib/ai/document-processor";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const memberId = formData.get("memberId") as string | null;

    if (!file || !memberId) {
      return Response.json(
        { error: "file and memberId are required" },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Extract text and chunk it
    const text = await extractTextFromFile(buffer, file.type);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return Response.json(
        { error: "No extractable text found in this document" },
        { status: 400 }
      );
    }

    // 2. Generate vector embeddings for the chunks
    const embeddings = await generateEmbeddings(chunks);

    // 3. Upload file to Vercel Blob
    // We sanitize the filename and suffix with a timestamp to prevent collisions
    const sanitizedName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const blob = await put(sanitizedName, buffer, {
      access: "public",
    });

    // 4. Save file metadata to DB
    const dbDoc = await saveMedicalDocument({
      memberId,
      fileName: file.name,
      url: blob.url,
      fileType: file.type,
    });

    // 5. Save chunk vectors to DB
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
  } catch (err: any) {
    console.error("Document upload & processing error:", err);
    return Response.json(
      { error: err.message || "Failed to process document" },
      { status: 500 }
    );
  }
}
