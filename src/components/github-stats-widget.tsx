import { Github, Users, BookOpen } from "lucide-react";
import Link from "next/link";

export async function GithubStatsWidget({ session }: { session: any }) {
  if (!session?.accessToken) return null;

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      next: { revalidate: 3600 }
    });
    
    if (!res.ok) return null;
    const data = await res.json();

    return (
      <div className="bg-linear-to-br from-accent to-transparent border border-border p-6 rounded-2xl transition-all duration-300 hover:border-blue-500/30">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold">GitHub Profile</h3>
          <Github className="w-4 h-4 text-muted-foreground" />
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Public Repos</span>
              <span className="text-sm font-bold text-foreground">{data.public_repos}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
            <Users className="w-4 h-4 text-green-400" />
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Followers</span>
              <span className="text-sm font-bold text-foreground">{data.followers}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <Link 
            href={data.html_url} 
            target="_blank"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 group"
          >
            View Profile on GitHub 
            <span className="transform group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>
      </div>
    );
  } catch (e) {
    return null;
  }
}
