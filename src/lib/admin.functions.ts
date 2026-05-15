import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin.rpc("is_admin", { _user_id: userId });
  if (error) throw new Error(`Admin check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin only");
}

export const checkIsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin.rpc("is_admin", { _user_id: context.userId });
    return { isAdmin: Boolean(data) };
  });

export type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  totalSessionMinutes: number;
  projectCount: number;
  renderCount: number;
  rendersThisMonth: number;
  restrictions: {
    locked: boolean;
    readOnly: boolean;
    uploadsDisabled: boolean;
    monthlyRenderLimit: number | null;
  };
};

export const listAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ users: AdminUserRow[] }> => {
    await assertAdmin(context.userId);

    // Page through auth.users (admin API). 1k cap is fine for now.
    const { data: usersPage, error: uErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (uErr) throw new Error(uErr.message);
    const authUsers = usersPage.users;
    const userIds = authUsers.map((u) => u.id);
    if (userIds.length === 0) return { users: [] };

    const [profilesRes, sessionsRes, projectsRes, rendersRes, restrictionsRes] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, display_name").in("id", userIds),
        supabaseAdmin
          .from("user_sessions")
          .select("user_id, started_at, last_seen_at, ended_at")
          .in("user_id", userIds),
        supabaseAdmin.from("projects").select("user_id").in("user_id", userIds),
        supabaseAdmin
          .from("render_logs")
          .select("user_id, created_at")
          .in("user_id", userIds),
        supabaseAdmin.from("user_restrictions").select("*").in("user_id", userIds),
      ]);

    const profileMap = new Map(
      (profilesRes.data ?? []).map((p) => [p.id, p.display_name as string | null]),
    );
    const restrictionMap = new Map(
      (restrictionsRes.data ?? []).map((r) => [r.user_id, r]),
    );
    const projectCountMap = new Map<string, number>();
    for (const p of projectsRes.data ?? []) {
      projectCountMap.set(p.user_id, (projectCountMap.get(p.user_id) ?? 0) + 1);
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const renderCountMap = new Map<string, number>();
    const renderMonthMap = new Map<string, number>();
    for (const r of rendersRes.data ?? []) {
      renderCountMap.set(r.user_id, (renderCountMap.get(r.user_id) ?? 0) + 1);
      if (r.created_at >= monthStart) {
        renderMonthMap.set(r.user_id, (renderMonthMap.get(r.user_id) ?? 0) + 1);
      }
    }

    const sessionMinutesMap = new Map<string, number>();
    for (const s of sessionsRes.data ?? []) {
      const start = new Date(s.started_at).getTime();
      const end = new Date(s.ended_at ?? s.last_seen_at).getTime();
      const mins = Math.max(0, (end - start) / 60000);
      sessionMinutesMap.set(s.user_id, (sessionMinutesMap.get(s.user_id) ?? 0) + mins);
    }

    const users: AdminUserRow[] = authUsers.map((u) => {
      const r = restrictionMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        displayName: profileMap.get(u.id) ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        totalSessionMinutes: Math.round(sessionMinutesMap.get(u.id) ?? 0),
        projectCount: projectCountMap.get(u.id) ?? 0,
        renderCount: renderCountMap.get(u.id) ?? 0,
        rendersThisMonth: renderMonthMap.get(u.id) ?? 0,
        restrictions: {
          locked: r?.locked ?? false,
          readOnly: r?.read_only ?? false,
          uploadsDisabled: r?.uploads_disabled ?? false,
          monthlyRenderLimit: r?.monthly_render_limit ?? null,
        },
      };
    });
    users.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    return { users };
  });

const SetRestrictionsInput = z.object({
  userId: z.string().uuid(),
  locked: z.boolean(),
  readOnly: z.boolean(),
  uploadsDisabled: z.boolean(),
  monthlyRenderLimit: z.number().int().min(0).max(100000).nullable(),
});

export const setUserRestrictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SetRestrictionsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("user_restrictions").upsert(
      {
        user_id: data.userId,
        locked: data.locked,
        read_only: data.readOnly,
        uploads_disabled: data.uploadsDisabled,
        monthly_render_limit: data.monthlyRenderLimit,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---------------- Org library admin ----------------

export type AdminOrgVideo = {
  id: string;
  title: string;
  storagePath: string;
  url: string;
  tags: string[];
  createdAt: string;
};

export const listAdminOrgVideos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: AdminOrgVideo[] }> => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("org_videos")
      .select("id, title, storage_path, tags, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const items = (data ?? []).map((row) => {
      const { data: pub } = supabaseAdmin.storage
        .from("video-org-library")
        .getPublicUrl(row.storage_path);
      return {
        id: row.id,
        title: row.title,
        storagePath: row.storage_path,
        url: pub.publicUrl,
        tags: row.tags ?? [],
        createdAt: row.created_at,
      };
    });
    return { items };
  });

const AddOrgVideoInput = z.object({
  storagePath: z.string().min(1).max(500),
  title: z.string().min(1).max(200),
  tags: z.array(z.string().min(1).max(60)).max(20).default([]),
});

export const addOrgVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AddOrgVideoInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("org_videos")
      .insert({
        storage_path: data.storagePath,
        title: data.title,
        tags: data.tags,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Insert failed");
    return { id: row.id };
  });

const DeleteOrgVideoInput = z.object({ id: z.string().uuid() });

export const deleteOrgVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteOrgVideoInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("org_videos")
      .select("storage_path")
      .eq("id", data.id)
      .single();
    if (row?.storage_path) {
      await supabaseAdmin.storage.from("video-org-library").remove([row.storage_path]);
    }
    const { error } = await supabaseAdmin.from("org_videos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const SignedUploadInput = z.object({
  filename: z.string().min(1).max(200),
});

export const createOrgVideoUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SignedUploadInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const ext = data.filename.split(".").pop() || "mp4";
    const safeBase = data.filename
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 80);
    const path = `${safeBase || "video"}-${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("video-org-library")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Could not create upload URL");
    return { path, token: signed.token };
  });