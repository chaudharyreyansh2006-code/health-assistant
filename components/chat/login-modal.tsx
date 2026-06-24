"use client";

import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveChat } from "@/hooks/use-active-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, register } from "@/app/(auth)/actions";
import { toast } from "sonner";
import { HeartPulseIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function LoginModal() {
  const { isLoginOpen, setIsLoginOpen } = useActiveChat();
  const { update: updateSession } = useSession();
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("email", email);
        formData.append("password", password);

        if (mode === "login") {
          const res = await login({ status: "idle" }, formData);
          if (res.status === "success") {
            toast.success("Successfully signed in!");
            await updateSession();
            setIsLoginOpen(false);
            const params = new URLSearchParams(window.location.search);
            const callbackUrl = params.get("callbackUrl") || "/";
            router.push(callbackUrl);
            router.refresh();
          } else if (res.status === "failed") {
            toast.error("Invalid email or password!");
          } else {
            toast.error("Validation failed! Passwords must be at least 6 characters.");
          }
        } else {
          const res = await register({ status: "idle" }, formData);
          if (res.status === "success") {
            toast.success("Account created and signed in!");
            await updateSession();
            setIsLoginOpen(false);
            const params = new URLSearchParams(window.location.search);
            const callbackUrl = params.get("callbackUrl") || "/";
            router.push(callbackUrl);
            router.refresh();
          } else if (res.status === "user_exists") {
            toast.error("Account with this email already exists!");
          } else if (res.status === "failed") {
            toast.error("Failed to create account!");
          } else {
            toast.error("Validation failed! Passwords must be at least 6 characters.");
          }
        }
      } catch (err) {
        console.error(err);
        toast.error("Something went wrong!");
      }
    });
  };

  return (
    <Dialog open={isLoginOpen} onOpenChange={setIsLoginOpen}>
      <DialogContent className="border-border/30 bg-card/85 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden max-w-sm rounded-3xl">
        <div className="relative p-6 pt-8 space-y-6">
          {/* Subtle Background Glow */}
          <div className="absolute -top-12 -left-12 size-36 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 size-36 rounded-full bg-teal-500/10 blur-2xl pointer-events-none" />

          {/* Clinical Header Icon */}
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="flex items-center justify-center size-12 rounded-2xl bg-primary/15 border border-primary/20 text-primary shadow-inner">
              <HeartPulseIcon className="size-6 animate-pulse" />
            </div>
            <DialogTitle className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-teal-500 bg-clip-text text-transparent">
              {mode === "login" ? "Welcome back" : "Create Account"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground/80 max-w-[240px]">
              {mode === "login" 
                ? "Sign in to unlock family health check-ins, record storage, and clinical memory." 
                : "Get started for free to access medical analysis and family circle workspaces."}
            </DialogDescription>
          </div>

          {/* Tab Switcher */}
          <div className="flex p-1 bg-muted/60 rounded-xl border border-border/30">
            <button
              type="button"
              className={cn(
                "flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all duration-200",
                mode === "login"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all duration-200",
                mode === "register"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setMode("register")}
            >
              Sign Up
            </button>
          </div>

          {/* Animated Form container */}
          <form onSubmit={handleAction} className="space-y-4">
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground/80">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@email.com"
                  className="h-10 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors text-xs"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground/80">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="h-10 rounded-xl border-border/50 bg-muted/30 focus:bg-background transition-colors text-xs"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-10 rounded-xl font-bold text-xs bg-gradient-to-r from-primary to-teal-500 hover:opacity-90 active:scale-98 transition-all duration-150 shadow-md text-primary-foreground"
            >
              {isPending ? "Connecting..." : mode === "login" ? "Sign In" : "Sign Up"}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
