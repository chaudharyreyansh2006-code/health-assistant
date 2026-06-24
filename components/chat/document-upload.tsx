"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/utils";
import {
  FileTextIcon,
  UploadCloudIcon,
  Loader2Icon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { MedicalDocument } from "@/lib/db/schema";

export function DocumentUpload({ memberId }: { memberId: string }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const {
    data: documents,
    error,
    mutate,
  } = useSWR<MedicalDocument[]>(
    memberId ? `/api/documents?memberId=${memberId}` : null,
    fetcher
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Support pdf and plain text files
    const validTypes = ["application/pdf", "text/plain"];
    if (!validTypes.includes(file.type) && !file.name.endsWith(".txt") && !file.name.endsWith(".pdf")) {
      toast.error("Please upload a PDF or TXT file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error("File size exceeds 8MB limit.");
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
          type="file"
          accept=".pdf,.txt"
          onChange={handleFileUpload}
          disabled={uploading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
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
            {progress || "Drag and drop your PDF or TXT health report here, or click to browse."}
          </p>
          <p className="text-[10px] text-muted-foreground/80">
            PDF or TXT up to 8MB. Chunks will be vectorized for instant AI diagnosis context.
          </p>
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Uploaded Documents</h4>
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
                key={doc.id}
                className="flex items-center justify-between p-3.5 hover:bg-card/30 transition-colors duration-150"
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
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    asChild
                  >
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" title="View Document">
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
