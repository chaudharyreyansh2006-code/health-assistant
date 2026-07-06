-- Rename MedicalDocument.url to blobPathname.
-- The column now stores the Vercel Blob *pathname* of a privately-accessed
-- blob (the public URL is gone; reads go through the authed download route
-- which calls `get(pathname, { access: "private" })` server-side).
ALTER TABLE "MedicalDocument" RENAME COLUMN "url" TO "blobPathname";
