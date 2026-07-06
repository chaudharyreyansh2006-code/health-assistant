import "server-only";

import { get } from "@vercel/blob";
import type { UIMessage } from "ai";

/**
 * File parts created by the chat input carry a URL pointing at our
 * authenticated `/api/files/download?pathname=...` route, because the
 * underlying Vercel Blob store is PRIVATE and its raw URL cannot be fetched
 * by the browser (previews) nor by the model provider.
 *
 * The model, however, needs the actual image bytes. The AI SDK would try to
 * download the URL server-side, but our download route requires a session
 * cookie that an internal model-fetch does not carry. So before handing the
 * messages to the model we inline every such file part: fetch the bytes
 * server-side via `get(pathname, { access: "private" })` and replace the URL
 * with a `data:` URL (base64). The stored/UI messages are left untouched —
 * they keep the authed-route URL so previews keep working on reload.
 */
export async function inlinePrivateFileParts<T extends UIMessage>(
  messages: T[]
): Promise<T[]> {
  const replacements: {
    messageIndex: number;
    partIndex: number;
    dataUrl: string;
  }[] = [];

  for (let i = 0; i < messages.length; i++) {
    const parts = messages[i]?.parts;
    if (!parts) {
      continue;
    }
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      if (part?.type !== "file") {
        continue;
      }
      const url = (part as { url?: string }).url;
      const mediaType = (part as { mediaType?: string }).mediaType;
      if (!url || !mediaType) {
        continue;
      }

      const pathname = extractPathname(url);
      if (!pathname) {
        continue;
      }

      try {
        const result = await get(pathname, { access: "private" });
        if (!result || result.statusCode !== 304) {
          const blob = result as {
            statusCode: 200;
            stream: ReadableStream<Uint8Array>;
            blob: { contentType: string };
          } | null;
          if (!blob || !blob.stream) {
            continue;
          }
          const buffer = Buffer.from(
            await new Response(blob.stream).arrayBuffer()
          );
          const dataUrl = `data:${blob.blob.contentType || mediaType};base64,${buffer.toString(
            "base64"
          )}`;
          replacements.push({ messageIndex: i, partIndex: j, dataUrl });
        }
      } catch (err) {
        console.error("Failed to inline private file part:", err);
      }
    }
  }

  if (replacements.length === 0) {
    return messages;
  }

  // Shallow-clone messages/parts so we never mutate the caller's array.
  const cloned = messages.map((m) => ({
    ...m,
    parts: [...(m.parts as unknown[])],
  })) as T[];

  for (const r of replacements) {
    const part = cloned[r.messageIndex]?.parts?.[r.partIndex];
    if (part && typeof part === "object") {
      (part as { url: string }).url = r.dataUrl;
    }
  }

  return cloned;
}

function extractPathname(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, "http://internal");
  } catch {
    return null;
  }
  if (!parsed.pathname.endsWith("/api/files/download")) {
    return null;
  }
  const pathname = parsed.searchParams.get("pathname");
  return pathname || null;
}
