import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth, signOut } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { Film } from "lucide-react";

export function Header() {
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2 text-primary">
          <Film className="h-5 w-5" />
          <span className="font-bold tracking-tight">TU Explainer Studio</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link
                to="/projects"
                className="text-foreground hover:text-primary"
                activeProps={{ className: "text-primary font-semibold" }}
              >
                My videos
              </Link>
              <span className="hidden text-muted-foreground md:inline">{user.email}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/" });
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-foreground hover:text-primary">
                Sign in
              </Link>
              <Button asChild size="sm">
                <Link to="/signup">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}