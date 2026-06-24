import { embedMany } from "ai";
import { google } from "@ai-sdk/google";
import * as pdf from "pdf-parse";

/**
 * Extracts raw text from a file buffer based on the file content type.
 */
export async function extractTextFromFile(
  fileBuffer: Buffer,
  fileType: string
): Promise<string> {
  const mime = fileType.toLowerCase();
  if (mime.includes("pdf")) {
    try {
      const parsePdf = typeof pdf === "function" ? pdf : (pdf as any).default;
      const parsed = await parsePdf(fileBuffer);
      return parsed.text || "";
    } catch (err) {
      console.error("Failed to parse PDF document:", err);
      throw new Error("Could not parse PDF. Make sure it is not password-protected or corrupt.");
    }
  }

  // Default fallback: treat as text file
  return fileBuffer.toString("utf-8");
}

/**
 * Splits text into overlapping chunks of a specified character count.
 */
export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 100
): string[] {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
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

  return chunks.filter(c => c.trim().length > 10);
}

/**
 * Generates vector embeddings for a list of text chunks using Google gemini-embedding-001.
 */
export async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  if (chunks.length === 0) return [];

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
