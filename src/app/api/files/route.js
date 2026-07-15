export const dynamic = "force-dynamic"

// GET  /api/files         — list all files
// POST /api/files         — upload a new file
// DELETE /api/files?id=xx — delete a file

import { adminClient } from "@/lib/supabaseServer"

function getSb() {
  return adminClient()
}

// GET — list files
export async function GET() {
  const sb = getSb()
  const { data, error } = await sb.from("files").select("*").order("created_at", { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ files: data || [] })
}

// POST — upload file
export async function POST(request) {
  const sb   = getSb()
  const form = await request.formData()
  const file        = form.get("file")
  const name        = form.get("name")        || file.name
  const description = form.get("description") || ""
  const tags        = form.get("tags") ? form.get("tags").split(",").map(t=>t.trim()) : []

  if (!file) return Response.json({ error: "No file provided" }, { status: 400 })

  const arrayBuf  = await file.arrayBuffer()
  const buffer    = Buffer.from(arrayBuf)
  const storagePath = `files/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`

  // Upload to Supabase Storage
  const { error: uploadErr } = await sb.storage
    .from("peerchair-files")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) return Response.json({ error: "Upload failed: " + uploadErr.message }, { status: 500 })

  // Save metadata
  const { data, error } = await sb.from("files").insert({
    name,
    description,
    filename:     file.name,
    mime_type:    file.type,
    size_bytes:   buffer.length,
    storage_path: storagePath,
    tags,
  }).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ file: data })
}

// DELETE — remove file
export async function DELETE(request) {
  const sb = getSb()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return Response.json({ error: "No id" }, { status: 400 })

  const { data: row } = await sb.from("files").select("storage_path").eq("id", id).single()
  if (row) await sb.storage.from("peerchair-files").remove([row.storage_path])
  await sb.from("files").delete().eq("id", id)

  return Response.json({ success: true })
}
