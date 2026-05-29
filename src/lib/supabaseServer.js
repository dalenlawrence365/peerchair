import { createClient } from "@supabase/supabase-js"

// Server-side Supabase client for API routes.
//
// IMPORTANT: supabase-js issues table reads as GET requests, and Next.js will
// cache GET fetches in its Data Cache — so a profile/list endpoint can serve a
// FROZEN snapshot from before recent writes, even on a force-dynamic route.
// (RPC calls are POST and never cached, which is why /api/health stayed fresh
// while /api/people/[id] went stale.) We pass a custom fetch that forces
// cache:"no-store" on every request so reads are always live.
export function serverClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (url, opts = {}) => fetch(url, { ...opts, cache: "no-store" }) },
    }
  )
}
