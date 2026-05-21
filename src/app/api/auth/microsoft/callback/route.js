export const dynamic = "force-dynamic"

// GET /api/auth/microsoft/callback
// Exchanges OAuth code for access + refresh tokens, stores in Supabase

import { createClient } from "@supabase/supabase-js"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get("code")
  const error = searchParams.get("error")

  if (error) {
    return Response.redirect("https://www.peerchair.com?auth_error=" + encodeURIComponent(error))
  }
  if (!code) {
    return Response.redirect("https://www.peerchair.com?auth_error=no_code")
  }

  const clientId     = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET
  const tenantId     = process.env.AZURE_TENANT_ID
  const redirect     = process.env.AZURE_REDIRECT_URI || "https://www.peerchair.com/api/auth/microsoft/callback"

  // Exchange code for tokens
  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
        redirect_uri:  redirect,
        grant_type:    "authorization_code",
        scope:         "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Contacts.ReadWrite https://graph.microsoft.com/Calendars.Read offline_access openid profile",
      })
    }
  )

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error("Token exchange failed:", err)
    return Response.redirect("https://www.peerchair.com?auth_error=token_exchange_failed")
  }

  const tokens = await tokenRes.json()

  // Store tokens in Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000)).toISOString()

  await supabase.from("microsoft_tokens").upsert({
    id:            "dalen",
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at:    expiresAt,
    scope:         tokens.scope,
    updated_at:    new Date().toISOString()
  }, { onConflict: "id" })

  return Response.redirect("https://www.peerchair.com?auth_success=microsoft")
}
