export const dynamic = 'force-dynamic'
import { adminClient } from "@/lib/supabaseServer"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const id   = searchParams.get("id")
  const name = searchParams.get("name")
  if (!id && !name) return Response.json({ error:"No id or name" }, {status:400})

  // Use service role key to bypass RLS for storage reads
  const sb = adminClient()

  let row
  if (id) {
    const { data } = await sb.from("files").select("*").eq("id",id).single()
    row = data
  } else {
    const { data } = await sb.from("files").select("*").ilike("name","%"+name+"%").limit(1)
    row = data?.[0]
  }

  if (!row) return Response.json({ error:"File not found" }, {status:404})

  const { data:fileData, error } = await sb.storage.from("peerchair-files").download(row.storage_path)
  if (error) return Response.json({ error:"Download failed: "+error.message }, {status:500})

  const buffer = Buffer.from(await fileData.arrayBuffer())
  return Response.json({
    id:row.id, name:row.name, filename:row.filename,
    mime_type:row.mime_type, base64:buffer.toString("base64")
  })
}
