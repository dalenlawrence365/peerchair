export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { checkExtensionAuth } from "@/lib/extensionMatch"

// POST /api/extension/photo  { person_id, image_base64, content_type? }
// The extension reads the rendered profile <img> bytes (already loaded + authed in the
// browser) and sends them here. We store the BYTES in the public 'avatars' bucket — same
// path as the drag-drop avatar feature — so the photo is permanent (no expiring licdn URL).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-extension-token",
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }
const J = (data, status) => Response.json(data, { status: status || 200, headers: CORS })

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }
const MAX = 5 * 1024 * 1024

export async function POST(request) {
  const auth = checkExtensionAuth(request)
  if (!auth.ok) return J({ error: "unauthorized" }, 401)
  let body
  try { body = await request.json() } catch (e) { return J({ error: "invalid JSON" }, 400) }
  const person_id = body.person_id
  const image_base64 = body.image_base64
  if (!person_id || !image_base64) return J({ error: "person_id and image_base64 required" }, 400)

  const type = (body.content_type || "image/jpeg").split(";")[0].trim().toLowerCase()
  if (!EXT[type]) return J({ error: `unsupported image type "${type}"` }, 400)
  const bytes = Buffer.from(image_base64, "base64")
  if (bytes.length > MAX) return J({ error: "image too large (max 5MB)" }, 400)
  if (bytes.length < 200) return J({ error: "image looks empty" }, 400)

  const sb = serverClient()
  const { data: person } = await sb.from("people").select("id").eq("id", person_id).maybeSingle()
  if (!person) return J({ error: "person not found" }, 404)

  const path = `${person_id}/${Date.now()}.${EXT[type]}`
  const { error: upErr } = await sb.storage.from("avatars").upload(path, bytes, { contentType: type, upsert: true })
  if (upErr) return J({ error: "upload failed: " + upErr.message }, 500)
  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path)
  const avatar_url = pub && pub.publicUrl
  if (!avatar_url) return J({ error: "could not resolve public URL" }, 500)
  const { error: updErr } = await sb.from("people").update({ avatar_url }).eq("id", person_id)
  if (updErr) return J({ error: "stored but failed to set: " + updErr.message }, 500)
  return J({ ok: true, avatar_url })
}
