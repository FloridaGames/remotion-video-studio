import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Film, Layers, Mic, Download } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TU Explainer Studio — Build instructional videos in your browser" },
      {
        name: "description",
        content:
          "A Tilburg University tool for staff and students to build short instructional explainer videos. Pick a template, edit scenes, preview live, and export an MP4.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-20">
        <section className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-accent">
              Tilburg University
            </p>
            <h1 className="text-5xl font-bold leading-[1.05] tracking-tight text-primary md:text-6xl">
              Build instructional explainer videos in your browser.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Pick a template, edit scenes, drop in your visuals and voiceover,
              and export a polished MP4 — without opening a video editor.
            </p>
            <div className="mt-8 flex gap-3">
              <Button asChild size="lg">
                <Link to="/signup">Create your first video</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          </div>
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-primary shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-[#001a33]" />
            <div className="relative flex h-full flex-col justify-center p-12 text-primary-foreground">
              <div className="mb-6 h-2 w-32 bg-accent" />
              <div className="text-5xl font-bold leading-tight">
                What is reinforcement learning?
              </div>
              <div className="mt-4 text-xl opacity-80">A 90-second introduction</div>
            </div>
          </div>
        </section>

        <section className="mt-24 grid gap-8 md:grid-cols-4">
          {[
            { Icon: Layers, title: "Scene templates", body: "Title, talking point, image + caption, outro." },
            { Icon: Film, title: "Live preview", body: "See every change instantly in the browser." },
            { Icon: Mic, title: "Voiceover", body: "Drop in an audio track to narrate." },
            { Icon: Download, title: "Export MP4", body: "Render to a real video file via the cloud." },
          ].map(({ Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6">
              <Icon className="h-6 w-6 text-accent" />
              <h3 className="mt-4 text-base font-semibold text-primary">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Built for Tilburg University · staff &amp; students
      </footer>
    </div>
  );
}
