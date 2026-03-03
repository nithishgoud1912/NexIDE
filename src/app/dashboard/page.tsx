import { auth } from "@/auth";
import { redirect } from "next/navigation";
import {
  FolderOpen,
  Clock,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { RecentProjectsList } from "@/components/recent-projects";
import { DashboardActions } from "@/components/dashboard-actions";
import { SettingsWidget } from "@/components/settings-widget";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/auth/signin");
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Navbar */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-foreground shadow-lg shadow-blue-500/20">
              N
            </div>
            <span className="font-bold text-xl tracking-tight">NexIDE</span>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/profile"
              className="group flex items-center gap-4 hover:opacity-80 transition-opacity"
            >
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium group-hover:text-blue-400 transition-colors">
                  {session.user?.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {session.user?.email}
                </span>
              </div>
              {session.user?.image && (
                <Image
                  src={session.user.image}
                  alt="Profile"
                  width={36}
                  height={36}
                  className="rounded-full border border-border group-hover:border-blue-500/50 transition-colors"
                />
              )}
            </Link>
            <SettingsWidget>
              <button className="p-2 hover:bg-secondary rounded-full transition-colors">
                <Settings className="w-5 h-5 text-muted-foreground" />
              </button>
            </SettingsWidget>
            <Link
              href="/api/auth/signout"
              className="p-2 hover:bg-secondary rounded-full transition-colors"
            >
              <LogOut className="w-5 h-5 text-muted-foreground" />
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content Areas */}
          <div className="lg:col-span-2 space-y-12">
            {/* Header section */}
            <section>
              <h1 className="text-4xl font-bold bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                Welcome back, {session.user?.name?.split(" ")[0]}
              </h1>
              <p className="text-muted-foreground mt-2">
                Pick up where you left off or start something new.
              </p>
            </section>

            {/* Action Cards */}
            <DashboardActions session={session} />

            {/* Recent Section */}
            <RecentProjectsList />
          </div>

          {/* Sidebar / Stats */}
          <div className="space-y-6">
            <div className="bg-linear-to-br from-accent to-transparent border border-border p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold">Your Workspace</h3>
                <Settings className="w-4 h-4 text-muted-foreground" />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Theme</span>
                  <span className="text-xs px-2 py-1 rounded bg-secondary border border-border">
                    Modern Dark
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Storage</span>
                  <span className="text-xs px-2 py-1 rounded bg-secondary border border-border text-muted-foreground italic">
                    Local First
                  </span>
                </div>
              </div>

              <div className="mt-8 p-4 rounded-xl bg-blue-600/10 border border-blue-500/20">
                <p className="text-xs text-blue-300">
                  NexIDE is in Beta. Your local files are modified directly via
                  the File System Access API.
                </p>
              </div>
            </div>

            <div className="bg-secondary border border-border p-6 rounded-2xl">
              <h3 className="font-semibold mb-4 text-sm uppercase tracking-widest text-muted-foreground">
                Active Node Task
              </h3>
              <div className="flex items-center gap-4 text-muted-foreground">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm italic">WebContainer Idle</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
