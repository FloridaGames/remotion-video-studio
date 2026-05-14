import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Cloud } from "lucide-react";

export const Route = createFileRoute("/_authenticated/export/$projectId")({
  component: ExportPage,
});

function ExportPage() {
  const { projectId } = Route.useParams();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Button asChild variant="ghost" size="sm">
        <Link to="/editor/$projectId" params={{ projectId }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to editor
        </Link>
      </Button>
      <h1 className="mt-6 text-3xl font-bold text-primary">Export to MP4</h1>
      <p className="mt-3 text-muted-foreground">
        Cloudflare Workers can't render video, so export goes through Remotion Lambda
        in your AWS account. Setup is a one-time job.
      </p>

      <div className="mt-8 rounded-xl border border-accent/40 bg-accent/10 p-6">
        <div className="flex items-center gap-2 text-primary">
          <Cloud className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Setup needed</h2>
        </div>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-foreground">
          <li>Create an AWS account and an IAM user with Remotion Lambda's required policies.</li>
          <li>
            On your local machine, clone the same Remotion code we ship in this app and run:
            <pre className="mt-2 overflow-x-auto rounded bg-card p-3 text-xs">
{`npx remotion lambda functions deploy
npx remotion lambda sites create src/remotion/index.ts --site-name=tu-explainer`}
            </pre>
          </li>
          <li>
            Add 5 secrets via Lovable Cloud:
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              <li><code>REMOTION_AWS_ACCESS_KEY_ID</code></li>
              <li><code>REMOTION_AWS_SECRET_ACCESS_KEY</code></li>
              <li><code>REMOTION_AWS_REGION</code> (e.g. <code>eu-central-1</code>)</li>
              <li><code>REMOTION_LAMBDA_FUNCTION_NAME</code> (from step 2)</li>
              <li><code>REMOTION_LAMBDA_SERVE_URL</code> (from step 2)</li>
            </ul>
          </li>
          <li>Ask Lovable to "wire up the Lambda render server function" and the Export button will start working.</li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Project ID for reference: <code>{projectId}</code>
        </p>
      </div>
    </main>
  );
}