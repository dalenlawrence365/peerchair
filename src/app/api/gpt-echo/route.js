export const dynamic = "force-dynamic"

export async function GET() {
  console.log("gpt-echo GET hit")
  return Response.json({ ok: true, method: "GET" })
}

export async function OPTIONS() {
  return new Response(null, { 
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-peerchair-action-key"
    }
  })
}

export async function POST(request) {
  console.log("gpt-echo POST hit")
  return new Response(JSON.stringify({ ok: true, method: "POST" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-peerchair-action-key"
    }
  })
}
