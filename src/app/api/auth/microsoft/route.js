// GET /api/auth/microsoft
// Redirects to Microsoft OAuth consent screen

export async function GET() {
  const clientId  = process.env.AZURE_CLIENT_ID
  const tenantId  = process.env.AZURE_TENANT_ID
  const redirect  = process.env.AZURE_REDIRECT_URI || "https://www.peerchair.com/api/auth/microsoft/callback"

  const scopes    = [
    "https://graph.microsoft.com/Mail.Read",
    "https://graph.microsoft.com/Mail.Send",
    "https://graph.microsoft.com/Mail.ReadWrite",
    "https://graph.microsoft.com/Contacts.ReadWrite",
    "https://graph.microsoft.com/Calendars.Read",
    "offline_access",
    "openid",
    "profile",
  ].join(" ")

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`
    + `?client_id=${clientId}`
    + `&response_type=code`
    + `&redirect_uri=${encodeURIComponent(redirect)}`
    + `&scope=${encodeURIComponent(scopes)}`
    + `&response_mode=query`
    + `&prompt=consent`

  return Response.redirect(url)
}
