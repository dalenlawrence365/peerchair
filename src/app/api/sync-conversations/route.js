export const dynamic = "force-dynamic"

// HeyReach inbox sync — DECOMMISSIONED 2026-05-22
//
// LinkedIn outreach migrated from HeyReach → LinkedHelper for Seed B1 and beyond.
// HeyReach's inbox API only sees conversations HeyReach initiated, so this sync
// returned 0 conversations on every run while masquerading as healthy in audit_log.
//
// LinkedHelper does NOT have a similar inbox-pull API — it only fires per-event
// webhooks DURING its campaign chain execution. Once the chain finishes for a
// contact, replies that arrive after that point are invisible to PeerChair until
// they're synced via another mechanism.
//
// Future replacements:
//  - Voyager-API-based pull using stored LinkedIn cookies (Option A)
//  - On-demand "Sync inbox" button via Claude in Chrome (Option C, lightweight)
//  - Custom Chrome extension monitoring the inbox (Option B, robust)
//
// This route returns 410 Gone so it's obvious anywhere it's still being called.
//
// Removed from vercel.json crons in the same commit.

import { createClient } from "@supabase/supabase-js"
import { serverClient } from "@/lib/supabaseServer"

export async function GET() {
  const summary = "DISABLED — HeyReach sync decommissioned (LinkedHelper migration). See route comment for context."
  try {
    const sb = serverClient()
    await sb.from("audit_log").insert({
      run_at: new Date().toISOString(),
      audit_type: "linkedin_sync",
      contacts_checked: 0,
      contacts_created: 0,
      heyreach_available: false,
      summary,
      errors: ["sync-conversations route disabled — see route comment"]
    })
  } catch(e) { /* audit log write failure is fine, the route is dead anyway */ }

  return Response.json({ disabled: true, reason: summary }, { status: 410 })
}
