import "server-only";

import { get } from "@vercel/blob";
import type { convertToModelMessages } from "ai";

type ModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

type FileModelPart = {
  type: "file";
  data: string | URL | Uint8Array;
  mediaType: string;
  filename?: string;
  providerOptions?: Record<string, unknown>;
};

const GOOGLE_FILES_UPLOAD_ENDPOINT =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";

/**
 * Uploads raw bytes to the Google Files API and returns the resulting file
 * reference. The returned `uri` is the full
 * `https://generativelanguage.googleapis.com/v1beta/files/{name}` URL the
 * Gemini API expects inside a `fileData.fileUri` part.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/files
 */
export async function uploadBlobToGoogleFiles({
  buffer,
  mediaType,
  filename,
  apiKey,
}: {
  buffer: Uint8Array;
  mediaType: string;
  filename: string;
  apiKey: string;
}): Promise<{ uri: string; name: string; mimeType: string }> {
  const size = buffer.byteLength;

  const startRes = await fetch(
    `${GOOGLE_FILES_UPLOAD_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(size),
        "X-Goog-Upload-Header-Content-Type": mediaType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: filename } }),
    }
  );

  if (!startRes.ok) {
    const detail = await startRes.text().catch(() => "");
    throw new Error(
      `Google Files upload start failed (${startRes.status}): ${detail}`
    );
  }

  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    throw new Error("Google Files API did not return an X-Goog-Upload-URL");
  }

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: Buffer.from(buffer),
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => "");
    throw new Error(
      `Google Files upload finalize failed (${uploadRes.status}): ${detail}`
    );
  }

  const payload = (await uploadRes.json()) as {
    file?: { name?: string; uri?: string; mimeType?: string };
  };

  if (!payload.file?.uri || !payload.file.name) {
    throw new Error("Google Files API response missing file.uri or file.name");
  }

  return {
    uri: payload.file.uri,
    name: payload.file.name,
    mimeType: payload.file.mimeType ?? mediaType,
  };
}

/**
 * Rewrites every model-message file part that is still pointing at a private
 * blob or a `data:` URL into a real Google Files URI. The Google provider
 * already converts a `URL` `part.data` into `fileData.fileUri`, so the SDK
 * passes it through without re-downloading (the URL matches
 * `supportedUrls.image/*` which accepts any `https?://...`).
 *
 * Falls back to inline base64 if the upload fails so the chat never breaks
 * because of an upload hiccup.
 */
export async function toGoogleFileModelMessages(
  messages: ModelMessages,
  apiKey: string | undefined
): Promise<ModelMessages> {
  const out: ModelMessages = [];

  for (const message of messages) {
    const content = (message as { content: unknown }).content;
    if (!Array.isArray(content)) {
      out.push(message);
      continue;
    }

    const nextContent: unknown[] = [];

    for (const rawPart of content) {
      if (
        !rawPart ||
        typeof rawPart !== "object" ||
        (rawPart as { type?: string }).type !== "file"
      ) {
        nextContent.push(rawPart);
        continue;
      }

      const part = rawPart as FileModelPart;

      // Already an http(s) URL we did not produce — leave it alone, the
      // provider will either inline it or treat it as `fileData` itself.
      if (part.data instanceof URL) {
        nextContent.push(part);
        continue;
      }

      if (typeof part.data !== "string") {
        // Uint8Array etc. — already inline, no upload needed.
        nextContent.push(part);
        continue;
      }

      const loaded = await loadFilePartBytes(part);
      if (!loaded) {
        nextContent.push(part);
        continue;
      }

      if (!apiKey) {
        // No key available — fall back to inline base64 so the request still
        // contains the image bytes.
        nextContent.push({
          ...part,
          data: bytesToBase64(loaded.bytes),
          mediaType: loaded.mediaType,
        });
        continue;
      }

      try {
        const uploaded = await uploadBlobToGoogleFiles({
          buffer: loaded.bytes,
          mediaType: loaded.mediaType,
          filename: loaded.filename,
          apiKey,
        });

        nextContent.push({
          ...part,
          data: new URL(uploaded.uri),
          mediaType: uploaded.mimeType,
        });
      } catch (err) {
        console.error(
          "[chat] Google Files upload failed, falling back to inline:",
          err
        );
        nextContent.push({
          ...part,
          data: bytesToBase64(loaded.bytes),
          mediaType: loaded.mediaType,
        });
      }
    }

    out.push({ ...message, content: nextContent } as ModelMessages[number]);
  }

  return out;
}

async function loadFilePartBytes(part: FileModelPart): Promise<{
  bytes: Uint8Array;
  mediaType: string;
  filename: string;
} | null> {
  const { data, mediaType, filename } = part;

  if (typeof data === "string" && data.startsWith("data:")) {
    const parsed = parseBase64DataUrl(data);
    if (!parsed) {
      return null;
    }
    return {
      bytes: new Uint8Array(Buffer.from(parsed.base64, "base64")),
      mediaType: parsed.mediaType || mediaType,
      filename: filename || "upload",
    };
  }

  if (typeof data === "string") {
    const pathname = extractPrivateBlobPathname(data);
    if (!pathname) {
      return null;
    }
    try {
      const result = await get(pathname, { access: "private" });
      if (!result || !result.stream) {
        return null;
      }
      const arrayBuffer = await new Response(result.stream).arrayBuffer();
      return {
        bytes: new Uint8Array(arrayBuffer),
        mediaType: result.blob.contentType || mediaType,
        filename: filename || pathname.split("/").pop() || "upload",
      };
    } catch (err) {
      console.error("[chat] Failed to load private blob for upload:", err);
      return null;
    }
  }

  return null;
}

function parseBase64DataUrl(
  dataUrl: string
): { mediaType: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mediaType: match[1], base64: match[2] };
}

function extractPrivateBlobPathname(url: string): string | null {
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

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
