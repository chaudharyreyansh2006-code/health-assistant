import { google } from "@ai-sdk/google";
import { embedMany, generateText } from "ai";
import { uploadBlobToGoogleFiles } from "@/lib/ai/upload-blob-to-google";
import { getLanguageModel } from "@/lib/ai/providers";

const IMAGE_MIME_PREFIXES = ["image/"];

function isImageType(fileType: string): boolean {
  const mime = fileType.toLowerCase();
  return IMAGE_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

/**
 * Extracts raw text from a file buffer based on the file content type.
 *
 * PDFs and images are both read by a vision-capable Gemini model that
 * transcribes every readable piece of content (OCR) and describes any
 * visual medical context so the chunks are searchable via the same RAG
 * pipeline as plain text.
 *
 * We deliberately do NOT use a local PDF parser (e.g. `pdf-parse`) because
 * its `pdfjs-dist@5` dependency hard-requires browser-only globals like
 * `DOMMatrix` / `ImageData` / `Path2D` and crashes the Node server with
 * `ReferenceError: DOMMatrix is not defined`. Sending the PDF straight to
 * Gemini via the Files API is more reliable and handles scanned/image-only
 * PDFs out of the box.
 */
export async function extractTextFromFile(
  fileBuffer: Buffer,
  fileType: string,
  fileName?: string
): Promise<string> {
  const mime = fileType.toLowerCase();
  const safeName = fileName || "document";

  if (mime.includes("pdf")) {
    return extractTextFromPdf(fileBuffer, mime, safeName);
  }

  if (isImageType(mime)) {
    return extractTextFromImage(fileBuffer, mime);
  }

  // Default fallback: treat as text file
  return fileBuffer.toString("utf-8");
}

/**
 * Uploads a PDF to Google Files and asks Gemini to read every page. Gemini's
 * multimodal PDF ingestion works for both digital and scanned PDFs, so this
 * subsumes what a local text extractor would have done — without dragging in
 * browser-only polyfills on the server.
 */
async function extractTextFromPdf(
  pdfBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is required to process PDF documents."
    );
  }

  let uploaded;
  try {
    uploaded = await uploadBlobToGoogleFiles({
      buffer: new Uint8Array(pdfBuffer),
      mediaType: mimeType,
      filename: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
      apiKey,
    });
  } catch (err) {
    console.error("Failed to upload PDF to Google Files:", err);
    throw new Error(
      "Could not upload the PDF for AI processing. Please retry in a moment."
    );
  }

  const { text } = await generateText({
    model: getLanguageModel("gemini-3.1-flash-lite"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "You are a medical document OCR assistant. Extract ALL readable text from this PDF verbatim, preserving lab values, medication names, dosages, dates, diagnoses, and section headings. If the document contains tables, format them as readable text. If there is no readable text, write a concise factual description of the medical content shown. Output only the extracted text or description, no preamble.",
          },
          {
            type: "file",
            data: new URL(uploaded.uri),
            mediaType: uploaded.mimeType,
          },
        ],
      },
    ],
  });

  return text?.trim() || "";
}

/**
 * Uses a vision-capable Gemini model to OCR/summarize an image so its content
 * becomes searchable via the same chunk + embedding pipeline as PDF/TXT docs.
 */
async function extractTextFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const { text } = await generateText({
    model: getLanguageModel("gemini-3.1-flash-lite"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "You are a medical document OCR assistant. Extract ALL readable text from this image verbatim, preserving lab values, medication names, dosages, dates, and diagnoses. If the image is a chart or table, transcribe it as structured text. If there is no readable text, write a concise factual description of the medical content shown (e.g. 'X-ray showing...', 'ECG with...'). Output only the extracted text or description, no preamble.",
          },
          {
            type: "image",
            image: imageBuffer,
            mediaType: mimeType,
          },
        ],
      },
    ],
  });

  return text?.trim() || "";
}

/**
 * Splits text into overlapping chunks of a specified character count.
 */
export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 100
): string[] {
  const normalizedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  if (normalizedText.length <= chunkSize) {
    return [normalizedText];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalizedText.length) {
    const end = start + chunkSize;
    const chunk = normalizedText.slice(start, end);
    chunks.push(chunk);
    // Move starting point by step size
    start += chunkSize - overlap;
  }

  return chunks.filter((c) => c.trim().length > 10);
}

/**
 * Generates vector embeddings for a list of text chunks using Google gemini-embedding-001.
 */
export async function generateEmbeddings(
  chunks: string[]
): Promise<number[][]> {
  if (chunks.length === 0) {
    return [];
  }

  const { embeddings } = await embedMany({
    model: google.textEmbeddingModel("gemini-embedding-001"),
    values: chunks,
    providerOptions: {
      google: {
        outputDimensionality: 768,
      },
    },
  });

  return embeddings;
}
