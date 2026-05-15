import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const startSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_sessions")
      .insert({ user_id: userId })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not start session");
    return { sessionId: data.id };
  });

const HeartbeatInput = z.object({ sessionId: z.string().uuid() });

export const heartbeatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => HeartbeatInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("user_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", data.sessionId)
      .eq("user_id", userId);
    return { ok: true as const };
  });

const EndInput = z.object({ sessionId: z.string().uuid() });

export const endSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EndInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    await supabase
      .from("user_sessions")
      .update({ ended_at: now, last_seen_at: now })
      .eq("id", data.sessionId)
      .eq("user_id", userId);
    return { ok: true as const };
  });