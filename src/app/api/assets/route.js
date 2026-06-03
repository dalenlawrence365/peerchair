export const dynamic = "force-dynamic"

import { serverClient } from "@/lib/supabaseServer"

export async function GET() {
  const sb = serverClient()
  const { data, error } = await sb
    .from("chapter_assets")
    .select("slug, display_name, description, current_file_path, current_file_size_bytes, current_file_mime, current_file_original_name, current_file_uploaded_at")
    .order("slug")

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Attach a fresh signed URL for each asset that has a current file
  const withUrls = await Promise.all((data || []).map(async function(asset){
    if (!asset.current_file_path) return Object.assign({}, asset, { view_url: null, has_file: false })
    const { data: signed } = await sb.storage
      .from("chapter-assets")
      .createSignedUrl(asset.current_file_path, 60 * 60) // 1 hour
    return Object.assign({}, asset, {
      view_url: signed ? signed.signedUrl : null,
      has_file: true,
    })
  }))

  return Response.json({ assets: withUrls })
}
