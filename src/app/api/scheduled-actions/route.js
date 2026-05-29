import { createClient } from '@supabase/supabase-js'
import { serverClient } from "@/lib/supabaseServer"

export async function GET() {
  const supabase = serverClient()
  const { data, error } = await supabase
    .from('scheduled_actions')
    .select('*')
    .eq('status', 'pending')
    .order('send_at', { ascending: true })
    .limit(50)

  if (error) return Response.json([], { status: 500 })
  return Response.json(data || [])
}
