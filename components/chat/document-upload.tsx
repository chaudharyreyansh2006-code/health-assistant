"use client";

import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  FileTextIcon,
  Loader2Icon,
  UploadCloudIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/utils";

// The documents list endpoint intentionally omits the blob pathname (and any
// URL) for privacy — files are only reachable via the ownership-checked
// download route. This is the client-facing shape of that list.
type ListedMedicalDocument = {
  id: string;
  memberId: string;
  fileName: string;
  fileType: string;
  uploadedAt: Date | string;
};

export function DocumentUpload({ memberId }: { memberId: string }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const {
    data: documents,
    error,
    mutate,
  } = useSWR<ListedMedicalDocument[]>(
    memberId ? `/api/documents?memberId=${memberId}` : null,
    fetcher
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Support PDF, plain text, and common image formats. We also accept
    // legacy uploads by extension for browsers that don't populate `type`.
    const validTypes = [
      "application/pdf",
      "text/plain",
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
    ];
    const validExtensions = [
      ".txt",
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".gif",
    ];
    if (
      !validTypes.includes(file.type) &&
      !validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
    ) {
      toast.error("Please upload a PDF, TXT, or image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds the 10MB limit.");
      return;
    }

    setUploading(true);
    setProgress("Extracting text and generating medical embeddings...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("memberId", memberId);

    try {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to upload document");
      }

      toast.success("Document uploaded and indexed successfully!");
      mutate(); // Reload list
    } catch (err: any) {
      toast.error(err.message || "An error occurred during upload");
    } finally {
      setUploading(false);
      setProgress(null);
      // Clear input
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div className="relative border-2 border-dashed border-border/50 rounded-2xl p-6 bg-card/25 hover:bg-card/40 transition-colors duration-200 flex flex-col items-center justify-center text-center group">
        <input
          accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          disabled={uploading}
          onChange={handleFileUpload}
          type="file"
        />
        <div className="p-4 bg-primary/10 rounded-full text-primary group-hover:scale-110 transition-transform duration-300">
          {uploading ? (
            <Loader2Icon className="size-6 animate-spin" />
          ) : (
            <UploadCloudIcon className="size-6" />
          )}
        </div>
        <div className="mt-3 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {uploading ? "Indexing Medical Report..." : "Upload Medical Record"}
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {progress ||
              "Drag and drop your PDF, TXT, or image health report here, or click to browse."}
          </p>
          <p className="text-[10px] text-muted-foreground/80">
            PDF, TXT, or image up to 10MB. Chunks will be vectorized for instant
            AI diagnosis context.
          </p>
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">
          Uploaded Documents
        </h4>
        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-lg">
            <AlertTriangleIcon className="size-4" />
            <span>Failed to load documents list.</span>
          </div>
        )}

        {!documents && !error && (
          <div className="flex items-center justify-center py-6">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {documents && documents.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No medical reports uploaded yet.
          </p>
        )}

        {documents && documents.length > 0 && (
          <div className="divide-y divide-border/30 border border-border/30 rounded-xl overflow-hidden bg-card/10">
            {documents.map((doc) => (
              <div
                className="flex items-center justify-between p-3.5 hover:bg-card/30 transition-colors duration-150"
                key={doc.id}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-primary/5 text-primary rounded-lg">
                    <FileTextIcon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate max-w-[200px] sm:max-w-sm">
                      {doc.fileName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    asChild
                    className="size-7 text-muted-foreground hover:text-foreground"
                    size="icon"
                    variant="ghost"
                  >
                    <a
                      href={`/api/documents/${doc.id}/file`}
                      rel="noopener noreferrer"
                      target="_blank"
                      title="View Document"
                    >
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
