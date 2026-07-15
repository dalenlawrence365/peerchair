import { createClient } from "@supabase/supabase-js"

export async function getAccessToken(opts = {}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data: row } = await supabase.from("microsoft_tokens").select("*").eq("id","dalen").single()
  if (!row) throw new Error("No Microsoft token. Visit /api/auth/microsoft to authorize.")
  if (!opts.force && new Date(row.expires_at) > new Date(Date.now() + 5*60000)) return row.access_token

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body: new URLSearchParams({
        client_id:process.env.AZURE_CLIENT_ID, client_secret:process.env.AZURE_CLIENT_SECRET,
        refresh_token:row.refresh_token, grant_type:"refresh_token",
        scope:"https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Contacts.ReadWrite https://graph.microsoft.com/Calendars.Read offline_access"
      })
    }
  )
  if (!res.ok) throw new Error("Token refresh failed: " + await res.text())
  const tokens = await res.json()
  const exp = new Date(Date.now() + tokens.expires_in*1000).toISOString()
  await supabase.from("microsoft_tokens").upsert({id:"dalen",access_token:tokens.access_token,refresh_token:tokens.refresh_token||row.refresh_token,expires_at:exp,updated_at:new Date().toISOString()},{onConflict:"id"})
  return tokens.access_token
}


// Every Graph call must survive a stale cached token. getAccessToken() trusts the
// stored expires_at, which can say "valid" while Graph considers the token expired
// (401 InvalidAuthenticationToken). That silently killed the sync crons. One forced
// refresh + retry fixes it, and self-heals the stored token for the next caller.
export async function graphFetch(url, init = {}) {
  let token = await getAccessToken()
  const call = (t) => fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: "Bearer " + t },
  })
  let res = await call(token)
  if (res.status === 401) {
    token = await getAccessToken({ force: true })
    res = await call(token)
  }
  return res
}
