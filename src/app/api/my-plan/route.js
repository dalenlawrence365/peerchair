// My Plan API — unified view of all pending intentions
// Returns follow_up_tasks + scheduled_actions merged and sorted by date

import { createClient } from '@supabase/supabase-js'
import { serverClient } from "@/lib/supabaseServer"

export async function GET() {
  const supabase = serverClient()

  // Load open tasks
  const { data: tasks } = await supabase
    .from('follow_up_tasks')
    .select('*')
    .eq('status', 'open')
    .order('due_at', { ascending: true, nullsLast: true })
    .limit(200)

  // Load pending scheduled actions
  const { data: scheduled } = await supabase
    .from('scheduled_actions')
    .select('*')
    .eq('status', 'pending')
    .order('send_at', { ascending: true })
    .limit(100)

  // Normalize to unified format
  const items = []

  ;(tasks || []).forEach(t => {
    items.push({
      id: t.id,
      type: 'task',
      contact_id: t.contact_id,
      contact_first_name: t.contact_first_name || '',
      contact_last_name: t.contact_last_name || '',
      contact_company: t.contact_company || '',
      contact_type: t.contact_type || 'CFO_PROSPECT',
      note: t.note || '',
      priority: t.priority || 'normal',
      source: t.source || 'manual',
      source_message: t.source_message || '',
      due_at: t.due_at || null,
      due_date: t.due_date || null,
      created_at: t.created_at,
      status: t.status,
      task_type: t.task_type,
    })
  })

  ;(scheduled || []).forEach(s => {
    items.push({
      id: s.id,
      type: 'scheduled',
      contact_id: s.contact_id,
      contact_first_name: s.contact_first_name || '',
      contact_last_name: s.contact_last_name || '',
      contact_company: s.contact_company || '',
      contact_type: 'CFO_PROSPECT',
      note: s.message_body || '',
      priority: 'normal',
      source: 'scheduled',
      source_message: '',
      due_at: s.send_at,
      due_date: null,
      created_at: s.created_at,
      status: s.status,
      channel: s.channel,
      mode: s.mode,
    })
  })

  // Sort: items with due_at first (ascending), then no-date items
  items.sort((a, b) => {
    if (!a.due_at && !b.due_at) return new Date(b.created_at) - new Date(a.created_at)
    if (!a.due_at) return 1
    if (!b.due_at) return -1
    return new Date(a.due_at) - new Date(b.due_at)
  })

  return Response.json({ items, taskCount: (tasks||[]).length, scheduledCount: (scheduled||[]).length })
}

export async function POST(request) {
  const supabase = serverClient()
  const body = await request.json()
  const { action } = body

  // Complete a task
  if (action === 'complete') {
    const { id, type } = body
    if (type === 'task') {
      await supabase.from('follow_up_tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id)
    } else if (type === 'scheduled') {
      await supabase.from('scheduled_actions').update({ status: 'cancelled', status_updated_at: new Date().toISOString() }).eq('id', id)
    }
    return Response.json({ success: true })
  }

  // Create a task
  if (action === 'create_task') {
    const { contact_id, contact_first_name, contact_last_name, contact_company, contact_type, note, priority, due_at, source, source_message } = body
    const { data, error } = await supabase.from('follow_up_tasks').insert({
      contact_id, contact_first_name, contact_last_name, contact_company,
      contact_type: contact_type || 'CFO_PROSPECT',
      note, priority: priority || 'normal',
      due_at: due_at || null,
      source: source || 'manual',
      source_message: source_message || '',
      status: 'open',
      task_type: 'manual',
    }).select().single()
    if (error) return Response.json({ success: false, error: error.message })
    return Response.json({ success: true, task: data })
  }

  // Reschedule
  if (action === 'reschedule') {
    const { id, type, due_at } = body
    if (type === 'task') {
      await supabase.from('follow_up_tasks').update({ due_at, updated_at: new Date().toISOString() }).eq('id', id)
    } else {
      await supabase.from('scheduled_actions').update({ send_at: due_at, updated_at: new Date().toISOString() }).eq('id', id)
    }
    return Response.json({ success: true })
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 })
}
