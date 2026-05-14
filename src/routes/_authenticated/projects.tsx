import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { makeScene, totalDurationFrames, DEFAULT_FPS, DEFAULT_WIDTH, DEFAULT_HEIGHT } from "@/remotion/types";

type ProjectRow = {
  id: string;
  title: string;
  updated_at: string;
  duration_frames: number;
  fps: number;
};

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "My videos — TU Explainer Studio" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data, error } = await supabase
      .from("projects")
      .select("id, title, updated_at, duration_frames, fps")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else setProjects(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function createProject() {
    if (!user) return;
    const scenes = [makeScene("title"), makeScene("talking-point"), makeScene("outro")];
    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        title: "Untitled video",
        scenes: scenes as unknown as never,
        fps: DEFAULT_FPS,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        duration_frames: totalDurationFrames(scenes),
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Could not create project");
      return;
    }
    navigate({ to: "/editor/$projectId", params: { projectId: data.id } });
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this video?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setProjects((p) => p.filter((x) => x.id !== id));
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-primary">My videos</h1>
        <Button onClick={createProject}>
          <Plus className="mr-2 h-4 w-4" /> New video
        </Button>
      </div>

      {loading ? (
        <p className="mt-12 text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="mt-16 rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-lg text-muted-foreground">No videos yet.</p>
          <Button onClick={createProject} className="mt-4">Create your first video</Button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary">
              <Link to="/editor/$projectId" params={{ projectId: p.id }} className="block">
                <div className="aspect-video rounded-lg bg-gradient-to-br from-primary to-[#001a33]" />
                <h3 className="mt-4 font-semibold text-primary">{p.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {(p.duration_frames / p.fps).toFixed(1)}s · updated {new Date(p.updated_at).toLocaleDateString()}
                </p>
              </Link>
              <button
                className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => deleteProject(p.id)}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}