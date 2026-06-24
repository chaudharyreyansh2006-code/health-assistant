"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteFamilyAction } from "./actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DeleteFamilyButton({ familyId, familyName }: { familyId: string; familyName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteFamilyAction(familyId);
      toast.success(`"${familyName}" workspace deleted`);
      router.refresh();
    } catch {
      toast.error("Failed to delete workspace");
    } finally {
      setIsDeleting(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className="absolute top-3 right-3 size-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all duration-200 z-10"
        title="Delete workspace"
      >
        <Trash2Icon className="size-3.5" />
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{familyName}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this family workspace, all its
              members, health summaries, and medical documents. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting\u2026" : "Delete Workspace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
