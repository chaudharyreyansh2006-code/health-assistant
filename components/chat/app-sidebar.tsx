"use client";

import {
  MessageSquareIcon,
  PanelLeftIcon,
  PenSquareIcon,
  TrashIcon,
  UsersIcon,
  HeartIcon,
} from "lucide-react";
import useSWR from "swr";
import { fetcher } from "@/lib/utils";
import { getDicebearAvatarUrl } from "@/lib/utils/avatar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import {
  getChatHistoryPaginationKey,
  SidebarHistory,
} from "@/components/chat/sidebar-history";
import { SidebarUserNav } from "@/components/chat/sidebar-user-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/**
 * The sidebar's "Family Portals" group renders the user's single family
 * (from `/api/me/family`) and its members. After migration 0004 there is
 * no list-of-workspaces concept — every user has exactly one family,
 * identified by `User.id` — so the "Delete workspace" affordance and the
 * per-family delete dialog are gone.
 */
type FamilyResponse = {
  families: Array<{
    id: string;
    name: string;
    members: Array<{
      id: string;
      name: string;
      gender: string | null;
    }>;
  }>;
};

export function AppSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile, toggleSidebar } = useSidebar();
  const { mutate } = useSWRConfig();
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);

  const { data: familyData } = useSWR<FamilyResponse>(
    user
      ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/me/family`
      : null,
    fetcher,
  );

  const family = familyData?.families?.[0];
  const members = family?.members ?? [];

  const handleDeleteAll = () => {
    setShowDeleteAllDialog(false);
    router.replace("/");
    mutate(unstable_serialize(getChatHistoryPaginationKey), [], {
      revalidate: false,
    });

    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history`, {
      method: "DELETE",
    });

    toast.success("All chats deleted");
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="pb-0 pt-3">
          <SidebarMenu>
            <SidebarMenuItem className="flex flex-row items-center justify-between">
              <div className="group/logo relative flex items-center justify-center">
                <SidebarMenuButton
                  asChild
                  className="size-8 !px-0 items-center justify-center group-data-[collapsible=icon]:group-hover/logo:opacity-0"
                  tooltip="Chatbot"
                >
                  <Link href="/" onClick={() => setOpenMobile(false)}>
                    <MessageSquareIcon className="size-4 text-sidebar-foreground/50" />
                  </Link>
                </SidebarMenuButton>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      className="pointer-events-none absolute inset-0 size-8 opacity-0 group-data-[collapsible=icon]:pointer-events-auto group-data-[collapsible=icon]:group-hover/logo:opacity-100"
                      onClick={() => toggleSidebar()}
                    >
                      <PanelLeftIcon className="size-4" />
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent className="hidden md:block" side="right">
                    Open sidebar
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="group-data-[collapsible=icon]:hidden">
                <SidebarTrigger className="text-sidebar-foreground/60 transition-colors duration-150 hover:text-sidebar-foreground" />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="pt-1">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="h-8 rounded-lg border border-sidebar-border text-[13px] text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    onClick={() => {
                      setOpenMobile(false);
                      router.push("/");
                    }}
                    tooltip="New Chat"
                  >
                    <PenSquareIcon className="size-4" />
                    <span className="font-medium">New chat</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {user && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="rounded-lg text-sidebar-foreground/40 transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setShowDeleteAllDialog(true)}
                      tooltip="Delete All Chats"
                    >
                      <TrashIcon className="size-4" />
                      <span className="text-[13px]">Delete all</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {user && (
            <SidebarGroup className="py-0">
              <SidebarGroupLabel className="flex items-center justify-between px-2">
                <span className="text-[10px] font-semibold text-sidebar-foreground/60 tracking-wider uppercase">
                  Family
                </span>
                <Link
                  className="hover:text-primary transition-colors text-[10px] text-muted-foreground"
                  href="/family"
                  onClick={() => setOpenMobile(false)}
                >
                  Manage
                </Link>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-2">
                  {family && (
                    <div className="space-y-1 px-1">
                      <Link
                        className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-foreground/80 hover:text-primary transition-colors flex-1 min-w-0"
                        href="/family"
                        onClick={() => setOpenMobile(false)}
                      >
                        <UsersIcon className="size-3.5 text-primary/70 shrink-0" />
                        <span className="truncate">{family.name}</span>
                      </Link>
                      <div className="pl-4 space-y-0.5 border-l border-sidebar-border ml-3">
                        {members.map((mem) => (
                          <Link
                            className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/30 rounded-md transition-colors"
                            href={`/?memberId=${mem.id}`}
                            key={mem.id}
                            onClick={() => setOpenMobile(false)}
                          >
                            <img
                              alt={mem.name}
                              className="size-4 rounded-full bg-muted border border-border/20 shrink-0"
                              src={getDicebearAvatarUrl(mem.name, mem.gender)}
                            />
                            <span className="truncate">{mem.name}</span>
                          </Link>
                        ))}
                        {members.length === 0 && (
                          <span className="text-[10px] pl-2 text-muted-foreground/50 italic block">
                            No members yet
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {!family && (
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        className="text-muted-foreground"
                        onClick={() => {
                          setOpenMobile(false);
                          router.push("/family");
                        }}
                      >
                        <HeartIcon className="size-4" />
                        <span>Setup Family</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          <SidebarHistory members={members} user={user} />
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border pt-2 pb-3">
          {user && <SidebarUserNav user={user} />}
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <AlertDialog
        onOpenChange={setShowDeleteAllDialog}
        open={showDeleteAllDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all
              your chats and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll}>
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
