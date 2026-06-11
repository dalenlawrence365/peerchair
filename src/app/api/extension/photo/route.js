export const dynamic = "force-dynamic"
import { serverClient } from "@/lib/supabaseServer"
import { checkExtensionAuth } from "@/lib/extensionMatch"

// POST /api/extension/photo  { person_id, image_base64?, content_type?, source_url? }
// Two ways in: raw bytes the panel read off the rendered <img> (preferred), or a source_url
// the server fetches itself (fallback when the canvas read is blocked). Either way the BYTES
// land in the public 'avatars' bucket so the photo is permanent (no expiring licdn URL).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-extension-token",
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }
const J = (data, status) => Response.json(data, { status: status || 200, headers: CORS })

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }
const MAX = 5 * 1024 * 1024

async function store(sb, person_id, bytes, type) {
  if (!EXT[type]) return { error: `unsupported image type "${type}"`, status: 400 }
  if (bytes.length > MAX) return { error: "image too large (max 5MB)", status: 400 }
  if (bytes.length < 200) return { error: "image looks empty", status: 400 }
  const path = `${person_id}/${Date.now()}.${EXT[type]}`
  const { error: upErr } = await sb.storage.from("avatars").upload(path, bytes, { contentType: type, upsert: true })
  if (upErr) return { error: "upload failed: " + upErr.message, status: 500 }
  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path)
  const avatar_url = pub && pub.publicUrl
  if (!avatar_url) return { error: "could not resolve public URL", status: 500 }
  const { error: updErr } = await sb.from("people").update({ avatar_url }).eq("id", person_id)
  if (updErr) return { error: "stored but failed to set: " + updErr.message, status: 500 }
  return { avatar_url }
}

export async function POST(request) {
  const auth = checkExtensionAuth(request)
  if (!auth.ok) return J({ error: "unauthorized" }, 401)
  let body
  try { body = await request.json() } catch (e) { return J({ error: "invalid JSON" }, 400) }
  const person_id = body.person_id
  if (!person_id) return J({ error: "person_id required" }, 400)

  const sb = serverClient()
  const { data: person } = await sb.from("people").select("id").eq("id", person_id).maybeSingle()
  if (!person) return J({ error: "person not found" }, 404)

  // Mode A — raw bytes from the panel
  if (body.image_base64) {
    const type = (body.content_type || "image/jpeg").split(";")[0].trim().toLowerCase()
    const out = await store(sb, person_id, Buffer.from(body.image_base64, "base64"), type)
    if (out.error) return J({ error: out.error }, out.status)
    return J({ ok: true, avatar_url: out.avatar_url })
  }

  // Mode B — server fetches the image URL
  if (body.source_url) {
    if (!/^https?:\/\//i.test(body.source_url)) return J({ error: "source_url must be http(s)" }, 400)
    let res
    try { res = await fetch(body.source_url, { headers: { "User-Agent": "Mozilla/5.0 PeerChair-extension" } }) }
    catch (e) { return J({ error: "could not fetch image: " + e.message }, 400) }
    if (!res.ok) return J({ error: `image fetch returned ${res.status}` }, 400)
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
    if (!type.startsWith("image/")) return J({ error: "source_url was not a direct image" }, 400)
    const out = await store(sb, person_id, Buffer.from(await res.arrayBuffer()), type)
    if (out.error) return J({ error: out.error }, out.status)
    return J({ ok: true, avatar_url: out.avatar_url })
  }

  return J({ error: "image_base64 or source_url required" }, 400)
}
