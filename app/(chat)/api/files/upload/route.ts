import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { isRegularSession } from "@/lib/auth/guards";

// 10 MB hard cap — medical PDFs can be a few MB, lab reports can be heavier.
// We must validate by checking the duck-typed `size` and `type` properties
// because `z.instanceof(Blob)` fails in non-browser runtimes (Node, Edge,
// and the Vercel upload worker), which is the entire reason chat input
// uploads were broken before this rewrite.
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

const FileSchema = z.object({
  file: z
    .any()
    .refine(
      (file) =>
        file != null &&
        typeof file === "object" &&
        "size" in file &&
        typeof (file as { size: unknown }).size === "number",
      { message: "Invalid file object" }
    )
    .refine((file) => (file as { size: number }).size > 0, {
      message: "Uploaded file is empty",
    })
    .refine((file) => (file as { size: number }).size <= MAX_FILE_SIZE, {
      message: `File size should be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    })
    .refine(
      (file) =>
        ALLOWED_MIME_TYPES.includes(
          (file as { type: string }).type as (typeof ALLOWED_MIME_TYPES)[number]
        ),
      { message: "File type should be JPEG, PNG, or PDF" }
    ),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!isRegularSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Failed to parse multipart form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const validatedFile = FileSchema.safeParse({ file });

  if (!validatedFile.success) {
    const errorMessage = validatedFile.error.errors
      .map((error) => error.message)
      .join(", ");

    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  const fileObject = file as File;
  // Some runtimes strip the original filename, so we always fall back to a
  // timestamped name to avoid the dreaded "file.name is undefined" crash.
  const filename = fileObject.name || `upload-${Date.now()}`;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileBuffer = await fileObject.arrayBuffer();

  try {
    // Private store: the blob is NOT publicly readable. The returned `url`
    // can only be used via `get(pathname, { access: "private" })` server-side
    // (see /api/files/download). We return `pathname` so the client can build
    // authed preview URLs, and `url` for the chat route to inline into the
    // model message.
    const data = await put(safeName, fileBuffer, {
      access: "private",
      addRandomSuffix: true,
      contentType: fileObject.type || undefined,
    });

    return NextResponse.json({
      url: data.url,
      pathname: data.pathname,
      contentType: data.contentType,
    });
  } catch (error) {
    console.error("Vercel Blob upload failed:", error);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
