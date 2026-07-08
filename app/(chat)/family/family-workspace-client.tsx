"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AddMemberForm } from "./add-member-form";
import { HealthMemories } from "@/components/chat/health-memories";
import { DocumentUpload } from "@/components/chat/document-upload";
import { TodayScreen } from "@/components/chat/today-screen";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  FileTextIcon,
  HeartIcon,
  MessageSquarePlusIcon,
  CalendarIcon,
  MoreHorizontalIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UsersIcon,
  CheckIcon,
} from "lucide-react";
import { deleteFamilyMemberAction } from "@/app/(chat)/family/actions";
import type { FamilyMember } from "@/lib/db/schema";
import { getDicebearAvatarUrl } from "@/lib/utils/avatar";

type View = "today" | "summary" | "documents";

/**
 * Family workspace layout:
 *
 *   Mobile (default):  the entire left rail (members list + add-form) is hidden.
 *                      A horizontal member-pill row at the top is the only way to
 *                      switch members; the "Manage" button opens a Sheet with the
 *                      rare-write UI (delete, add new). Today's content fills the
 *                      rest of the viewport.
 *
 *   Desktop (md+):     the left rail is visible (1/3 width) for quick switching
 *                      and add — but Today is still the dominant pane.
 *
 * The view switcher (Today / Health Summaries / Medical Documents) lives in
 * a "⋯" menu in the member header on both surfaces — the user said they
 * "hardly use" the secondary views, so a dropdown beat a tab strip.
 */
