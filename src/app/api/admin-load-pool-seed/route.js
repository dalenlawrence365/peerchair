// One-shot admin endpoint: bulk-load the CFO pool from the bundled JSON
// payload and apply the Seed B1 batch tag. Designed for a single trigger from
// Dalen's browser; safe to re-run (uses upsert ignoreDuplicates + idempotent UPDATE).
//
// Auth: x-peerchair-action-key header (PEERCHAIR_GPT_ACTION_KEY).
// Method: POST. (GET returns a usage hint so the URL is hittable directly.)
//
// This file + the data file are intended for a single deploy/run cycle and
// should be removed in a follow-up commit.
export const dynamic = "force-dynamic"
export const maxDuration = 60

import { verifyGptActionKey } from "@/lib/gpt-auth"
import { corsResponse, handleOptions } from "@/lib/cors"
import { createClient } from "@supabase/supabase-js"
import poolPayload from "@/data/pool_seed_20260520.json"

const BATCH_SIZE = 500

export async function OPTIONS() {
  return handleOptions()
}

export async function GET() {
  return corsResponse({
    ok: true,
    endpoint: "admin-load-pool-seed",
    method: "POST",
    auth: "x-peerchair-action-key header (or Authorization: Bearer ...)",
    record_count: poolPayload.record_count,
    seed_b1_url_count: poolPayload.seed_b1_url_count,
    note: "Send POST with the auth header to execute the load.",
  })
}

export async function POST(request) {
  if (!verifyGptActionKey(request)) {
    return corsResponse({ error: "Unauthorized" }, { status: 401 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const startedAt = new Date().toISOString()
  const summary = {
    started_at: startedAt,
    record_count_input: poolPayload.record_count,
    seed_b1_url_count_input: poolPayload.seed_b1_url_count,
    pool_count_before: null,
    batches_executed: 0,
    batch_errors: [],
    pool_count_after: null,
    seed_b1_update_rows: null,
    seed_b1_tagged_after: null,
    promoted_contacts_still_linked: null,
    finished_at: null,
    duration_ms: null,
  }

  const t0 = Date.now()

  // Count before
  const { count: before, error: beforeErr } = await sb
    .from("pool")
    .select("*", { count: "exact", head: true })
  if (beforeErr) {
    return corsResponse({ error: "count_before_failed", detail: beforeErr.message }, { status: 500 })
  }
  summary.pool_count_before = before

  // Bulk upsert in batches. ignoreDuplicates skips existing rows (preserves their state).
  const records = poolPayload.pool_records
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const { error } = await sb
      .from("pool")
      .upsert(batch, { onConflict: "linkedin_url", ignoreDuplicates: true })
    if (error) {
      summary.batch_errors.push({
        batch_index: Math.floor(i / BATCH_SIZE),
        batch_start: i,
        batch_end: i + batch.length,
        message: error.message,
      })
      // Continue with remaining batches; partial loads are still useful and re-running is safe.
    } else {
      summary.batches_executed += 1
    }
  }

  // Count after main upsert
  const { count: after } = await sb
    .from("pool")
    .select("*", { count: "exact", head: true })
  summary.pool_count_after = after

  // Apply Seed B1 batch tag. PostgREST .in() handles ~250 items in one call.
  const { error: updateErr, count: updateCount } = await sb
    .from("pool")
    .update(
      { seed_batch_id: poolPayload.seed_b1_batch_id },
      { count: "exact" }
    )
    .in("linkedin_url", poolPayload.seed_b1_urls)
  if (updateErr) {
    summary.seed_b1_update_error = updateErr.message
  } else {
    summary.seed_b1_update_rows = updateCount
  }

  // Verify seed B1 tagged count
  const { count: taggedAfter } = await sb
    .from("pool")
    .select("*", { count: "exact", head: true })
    .eq("seed_batch_id", poolPayload.seed_b1_batch_id)
  summary.seed_b1_tagged_after = taggedAfter

  // Verify the 5 already-promoted contacts still link correctly
  const { count: promotedLinked } = await sb
    .from("pool")
    .select("*", { count: "exact", head: true })
    .not("contact_id", "is", null)
  summary.promoted_contacts_still_linked = promotedLinked

  summary.finished_at = new Date().toISOString()
  summary.duration_ms = Date.now() - t0

  const ok = summary.batch_errors.length === 0 && !summary.seed_b1_update_error
  return corsResponse({ ok, summary }, { status: ok ? 200 : 207 })
}
