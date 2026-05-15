import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  checkIsAdmin,
  listAdminUsers,
  setUserRestrictions,
  listAdminOrgVideos,
  addOrgVideo,
  deleteOrgVideo,
  createOrgVideoUploadUrl,
  suggestOrgVideoMetadata,
  type AdminUserRow,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Lock, Eye, Upload, Gauge, Plus, Sparkles } from "lucide-react";

const DEFAULT_RENDER_QUOTA = 100;

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — TU Explainer Studio" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const check = useServerFn(checkIsAdmin);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    check()
      .then(({ isAdmin }) => setAllowed(isAdmin))
      .catch(() => setAllowed(false));
  }, [check]);

  if (allowed === null) {
    return <div className="mx-auto max-w-7xl px-6 py-12 text-muted-foreground">Loading…</div>;
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-16">
        <h1 className="text-2xl font-bold text-foreground">Forbidden</h1>
        <p className="mt-2 text-muted-foreground">You don't have admin access.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/projects" })}>
          Back to my videos
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground">Admin</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage users and the shared organization video library.
      </p>
      <Tabs defaultValue="users" className="mt-6">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="library">Org library</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="library" className="mt-4">
          <OrgLibraryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatMinutes(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function UsersTab() {
  const list = useServerFn(listAdminUsers);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => list(),
  });
  const [editing, setEditing] = useState<AdminUserRow | null>(null);

  return (
    <div className="rounded-lg border border-border bg-card">
      {isLoading ? (
        <div className="p-6 text-muted-foreground">Loading users…</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Time in tool</TableHead>
              <TableHead>Videos</TableHead>
              <TableHead>Renders (total / month)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.users ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="font-medium text-foreground">{u.email ?? "—"}</div>
                  {u.displayName && (
                    <div className="text-xs text-muted-foreground">{u.displayName}</div>
                  )}
                </TableCell>
                <TableCell>{formatMinutes(u.totalSessionMinutes)}</TableCell>
                <TableCell>{u.projectCount}</TableCell>
                <TableCell>
                  {u.renderCount} / {u.rendersThisMonth}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {u.restrictions.locked && (
                      <span className="rounded bg-destructive/10 px-2 py-0.5 text-destructive">
                        Locked
                      </span>
                    )}
                    {u.restrictions.readOnly && (
                      <span className="rounded bg-muted px-2 py-0.5">Read-only</span>
                    )}
                    {u.restrictions.uploadsDisabled && (
                      <span className="rounded bg-muted px-2 py-0.5">No uploads</span>
                    )}
                    {u.restrictions.monthlyRenderLimit !== null && (
                      <span className="rounded bg-muted px-2 py-0.5">
                        Limit {u.restrictions.monthlyRenderLimit}/mo
                      </span>
                    )}
                    {!u.restrictions.locked &&
                      !u.restrictions.readOnly &&
                      !u.restrictions.uploadsDisabled &&
                      u.restrictions.monthlyRenderLimit === null && (
                        <span className="text-muted-foreground">Active</span>
                      )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setEditing(u)}>
                    Manage
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {(data?.users ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {editing && (
        <RestrictionsDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function RestrictionsDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useServerFn(setUserRestrictions);
  const [locked, setLocked] = useState(user.restrictions.locked);
  const [readOnly, setReadOnly] = useState(user.restrictions.readOnly);
  const [uploadsDisabled, setUploadsDisabled] = useState(user.restrictions.uploadsDisabled);
  const [hasQuota, setHasQuota] = useState(user.restrictions.monthlyRenderLimit !== null);
  const [quota, setQuota] = useState(
    user.restrictions.monthlyRenderLimit ?? DEFAULT_RENDER_QUOTA,
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        data: {
          userId: user.id,
          locked,
          readOnly,
          uploadsDisabled,
          monthlyRenderLimit: hasQuota ? Math.max(0, Math.floor(quota)) : null,
        },
      });
      toast.success("Restrictions updated");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{user.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ToggleRow
            icon={<Lock className="h-4 w-4" />}
            title="Lock account"
            description="Block all create / edit / render. Sign-in still works but every action fails."
            checked={locked}
            onChange={setLocked}
          />
          <ToggleRow
            icon={<Eye className="h-4 w-4" />}
            title="Read-only"
            description="User can view their projects but cannot create, edit, or render."
            checked={readOnly}
            onChange={setReadOnly}
          />
          <ToggleRow
            icon={<Upload className="h-4 w-4" />}
            title="Disable uploads"
            description="User cannot upload personal videos (org library + Pexels still work)."
            checked={uploadsDisabled}
            onChange={setUploadsDisabled}
          />
          <ToggleRow
            icon={<Gauge className="h-4 w-4" />}
            title="Monthly render quota"
            description="Cap successful renders per calendar month."
            checked={hasQuota}
            onChange={setHasQuota}
          />
          {hasQuota && (
            <div className="ml-7">
              <Label htmlFor="quota">Renders per month</Label>
              <Input
                id="quota"
                type="number"
                min={0}
                value={quota}
                onChange={(e) => setQuota(Number(e.target.value))}
                className="mt-1 w-32"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ---------------- Org library ----------------

function OrgLibraryTab() {
  const list = useServerFn(listAdminOrgVideos);
  const del = useServerFn(deleteOrgVideo);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "org-videos"],
    queryFn: () => list(),
  });
  const [showAdd, setShowAdd] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm("Delete this video from the shared library?")) return;
    try {
      await del({ data: { id } });
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin", "org-videos"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Upload video
        </Button>
      </div>
      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-6 text-muted-foreground">
          Loading…
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          No org videos yet. Upload your first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data!.items.map((v) => (
            <div
              key={v.id}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <video
                src={v.url}
                className="h-40 w-full object-cover bg-muted"
                muted
                preload="metadata"
              />
              <div className="p-3">
                <div className="truncate font-medium text-foreground">{v.title}</div>
                {v.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {v.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(v.id)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showAdd && (
        <AddOrgVideoDialog
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false);
            qc.invalidateQueries({ queryKey: ["admin", "org-videos"] });
          }}
        />
      )}
    </div>
  );
}

function AddOrgVideoDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const createUrl = useServerFn(createOrgVideoUploadUrl);
  const add = useServerFn(addOrgVideo);
  const suggest = useServerFn(suggestOrgVideoMetadata);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [suggesting, setSuggesting] = useState(false);

  const tagList = useMemo(
    () =>
      tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    [tags],
  );

  async function extractFirstFrame(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(f);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.src = url;
      const cleanup = () => URL.revokeObjectURL(url);
      const onError = () => {
        cleanup();
        reject(new Error("Could not read video"));
      };
      video.onerror = onError;
      video.onloadedmetadata = () => {
        // seek a bit in to skip black opening frame
        video.currentTime = Math.min(1, (video.duration || 1) / 2);
      };
      video.onseeked = () => {
        try {
          const maxW = 640;
          const scale = Math.min(1, maxW / (video.videoWidth || maxW));
          const w = Math.max(1, Math.round((video.videoWidth || maxW) * scale));
          const h = Math.max(1, Math.round((video.videoHeight || 360) * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("No 2D context");
          ctx.drawImage(video, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          cleanup();
          resolve(dataUrl);
        } catch (e) {
          cleanup();
          reject(e instanceof Error ? e : new Error("Frame extraction failed"));
        }
      };
    });
  }

  async function runSuggest(f: File) {
    setSuggesting(true);
    try {
      const dataUrl = await extractFirstFrame(f);
      const { title: t, tags: ts } = await suggest({
        data: { filename: f.name, imageDataUrl: dataUrl },
      });
      if (t && !title.trim()) setTitle(t);
      if (ts.length > 0 && !tags.trim()) setTags(ts.join(", "));
      if (t || ts.length > 0) toast.success("Title and tags suggested");
    } catch (e) {
      toast.error(
        e instanceof Error ? `Auto-tag failed: ${e.message}` : "Auto-tag failed",
      );
    } finally {
      setSuggesting(false);
    }
  }

  function handleFileChange(f: File | null) {
    setFile(f);
    if (f && f.name.toLowerCase().endsWith(".mp4")) {
      void runSuggest(f);
    }
  }

  async function handleUpload() {
    if (!file || !title.trim()) {
      toast.error("Title and file are required");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "mp4") {
      toast.error("Only .mp4 files are allowed. Please convert your video to MP4 before uploading.");
      return;
    }
    setUploading(true);
    try {
      setProgress("Preparing upload…");
      const { path, token } = await createUrl({ data: { filename: file.name } });
      setProgress("Uploading…");
      const { error: upErr } = await supabase.storage
        .from("video-org-library")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (upErr) throw upErr;
      setProgress("Saving…");
      await add({
        data: { storagePath: path, title: title.trim(), tags: tagList },
      });
      toast.success("Video added to org library");
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress("");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload to org library</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tilburg campus aerial"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="campus, exterior, drone"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="file">Video file</Label>
            <Input
              id="file"
              type="file"
              accept=".mp4,video/mp4"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="mt-1"
            />
            {suggesting && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 animate-pulse" />
                Analyzing video to suggest title and tags…
              </div>
            )}
          </div>
          {progress && (
            <div className="text-sm text-muted-foreground">{progress}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={uploading || !file || !title.trim()}>
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}