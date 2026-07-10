export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { serverClient } from "@/lib/supabaseServer"

const BUCKET = "content-media"

// POST /api/content/media  (multipart)
//   file (required), post_id (optional), title, width, height
// Uploads an image to the content-media bucket, records a media_assets row,
// and — when post_id is present — attaches it as that post's graphic.
export async function POST(req) {
  const sb = serverClient()

  let form
  try { form = await req.formData() } catch { return Response.json({ error: "Expected multipart form data" }, { status: 400 }) }

  const file = form.get("file")
  if (!file || typeof file === "string") {
    return Response.json({ error: "No file in form data (field 'file')." }, { status: 400 })
  }

  const originalName = file.name || "image"
  const mime = file.type || "application/octet-stream"
  if (!mime.startsWith("image/")) {
    return Response.json({ error: "Only image files are accepted." }, { status: 400 })
  }
  const buf = Buffer.from(await file.arrayBuffer())
  const sizeBytes = buf.length

  const postId = (form.get("post_id") || "").toString().trim() || null
  const title = (form.get("title") || "").toString().trim() || originalName
  const width = parseInt(form.get("width"), 10)
  const height = parseInt(form.get("height"), 10)

  const ext = (originalName.includes(".") ? originalName.split(".").pop() : "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png"
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `content/${stamp}-${rand}.${ext}`

  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false })
  if (upErr) return Response.json({ error: "Upload failed: " + upErr.message }, { status: 500 })

  const { data: asset, error: insErr } = await sb.from("media_assets").insert({
    storage_path: path, bucket: BUCKET, mime, size_bytes: sizeBytes,
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
    original_name: originalName, title, source: "content_upload",
  }).select("id, storage_path, mime, title, original_name").single()
  if (insErr) {
    await sb.storage.from(BUCKET).remove([path]) // don't orphan the object on a failed insert
    return Response.json({ error: "Record failed: " + insErr.message }, { status: 500 })
  }

  if (postId) {
    const { error: attErr } = await sb.from("content_posts").update({ graphic_asset_id: asset.id }).eq("id", postId)
    if (attErr) return Response.json({ error: "Attach failed: " + attErr.message }, { status: 500 })
  }

  const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(path, 60 * 60)

  return Response.json({
    id: asset.id, title: asset.title, mime: asset.mime,
    original_name: asset.original_name, view_url: signed ? signed.signedUrl : null,
  })
}
