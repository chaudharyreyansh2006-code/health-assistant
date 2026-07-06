import { google } from "@ai-sdk/google";
import { embedMany, generateText } from "ai";
import { PDFParse } from "pdf-parse";
import { getLanguageModel } from "@/lib/ai/providers";

const IMAGE_MIME_PREFIXES = ["image/"];

function isImageType(fileType: string): boolean {
  const mime = fileType.toLowerCase();
  return IMAGE_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

/**
 * Extracts raw text from a file buffer based on the file content type.
 *
 * PDFs are parsed with `pdf-parse` v2's `PDFParse` class (the old default-export
 * callable from v1 was removed, which is why uploads broke after the upgrade).
 * Images are run through a vision-capable Gemini model that transcribes any
 * readable text (OCR) and describes the medical content so it can be embedded
 * for RAG just like a text report.
 */
export async function extractTextFromFile(
  fileBuffer: Buffer,
  fileType: string
): Promise<string> {
  const mime = fileType.toLowerCase();

  if (mime.includes("pdf")) {
    try {
      const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
      const result = await parser.getText();
      await parser.destroy();
      return result.text || "";
    } catch (err) {
      console.error("Failed to parse PDF document:", err);
      throw new Error(
        "Could not parse PDF. Make sure it is not password-protected or corrupt."
      );
    }
  }

  if (isImageType(mime)) {
    return extractTextFromImage(fileBuffer, mime);
  }

  // Default fallback: treat as text file
  return fileBuffer.toString("utf-8");
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
