export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { serverClient } from "@/lib/supabaseServer"

// GET — return one asset's metadata + a fresh 1h signed view URL + version history
export async function GET(req, { params }) {
  const { slug } = await params
  const sb = serverClient()

  const { data: asset, error: assetErr } = await sb
    .from("chapter_assets")
    .select("*")
    .eq("slug", slug)
    .single()
  if (assetErr || !asset) {
    return Response.json({ error: "Asset not found" }, { status: 404 })
  }

  let viewUrl = null
  if (asset.current_file_path) {
    const { data: signed } = await sb.storage
      .from("chapter-assets")
      .createSignedUrl(asset.current_file_path, 60 * 60)
    viewUrl = signed ? signed.signedUrl : null
  }

  const { data: versions } = await sb
    .from("chapter_asset_versions")
    .select("id, file_path, file_size_bytes, file_mime, original_name, uploaded_at, uploaded_by")
    .eq("slug", slug)
    .order("uploaded_at", { ascending: false })
    .limit(20)

  return Response.json({
    asset,
    view_url: viewUrl,
    versions: versions || [],
  })
}

// POST — upload a new file, store at versioned path, update current pointer
export async function POST(req, { params }) {
  const { slug } = await params
  const sb = serverClient()

  // Confirm asset row exists
  const { data: asset, error: assetErr } = await sb
    .from("chapter_assets")
    .select("slug, display_name")
    .eq("slug", slug)
    .single()
  if (assetErr || !asset) {
    return Response.json({ error: "Asset not found — seed it first." }, { status: 404 })
  }

  // Parse multipart form
  const form = await req.formData()
  const file = form.get("file")
  if (!file || typeof file === "string") {
    return Response.json({ error: "No file in form data (expected field 'file')." }, { status: 400 })
  }

  const originalName = file.name || "upload.pdf"
  const mime = file.type || "application/octet-stream"
  const buf = Buffer.from(await file.arrayBuffer())
  const sizeBytes = buf.length

  // Versioned path: brochure/v-2026-06-03T00-12-34-567Z.pdf
  const ts = new Date().toISOString().replace(/[:.]/g, "-")
  const ext = (originalName.includes(".") ? originalName.split(".").pop() : "bin").toLowerCase()
  const versionedPath = `${slug}/v-${ts}.${ext}`

  // Upload to Storage
  const { error: uploadErr } = await sb.storage
    .from("chapter-assets")
    .upload(versionedPath, buf, {
      contentType: mime,
      upsert: false,
    })
  if (uploadErr) {
    return Response.json({ error: "Upload failed: " + uploadErr.message }, { status: 500 })
  }

  // Record version
  await sb.from("chapter_asset_versions").insert({
    slug, file_path: versionedPath, file_size_bytes: sizeBytes,
    file_mime: mime, original_name: originalName,
  })

  // Update current pointer
  const { error: updateErr } = await sb
    .from("chapter_assets")
    .update({
      current_file_path: versionedPath,
      current_file_size_bytes: sizeBytes,
      current_file_mime: mime,
      current_file_original_name: originalName,
      current_file_uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("slug", slug)
  if (updateErr) {
    return Response.json({ error: "Pointer update failed: " + updateErr.message }, { status: 500 })
  }

  // Fresh signed URL to return
  const { data: signed } = await sb.storage
    .from("chapter-assets")
    .createSignedUrl(versionedPath, 60 * 60)

  return Response.json({
    success: true,
    slug,
    file_path: versionedPath,
    file_size_bytes: sizeBytes,
    original_name: originalName,
    view_url: signed ? signed.signedUrl : null,
  })
}
