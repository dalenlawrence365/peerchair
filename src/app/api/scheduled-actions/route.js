import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data, error } = await supabase
    .from('scheduled_actions')
    .select('*')
    .eq('status', 'pending')
    .order('send_at', { ascending: true })
    .limit(50)

  if (error) return Response.json([], { status: 500 })
  return Response.json(data || [])
}
