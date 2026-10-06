export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { buildInviteBrief } from "@/lib/inviteBrief"

// GET /api/people/[id]/invite-brief?channel=dm|email
// Read-only. Returns ready-to-edit drafting instructions for "invite this person to
// the next workshop" plus any warnings (already confirmed / invited / declined...).
export async function GET(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "bad_request" }, { status: 400 })
  const channel = new URL(request.url).searchParams.get("channel") || "dm"
  const out = await buildInviteBrief(serverClient(), id, channel)
  return Response.json(out, { status: out.ok ? 200 : 404 })
}
