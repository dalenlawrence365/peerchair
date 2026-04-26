export async function GET(request) {
  try {
    var url = new URL(request.url);
    var profileUrl = url.searchParams.get("url") || "";
    
    if (!profileUrl) return Response.json({contact: null});

    // Extract slug from LinkedIn URL
    var slug = profileUrl.split("/in/").pop().replace(/\/+$/, "").toLowerCase();
    if (!slug) return Response.json({contact: null});

    var SBU = process.env.NEXT_PUBLIC_SUPABASE_URL;
    var SBK = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    var res = await fetch(
      SBU + "/rest/v1/contacts?linkedin_url=ilike.*" + slug + "*&select=id,first_name,last_name,title,company_name,linkedin_url,pipeline_stage,linkedin_image_url&limit=1",
      { headers: {"apikey": SBK, "Authorization": "Bearer " + SBK} }
    );

    if (!res.ok) return Response.json({contact: null});
    var data = await res.json();
    var contact = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return Response.json({contact});
  } catch(e) {
    console.error("contact-by-linkedin error:", e);
    return Response.json({contact: null});
  }
}
