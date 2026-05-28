export const dynamic = "force-dynamic"
import { createClient } from "@supabase/supabase-js"

// POST /api/people/[id]/avatar  (multipart/form-data, field "file")
// Uploads the image to the 'avatars' storage bucket and sets
// people.avatar_url to the public URL. Service-role client so the upload
// bypasses storage RLS; bucket is public-read so <img> works.

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }

export async function POST(request, { params }) {
  const id = params?.id
  if (!id) return Response.json({ error: "id required" }, { status: 400 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  // Confirm person exists
  const { data: person } = await sb.from("people").select("id").eq("id", id).maybeSingle()
  if (!person) return Response.json({ error: "Person not found" }, { status: 404 })

  let form
  try { form = await request.formData() } catch(e) { return Response.json({ error: "expected multipart form-data" }, { status: 400 }) }
  const file = form.get("file")
  if (!file || typeof file === "string") return Response.json({ error: "no file provided" }, { status: 400 })

  const type = file.type || "image/jpeg"
  if (!EXT[type]) return Response.json({ error: `unsupported type ${type}. Use JPG, PNG, WEBP, or GIF.` }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "file too large (max 5MB)" }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const path = `${id}/${Date.now()}.${EXT[type]}`

  const { error: upErr } = await sb.storage.from("avatars").upload(path, buf, { contentType: type, upsert: true })
  if (upErr) return Response.json({ error: "upload failed: " + upErr.message }, { status: 500 })

  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path)
  const avatarUrl = pub?.publicUrl
  if (!avatarUrl) return Response.json({ error: "could not resolve public URL" }, { status: 500 })

  const { error: updErr } = await sb.from("people").update({ avatar_url: avatarUrl }).eq("id", id)
  if (updErr) return Response.json({ error: "saved file but failed to set avatar: " + updErr.message }, { status: 500 })

  return Response.json({ ok: true, avatar_url: avatarUrl })
}
