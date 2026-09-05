export const dynamic = "force-dynamic"
// Fluid compute grants 300s by default even on Hobby; stay under that with
// margin. Real multi-search research runs 30s-3min in practice, but a slow
// run (many searches, a stubborn source) needs the room.
export const maxDuration = 280

import { serverClient } from "@/lib/supabaseServer"
import { runDeepResearch } from "@/lib/deepResearch"

// POST /api/people/[id]/deep-research  -> { note }
//
// The in-app version of the CFO Circle Prospect Research Protocol Dalen
// runs by hand. Thin wrapper around src/lib/deepResearch.js's
// runDeepResearch() -- that's the actual protocol/prompt/parsing logic,
// shared with the background task the LinkedHelper webhook fires the
// moment someone accepts a connection request (see
// api/linkedhelper-webhook/route.js).
export async function POST(request, { params }) {
  const id = params?.id
  const sb = serverClient()
  const result = await runDeepResearch(sb, id)

  if (!result.ok) {
    const body = { error: result.error }
    if (result.detail) body.detail = result.detail
    return Response.json(body, { status: result.status || 500 })
  }

  const body = { note: result.note }
  if (result.parse_failed) { body.parse_failed = true; body.parse_failed_reason = result.parse_failed_reason }
  if (result.searches_used != null) body.searches_used = result.searches_used
  return Response.json(body)
}
