export const dynamic = "force-dynamic"

export async function OPTIONS() {
  return new Response(null, { status: 204 })
}

export async function POST(request) {
  console.log("gpt-echo POST hit")
  const body = await request.json().catch(() => null)
  console.log("gpt-echo body:", JSON.stringify(body))
  return Response.json({ ok: true, body })
}