export function FamilyWorkspaceClient({
  userId: _userId,
  familyName,
  initialMembers,
  initialActiveMemberId,
}: {
  userId: string;
  familyName: string;
  initialMembers: FamilyMember[];
  initialActiveMemberId: string | null;
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    initialActiveMemberId ??
      (initialMembers.length > 0 ? initialMembers[0].id : null)
  );
  const [view, setView] = useState<View>("today");
  const [showDeleteMemberDialog, setShowDeleteMemberDialog] = useState(false);
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const [showManageSheet, setShowManageSheet] = useState(false);
  const router = useRouter();

  const selectedMember = initialMembers.find((m) => m.id === selectedMemberId);

  const getRelationshipBadgeColor = (rel: string) => {
    switch (rel.toLowerCase()) {
      case "self":
        return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
      case "spouse":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "child":
        return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
      case "parent":
        return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20";
      default:
        return "bg-muted text-muted-foreground border-border/30";
    }
  };

  const getAge = (dobString: string | null) => {
    if (!dobString) return null;
    const dob = new Date(dobString);
    const diffMs = Date.now() - dob.getTime();
    const ageDate = new Date(diffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const handleSelectMember = (id: string) => {
    setSelectedMemberId(id);
    setView("today");
    setShowManageSheet(false);
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-background p-4 md:p-10">
        <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
          {/* Header */}
          <div className="flex items-start sm:items-center justify-between border-b border-border/40 pb-4 md:pb-5 gap-3">
            <div className="space-y-0.5 md:space-y-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                {familyName}
              </h1>
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
                Manage profiles, daily routines, and clinical context.
              </p>
            </div>
            <Sheet onOpenChange={setShowManageSheet} open={showManageSheet}>
              <SheetTrigger asChild>
                <Button
                  className="shrink-0 gap-1.5 text-xs sm:text-sm"
                  size="sm"
                  variant="outline"
                >
                  <UsersIcon className="size-3.5" />
                  <span>Manage</span>
                </Button>
              </SheetTrigger>
              <SheetContent
                className="flex flex-col gap-0 p-0 w-[90%] sm:max-w-sm"
                side="right"
              >
                <SheetHeader className="border-b border-border/40">
                  <SheetTitle className="text-base">Manage Family</SheetTitle>
                  <SheetDescription className="text-xs">
                    Switch, add, or remove family member profiles.
                  </SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                  <div className="space-y-2.5">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Members
                    </h3>
                    {initialMembers.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-4 text-center border border-dashed border-border/50 rounded-xl bg-card/10">
                        No members yet — add the first one below.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {initialMembers.map((member) => {
                          const isSelected = member.id === selectedMemberId;
                          const age = getAge(member.dateOfBirth);
                          return (
                            <div
                              className={`group flex items-center justify-between p-2.5 rounded-xl border transition-colors cursor-pointer ${
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-border/40 bg-card/20 hover:bg-card/40"
                              }`}
                              key={member.id}
                              onClick={() => handleSelectMember(member.id)}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="size-8 rounded-lg overflow-hidden bg-muted/40 border border-border/30 shrink-0 flex items-center justify-center">
                                  <img
                                    alt={member.name}
                                    className="size-full object-cover"
                                    src={getDicebearAvatarUrl(
                                      member.name,
                                      member.gender
                                    )}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-foreground truncate">
                                    {member.name}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <Badge
                                      className={`text-[9px] px-1.5 py-0 border ${getRelationshipBadgeColor(member.relationship)}`}
                                      variant="outline"
                                    >
                                      {member.relationship}
                                    </Badge>
                                    {age !== null && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {age}y
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {isSelected && (
                                  <CheckIcon className="size-3.5 text-primary" />
                                )}
                                <Button
                                  aria-label={`Delete ${member.name}`}
                                  className="size-7 opacity-60 hover:opacity-100 hover:text-destructive hover:bg-destructive/5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      selectedMember?.id === member.id ||
                                      selectedMember === undefined
                                    ) {
                                      setShowDeleteMemberDialog(true);
                                    } else {
                                      // delete a non-active member — keep current selection
                                      setSelectedMemberId(member.id);
                                      setShowDeleteMemberDialog(true);
                                    }
                                  }}
                                  size="icon"
                                  variant="ghost"
                                >
                                  <Trash2Icon className="size-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Add Member
                    </h3>
                    <AddMemberForm />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Member switcher pills — visible on all viewports. Horizontal
              scroll on mobile (one tap to switch), wrap to a new line on
              desktop. Each pill is the only affordance the user needs to
              switch members in 90% of cases. */}
          {initialMembers.length > 0 && (
            <div
              className="flex gap-2 overflow-x-auto md:flex-wrap pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              key={initialMembers.length}
            >
              {initialMembers.map((member) => {
                const isSelected = member.id === selectedMemberId;
                return (
                  <button
                    className={`group flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all shrink-0 ${
                      isSelected
                        ? "border-foreground/30 bg-foreground/5 text-foreground"
                        : "border-border/40 bg-card/10 text-muted-foreground hover:text-foreground hover:bg-card/30"
                    }`}
                    key={member.id}
                    onClick={() => {
                      setSelectedMemberId(member.id);
                      setView("today");
                    }}
                    type="button"
                  >
                    <img
                      alt={member.name}
                      className="size-5 rounded-full bg-muted border border-border/30 shrink-0"
                      src={getDicebearAvatarUrl(member.name, member.gender)}
                    />
                    <span className="text-xs font-semibold tracking-tight">
                      {member.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Main Grid: desktop shows the full left rail (members + add form).
              Mobile skips it — the pills above + the "Manage" sheet replace
              the inline rail. */}
          <div className="grid gap-4 md:gap-6 md:grid-cols-3">
            {/* Desktop left rail (hidden on mobile) */}
            <div className="hidden md:block md:col-span-1 space-y-6">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Members
                </h2>
                <div className="space-y-2">
                  {initialMembers.map((member) => {
                    const isSelected = member.id === selectedMemberId;
                    const age = getAge(member.dateOfBirth);
                    return (
                      <div
                        className={`group relative flex items-center justify-between p-3.5 rounded-xl border transition-colors cursor-pointer ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border/40 bg-card/20 hover:bg-card/40"
                        }`}
                        key={member.id}
                        onClick={() => {
                          setSelectedMemberId(member.id);
                          setView("today");
                        }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="size-8 rounded-lg overflow-hidden bg-muted/40 border border-border/30 shrink-0 flex items-center justify-center">
                            <img
                              alt={member.name}
                              className="size-full object-cover"
                              src={getDicebearAvatarUrl(
                                member.name,
                                member.gender
                              )}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {member.name}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge
                                className={`text-[9px] px-1.5 py-0 border ${getRelationshipBadgeColor(member.relationship)}`}
                                variant="outline"
                              >
                                {member.relationship}
                              </Badge>
                              {age !== null && (
                                <span className="text-[10px] text-muted-foreground">
                                  {age}y
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          aria-label={`New chat with ${member.name}`}
                          asChild
                          className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-primary"
                          onClick={(e) => e.stopPropagation()}
                          size="icon"
                          variant="ghost"
                        >
                          <Link href={`/?memberId=${member.id}`}>
                            <MessageSquarePlusIcon className="size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <AddMemberForm />
            </div>

            {/* Right Column: Selected Member Workspace */}
            <div className="md:col-span-2">
              {selectedMember ? (
                <div className="border border-border/45 bg-card/20 backdrop-blur-md rounded-2xl p-4 md:p-6 space-y-4 md:space-y-6">
                  {/* Member Brief — compact on mobile */}
                  <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-9 md:size-11 rounded-xl overflow-hidden bg-muted border border-border/30 shrink-0 flex items-center justify-center">
                        <img
                          alt={selectedMember.name}
                          className="size-full object-cover"
                          src={getDicebearAvatarUrl(
                            selectedMember.name,
                            selectedMember.gender
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm md:text-lg font-bold text-foreground truncate">
                          {selectedMember.name}
                        </h2>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge
                            className={`text-[9px] md:text-[10px] border ${getRelationshipBadgeColor(selectedMember.relationship)}`}
                            variant="outline"
                          >
                            {selectedMember.relationship}
                          </Badge>
                          {selectedMember.dateOfBirth && (
                            <span className="hidden md:inline-flex text-xs text-muted-foreground items-center gap-1">
                              <CalendarIcon className="size-3" />
                              {new Date(
                                selectedMember.dateOfBirth
                              ).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label="More actions"
                            className="text-muted-foreground hover:text-foreground"
                            size="icon"
                            variant="ghost"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            View
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={() => setView("today")}
                          >
                            <CalendarIcon className="size-3.5" />
                            Today
                            {view === "today" ? (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                current
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setView("summary")}
                          >
                            <ShieldCheckIcon className="size-3.5" />
                            Health Summaries
                            {view === "summary" ? (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                current
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setView("documents")}
                          >
                            <FileTextIcon className="size-3.5" />
                            Medical Documents
                            {view === "documents" ? (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                current
                              </span>
                            ) : null}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() => setShowDeleteMemberDialog(true)}
                          >
                            <Trash2Icon className="size-3.5" />
                            Delete Profile
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        asChild
                        className="gap-1 h-8 md:h-9 px-2.5 md:px-3 bg-foreground text-background hover:bg-foreground/90 border-0 shadow-none font-semibold transition-all"
                        size="sm"
                      >
                        <Link href={`/?memberId=${selectedMember.id}`}>
                          <MessageSquarePlusIcon className="size-3.5" />
                          <span className="hidden sm:inline">Chat</span>
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {/* View content — Today is the default; the other two are
                      reached via the "⋯" menu in the member header above. */}
                  <div className="pt-1">
                    {view === "today" ? (
                      <TodayScreen memberId={selectedMember.id} />
                    ) : view === "summary" ? (
                      <HealthMemories memberId={selectedMember.id} />
                    ) : (
                      <DocumentUpload memberId={selectedMember.id} />
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full border border-dashed border-border/60 rounded-2xl flex flex-col items-center justify-center p-10 text-center space-y-3 bg-card/5">
                  <div className="p-3 bg-muted rounded-full text-muted-foreground">
                    <HeartIcon className="size-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">
                      No Member Selected
                    </p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Add a family member from{" "}
                      <button
                        className="underline"
                        onClick={() => setShowManageSheet(true)}
                        type="button"
                      >
                        Manage
                      </button>{" "}
                      to start tracking medications, vitals, and documents.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog
        onOpenChange={setShowDeleteMemberDialog}
        open={showDeleteMemberDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{selectedMember?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this family member, their health
              summaries, and all medical records. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingMember}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletingMember}
              onClick={async () => {
                if (!selectedMember) {
                  return;
                }
                setIsDeletingMember(true);
                try {
                  await deleteFamilyMemberAction(selectedMember.id);
                  toast.success(`"${selectedMember.name}" profile deleted`);
                  setSelectedMemberId(
                    initialMembers.find((m) => m.id !== selectedMember.id)
                      ?.id ?? null
                  );
                  router.refresh();
                } catch (err: any) {
                  toast.error(err.message || "Failed to delete profile");
                } finally {
                  setIsDeletingMember(false);
                  setShowDeleteMemberDialog(false);
                }
              }}
            >
              {isDeletingMember ? "Deleting…" : "Delete Profile"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
