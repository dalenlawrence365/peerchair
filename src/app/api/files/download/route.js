export const dynamic = "force-dynamic"

import { createClient } from "@supabase/supabase-js"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const id   = searchParams.get("id")
  const name = searchParams.get("name")
  if (!id && !name) return Response.json({ error:"No id or name" }, {status:400})

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

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
