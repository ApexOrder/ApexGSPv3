import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

async function authenticateNode(supabase: ReturnType<typeof createClient>, node_id: string, node_secret: string) {
  if (!node_id || !node_secret) return null;

  const { data: node } = await supabase
    .from("nodes")
    .select("id")
    .eq("id", node_id)
    .eq("node_secret", node_secret)
    .maybeSingle();

  return node;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function upsertServerFromCompletedJob(supabase: ReturnType<typeof createClient>, job_id: string, node_id: string, result: unknown) {
  if (!isRecord(result)) return;
  if (result.game !== "7dtd" || result.installed !== true) return;

  const { data: job } = await supabase
    .from("jobs")
    .select("user_id")
    .eq("id", job_id)
    .eq("node_id", node_id)
    .maybeSingle();

  if (!job?.user_id) return;

  await supabase
    .from("servers")
    .upsert({
      user_id: job.user_id,
      node_id,
      name: String(result.name ?? "7 Days To Die Server"),
      slug: String(result.slug ?? "7dtd-server"),
      game: "7dtd",
      install_path: String(result.installPath ?? result.path ?? ""),
      executable_path: typeof result.executablePath === "string" ? result.executablePath : null,
      status: "stopped",
      metadata: result,
      updated_at: new Date().toISOString(),
    }, { onConflict: "node_id,slug" });
}

async function updateServerStatusFromCompletedJob(supabase: ReturnType<typeof createClient>, node_id: string, result: unknown) {
  if (!isRecord(result)) return;
  if (typeof result.serverId !== "string" || typeof result.status !== "string") return;
  if (!["stopped", "running", "starting", "stopping", "error"].includes(result.status)) return;

  await supabase
    .from("servers")
    .update({
      status: result.status,
      metadata: result,
      updated_at: new Date().toISOString(),
    })
    .eq("id", result.serverId)
    .eq("node_id", node_id);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/node-api/, "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    if (req.method === "POST" && path === "/register") {
      const body = await req.json();
      const { token, hostname, ip_address, daemon_version } = body;

      if (!token) return err("Missing token");

      const { data: node, error: findErr } = await supabase
        .from("nodes")
        .select("id, token_used, node_secret")
        .eq("registration_token", token)
        .maybeSingle();

      if (findErr || !node) return err("Invalid registration token", 401);
      if (node.token_used) return err("Registration token already used", 409);

      const { error: updateErr } = await supabase
        .from("nodes")
        .update({
          token_used: true,
          status: "online",
          hostname: hostname ?? null,
          ip_address: ip_address ?? null,
          daemon_version: daemon_version ?? null,
          last_heartbeat: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", node.id);

      if (updateErr) return err("Failed to register node", 500);

      await supabase.from("heartbeats").insert({
        node_id: node.id,
        status: "online",
        metadata: { event: "registered", daemon_version },
      });

      return json({ success: true, node_id: node.id, node_secret: node.node_secret });
    }

    if (req.method === "POST" && path === "/heartbeat") {
      const body = await req.json();
      const { node_id, node_secret, daemon_version, metadata } = body;
      const node = await authenticateNode(supabase, node_id, node_secret);

      if (!node) return err("Invalid credentials", 401);

      const now = new Date().toISOString();

      await supabase
        .from("nodes")
        .update({ status: "online", last_heartbeat: now, daemon_version: daemon_version ?? undefined, updated_at: now })
        .eq("id", node.id);

      await supabase.from("heartbeats").insert({
        node_id: node.id,
        status: "online",
        metadata: metadata ?? null,
      });

      await supabase.rpc("mark_stale_nodes_offline");

      return json({ success: true, timestamp: now });
    }

    if (req.method === "POST" && path === "/jobs/next") {
      const body = await req.json();
      const { node_id, node_secret } = body;
      const node = await authenticateNode(supabase, node_id, node_secret);

      if (!node) return err("Invalid credentials", 401);

      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("id, node_id, user_id, type, payload, status, created_at, updated_at")
        .eq("node_id", node.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (jobErr) return err("Failed to fetch jobs", 500);
      if (!job) return json({ success: true, job: null });

      const now = new Date().toISOString();
      const { data: claimed, error: claimErr } = await supabase
        .from("jobs")
        .update({ status: "running", updated_at: now })
        .eq("id", job.id)
        .eq("status", "pending")
        .select("id, node_id, user_id, type, payload, status, created_at, updated_at")
        .single();

      if (claimErr || !claimed) return err("Failed to claim job", 409);

      return json({ success: true, job: claimed });
    }

    if (req.method === "POST" && path === "/jobs/progress") {
      const body = await req.json();
      const { node_id, node_secret, job_id, result } = body;
      const node = await authenticateNode(supabase, node_id, node_secret);

      if (!node) return err("Invalid credentials", 401);
      if (!job_id) return err("Missing job_id");

      const { error: updateErr } = await supabase
        .from("jobs")
        .update({ result: result ?? null, updated_at: new Date().toISOString() })
        .eq("id", job_id)
        .eq("node_id", node.id)
        .eq("status", "running");

      if (updateErr) return err("Failed to update job progress", 500);

      return json({ success: true });
    }

    if (req.method === "POST" && path === "/jobs/complete") {
      const body = await req.json();
      const { node_id, node_secret, job_id, status, result, error } = body;
      const node = await authenticateNode(supabase, node_id, node_secret);

      if (!node) return err("Invalid credentials", 401);
      if (!job_id) return err("Missing job_id");
      if (!["completed", "failed"].includes(status)) return err("Invalid job status");

      const { error: updateErr } = await supabase
        .from("jobs")
        .update({ status, result: result ?? null, error: error ?? null, updated_at: new Date().toISOString() })
        .eq("id", job_id)
        .eq("node_id", node.id);

      if (updateErr) return err("Failed to complete job", 500);

      if (status === "completed") {
        await upsertServerFromCompletedJob(supabase, job_id, node.id, result);
        await updateServerStatusFromCompletedJob(supabase, node.id, result);
      }

      return json({ success: true });
    }

    if (req.method === "GET" && path === "/health") {
      return json({ status: "ok", timestamp: new Date().toISOString() });
    }

    return err("Not found", 404);
  } catch (e) {
    console.error(e);
    return err("Internal server error", 500);
  }
});
