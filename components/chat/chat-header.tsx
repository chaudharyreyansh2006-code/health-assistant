"use client";

import { PanelLeftIcon, HeartPulseIcon, ArrowLeftIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useActiveChat } from "@/hooks/use-active-chat";
import { fetcher } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: string;
  isReadonly: boolean;
}) {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const { memberId } = useActiveChat();

  const { data: member } = useSWR(
    memberId ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/member?id=${memberId}` : null,
    fetcher
  );

  if (state === "collapsed" && !isMobile) {
    return null;
  }

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

  return (
    <header className="sticky top-0 flex h-14 items-center gap-2 bg-sidebar px-3 border-b border-border/20">
      <Button
        className="md:hidden"
        onClick={toggleSidebar}
        size="icon-sm"
        variant="ghost"
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      {/* Member Details or Default Health Icon */}
      <div className="flex items-center gap-2 md:ml-2">
        <HeartPulseIcon className="size-4 text-primary animate-pulse" />
        {member ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              Health Chat: {member.name}
            </span>
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${getRelationshipBadgeColor(member.relationship)}`}>
              {member.relationship}
            </Badge>
          </div>
        ) : (
          <span className="text-xs font-semibold text-foreground">
            General Health Consultation
          </span>
        )}
      </div>

      {/* Go to Family Portal Link */}
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="ml-auto gap-1 text-xs text-muted-foreground hover:text-foreground h-8"
      >
        <Link href="/family">
          <UsersIcon className="size-3.5" />
          <span className="hidden sm:inline">Family Portal</span>
        </Link>
      </Button>
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
