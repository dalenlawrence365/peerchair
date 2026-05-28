export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"

// POST /api/people/[id]/avatar
//   - multipart/form-data with field "file"  → uploaded file (desktop drag / file picker)
//   - application/json { source_url }         → image dragged from a web page
//     (e.g. straight off LinkedIn). The server fetches the bytes and stores
//     them, so the photo is permanent even though the source URL would expire.
// Either way the image lands in the public 'avatars' bucket and
// people.avatar_url is set to the permanent public URL.

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }
const MAX = 5 * 1024 * 1024

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

async function storeAndSet(client, id, bytes, contentType) {
  const type = (contentType || "image/jpeg").split(";")[0].trim().toLowerCase()
  if (!EXT[type]) return { error: `unsupported image type "${type}". Use JPG, PNG, WEBP, or GIF.`, status: 400 }
  if (bytes.length > MAX) return { error: "image too large (max 5MB)", status: 400 }

  const path = `${id}/${Date.now()}.${EXT[type]}`
  const { error: upErr } = await client.storage.from("avatars").upload(path, bytes, { contentType: type, upsert: true })
  if (upErr) return { error: "upload failed: " + upErr.message, status: 500 }

  const { data: pub } = client.storage.from("avatars").getPublicUrl(path)
  const avatarUrl = pub?.publicUrl
  if (!avatarUrl) return { error: "could not resolve public URL", status: 500 }

  const { error: updErr } = await client.from("people").update({ avatar_url: avatarUrl }).eq("id", id)
  if (updErr) return { error: "stored file but failed to set avatar: " + updErr.message, status: 500 }
  return { avatar_url: avatarUrl }
}

export async function POST(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  const client = sb()
  const { data: person } = await client.from("people").select("id").eq("id", id).maybeSingle()
  if (!person) return Response.json({ error: "Person not found" }, { status: 404 })

  const contentType = request.headers.get("content-type") || ""

  // Mode A — image dragged from a web page (JSON body with a URL)
  if (contentType.includes("application/json")) {
    let body
    try { body = await request.json() } catch(e) { return Response.json({ error: "bad json" }, { status: 400 }) }
    const url = (body.source_url || "").trim()
    if (!/^https?:\/\//i.test(url)) return Response.json({ error: "source_url must be an http(s) URL" }, { status: 400 })

    let res
    try {
      res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 PeerChair-avatar-fetch" } })
    } catch(e) { return Response.json({ error: "could not fetch image: " + e.message }, { status: 400 }) }
    if (!res.ok) return Response.json({ error: `image fetch returned ${res.status}` }, { status: 400 })

    const fetchedType = res.headers.get("content-type") || ""
    if (!fetchedType.startsWith("image/")) {
      return Response.json({ error: "that drop wasn't a direct image. Try dragging the image file from your desktop, or use 'choose a file'." }, { status: 400 })
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    const out = await storeAndSet(client, id, bytes, fetchedType)
    if (out.error) return Response.json({ error: out.error }, { status: out.status })
    return Response.json({ ok: true, avatar_url: out.avatar_url })
  }

  // Mode B — uploaded file (multipart)
  let form
  try { form = await request.formData() } catch(e) { return Response.json({ error: "expected multipart form-data or json" }, { status: 400 }) }
  const file = form.get("file")
  if (!file || typeof file === "string") return Response.json({ error: "no file provided" }, { status: 400 })
  const bytes = Buffer.from(await file.arrayBuffer())
  const out = await storeAndSet(client, id, bytes, file.type)
  if (out.error) return Response.json({ error: out.error }, { status: out.status })
  return Response.json({ ok: true, avatar_url: out.avatar_url })
}
