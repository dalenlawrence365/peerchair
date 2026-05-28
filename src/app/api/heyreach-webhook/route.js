export const dynamic = "force-dynamic"

// HeyReach webhook receiver — DECOMMISSIONED 2026-05-27
//
// HeyReach was retired as an outreach tool (migrated to LinkedHelper). This
// endpoint used to create/update rows in the legacy `contacts` table on
// HeyReach campaign events. It's dead for two reasons:
//   1. No HeyReach campaign is firing events anymore.
//   2. It wrote to `contacts`, which is being phased out in favor of `people`.
//
// Left as a 200-returning no-op (rather than 410) so any still-configured
// HeyReach webhook doesn't generate error noise on their side. Logs one
// audit_log row per hit for visibility.
//
// If LinkedIn outreach data needs to flow in again, use the LinkedHelper
// webhook at /api/linkedhelper-webhook (people-aware) — not this one.

import { createClient } from "@supabase/supabase-js"

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  })
}

export async function POST() {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
    await sb.from("audit_log").insert({
      run_at: new Date().toISOString(),
      audit_type: "heyreach_webhook",
      summary: "DISABLED — HeyReach webhook received but ignored (decommissioned; use LinkedHelper).",
      errors: []
    })
  } catch (e) { /* ignore */ }
  return Response.json({ ok: true, ignored: true, reason: "HeyReach webhook decommissioned" })
}
