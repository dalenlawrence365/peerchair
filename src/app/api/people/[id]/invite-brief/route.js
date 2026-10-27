export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { buildInviteBrief } from "@/lib/inviteBrief"

// GET /api/people/[id]/invite-brief?channel=dm|email[&kind=social]  (default kind = workshop)
// Read-only. Returns ready-to-edit drafting instructions for "invite this person to
// the next workshop" plus any warnings (already confirmed / invited / declined...).
export async function GET(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "bad_request" }, { status: 400 })
  const sp = new URL(request.url).searchParams
  const channel = sp.get("channel") || "dm"
  const kind = sp.get("kind") === "social" ? "social" : "workshop"
  const out = await buildInviteBrief(serverClient(), id, channel, kind)
  return Response.json(out, { status: out.ok ? 200 : 404 })
}
