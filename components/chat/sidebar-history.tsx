"use client";

import { isToday, isYesterday, subMonths, subWeeks } from "date-fns";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Chat } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";
import { getDicebearAvatarUrl } from "@/lib/utils/avatar";
import { LoaderIcon } from "./icons";
import { ChatItem } from "./sidebar-history-item";
import { InboxIcon } from "lucide-react";

type Member = {
  id: string;
  name: string;
  gender: string | null;
};

type ChatWithDateGroups = {
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

export type ChatHistory = {
  chats: Chat[];
  hasMore: boolean;
};

const PAGE_SIZE = 20;

const groupChatsByDate = (chats: Chat[]): ChatWithDateGroups => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(chat.createdAt);

      if (isToday(chatDate)) {
        groups.today.push(chat);
      } else if (isYesterday(chatDate)) {
        groups.yesterday.push(chat);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(chat);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(chat);
      } else {
        groups.older.push(chat);
      }

      return groups;
    },
    {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: [],
    } as ChatWithDateGroups
  );
};

const DATE_SECTION_LABELS: Array<{
  key: keyof ChatWithDateGroups;
  label: string;
}> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "lastWeek", label: "Last 7 days" },
  { key: "lastMonth", label: "Last 30 days" },
  { key: "older", label: "Older" },
];

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory
) {
  if (previousPageData && previousPageData.hasMore === false) {
    return null;
  }

  if (pageIndex === 0) {
    return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history?limit=${PAGE_SIZE}`;
  }

  const firstChatFromPage = previousPageData.chats.at(-1);

  if (!firstChatFromPage) {
    return null;
  }

  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/history?ending_before=${firstChatFromPage.id}&limit=${PAGE_SIZE}`;
}

export function SidebarHistory({
  user,
  members,
}: {
  user: User | undefined;
  members: Member[];
}) {
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const id = pathname?.startsWith("/chat/") ? pathname.split("/")[2] : null;

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(
    user ? getChatHistoryPaginationKey : () => null,
    fetcher,
    { fallbackData: [], revalidateOnFocus: false }
  );

  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory = paginatedChatHistories
    ? paginatedChatHistories.every((page) => page.chats.length === 0)
    : false;

  const handleDelete = () => {
    const chatToDelete = deleteId;
    const isCurrentChat = pathname === `/chat/${chatToDelete}`;

    setShowDeleteDialog(false);

    if (isCurrentChat) {
      router.replace("/");
    }

    mutate((chatHistories) => {
      if (chatHistories) {
        return chatHistories.map((chatHistory) => ({
          ...chatHistory,
          chats: chatHistory.chats.filter((chat) => chat.id !== chatToDelete),
        }));
      }
    });

    fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat?id=${chatToDelete}`,
      { method: "DELETE" }
    );

    toast.success("Chat deleted");
  };

  // Build a per-member chat grouping. Members with zero chats are hidden —
  // a member section with no chats is just visual noise. Unassigned chats
  // (memberId is null OR references a member that's been deleted) fall into
  // a final "Unassigned" section.
  const memberGroups = useMemo(() => {
    const allChats = paginatedChatHistories
      ? paginatedChatHistories.flatMap((p) => p.chats)
      : [];

    const memberMap = new Map<string, Member>(members.map((m) => [m.id, m]));
    const buckets = new Map<string, Chat[]>();

    for (const member of members) {
      buckets.set(member.id, []);
    }

    const unassigned: Chat[] = [];

    for (const chat of allChats) {
      const key =
        chat.memberId && memberMap.has(chat.memberId) ? chat.memberId : null;
      if (key) {
        buckets.get(key)!.push(chat);
      } else {
        unassigned.push(chat);
      }
    }

    // Order members by the most recent chat (descending); unassigned always last.
    const membersWithChats = members
      .filter((m) => (buckets.get(m.id)?.length ?? 0) > 0)
      .sort((a, b) => {
        const aLatest = buckets.get(a.id)![0].createdAt;
        const bLatest = buckets.get(b.id)![0].createdAt;
        return new Date(bLatest).getTime() - new Date(aLatest).getTime();
      });

    return {
      membersWithChats,
      unassigned,
      buckets,
    };
  }, [paginatedChatHistories, members]);

  if (!user) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-[13px] text-sidebar-foreground/60">
            Login to save and revisit previous chats!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
          History
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col gap-0.5 px-1">
            {[44, 32, 28, 64, 52].map((item) => (
              <div
                className="flex h-8 items-center gap-2 rounded-lg px-2"
                key={item}
              >
                <div
                  className="h-3 max-w-(--skeleton-width) flex-1 animate-pulse rounded-md bg-sidebar-foreground/[0.06]"
                  style={
                    {
                      "--skeleton-width": `${item}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (hasEmptyChatHistory) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
          History
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-[13px] text-sidebar-foreground/60">
            Your conversations will appear here once you start chatting!
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  const renderChatList = (chats: Chat[]) => {
    const dateGroups = groupChatsByDate(chats);
    return (
      <div className="flex flex-col gap-2.5">
        {DATE_SECTION_LABELS.map(({ key, label }) => {
          const chatsInGroup = dateGroups[key];
          if (chatsInGroup.length === 0) return null;
          return (
            <div key={key}>
              <div className="px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-sidebar-foreground/40">
                {label}
              </div>
              {chatsInGroup.map((chat) => (
                <ChatItem
                  chat={chat}
                  isActive={chat.id === id}
                  key={chat.id}
                  onDelete={(chatId) => {
                    setDeleteId(chatId);
                    setShowDeleteDialog(true);
                  }}
                  setOpenMobile={setOpenMobile}
                />
              ))}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
          <span>History</span>
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <div className="flex flex-col gap-5">
              {memberGroups.membersWithChats.map((member) => {
                const chats = memberGroups.buckets.get(member.id) ?? [];
                return (
                  <div className="flex flex-col gap-1" key={member.id}>
                    <div className="flex items-center gap-1.5 px-2 py-0.5">
                      <img
                        alt={member.name}
                        className="size-4 rounded-full bg-muted border border-sidebar-border shrink-0"
                        src={getDicebearAvatarUrl(member.name, member.gender)}
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/80">
                        {member.name}
                      </span>
                      <span className="ml-auto text-[9px] tabular-nums text-sidebar-foreground/40">
                        {chats.length}
                      </span>
                    </div>
                    {renderChatList(chats)}
                  </div>
                );
              })}

              {memberGroups.unassigned.length > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 px-2 py-0.5">
                    <InboxIcon className="size-3.5 text-sidebar-foreground/40" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/60">
                      Unassigned
                    </span>
                    <span className="ml-auto text-[9px] tabular-nums text-sidebar-foreground/40">
                      {memberGroups.unassigned.length}
                    </span>
                  </div>
                  {renderChatList(memberGroups.unassigned)}
                </div>
              )}
            </div>
          </SidebarMenu>

          <motion.div
            onViewportEnter={() => {
              if (!isValidating && !hasReachedEnd) {
                setSize((size) => size + 1);
              }
            }}
          />

          {hasReachedEnd ? null : (
            <div className="mt-1 flex flex-row items-center gap-2 px-4 py-2 text-sidebar-foreground/50">
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              <div className="text-[11px]">Loading...</div>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your
              chat and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
