export const dynamic = "force-dynamic"

import { logCronRun } from "@/lib/cron-audit"
import { adminClient } from "@/lib/supabaseServer"

export async function GET(request) {
  const auth = request.headers.get("authorization")
  if (auth !== "Bearer " + (process.env.CRON_SECRET || "cfocircle2026")) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const { createClient } = await import("@supabase/supabase-js")
    const sb = adminClient()

    const { data: row } = await sb.from("microsoft_tokens").select("*").eq("id", "dalen").single()
    if (!row) {
      await logCronRun("microsoft-refresh", "No token row found", ["No token found"])
      return Response.json({ error: "No token found" }, { status: 404 })
    }

    const res = await fetch(
      `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID,
          client_secret: process.env.AZURE_CLIENT_SECRET,
          refresh_token: row.refresh_token,
          grant_type: "refresh_token",
          scope: "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Contacts.ReadWrite https://graph.microsoft.com/Calendars.Read offline_access"
        })
      }
    )

    if (!res.ok) {
      const err = await res.text()
      await logCronRun("microsoft-refresh", "Refresh failed", [`HTTP ${res.status}: ${err.slice(0, 200)}`])
      return Response.json({ error: "Refresh failed", detail: err }, { status: 500 })
    }

    const tokens = await res.json()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await sb.from("microsoft_tokens").upsert({
      id: "dalen",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || row.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    })

    await logCronRun("microsoft-refresh", `Token refreshed, expires ${expiresAt}`)
    return Response.json({ success: true, expires_at: expiresAt })
  } catch(e) {
    await logCronRun("microsoft-refresh", "Exception", [e.message])
    return Response.json({ error: e.message }, { status: 500 })
  }
}
