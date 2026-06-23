// POST /api/transcribe
// Accepts audio blob, transcribes via OpenAI Whisper, logs to voice_commands table

import { createClient } from '@supabase/supabase-js'
import { serverClient } from "@/lib/supabaseServer"

export async function POST(request) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_KEY) return Response.json({ error: 'No OPENAI_API_KEY' }, { status: 500 })

  const supabase = serverClient()

  let commandId = null
  let rawTranscript = null

  try {
    const formData = await request.formData()
    const audio     = formData.get('audio')
    const contactId = formData.get('contact_id') || null
    const source    = formData.get('source') || 'unknown'

    if (!audio) return Response.json({ error: 'No audio file' }, { status: 400 })

    // Create pending voice_command record immediately
    const { data: cmd } = await supabase
      .from('voice_commands')
      .insert({
        person_id:   contactId,
        source,
        status:      'transcribing',
        occurred_at: new Date().toISOString()
      })
      .select('id')
      .single()
    if (cmd) commandId = cmd.id

    // Send to Whisper
    const whisperForm = new FormData()
    whisperForm.append('file', audio, 'recording.webm')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', 'en')
    whisperForm.append('prompt', 'CFO Circle, Stalliant, DigitalOcean, Calendly, Supabase, PeerChair, Sales Navigator, LinkedIn, Los Angeles, Dalen Lawrence')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + OPENAI_KEY },
      body:    whisperForm
    })

    if (!res.ok) {
      const err = await res.text()
      if (commandId) await supabase.from('voice_commands').update({ status: 'failed', result: 'Whisper error: ' + err }).eq('id', commandId)
      return Response.json({ error: 'Whisper error: ' + err }, { status: 500 })
    }

    const data = await res.json()
    rawTranscript = data.text || ''

    // Update record with transcript
    if (commandId) {
      await supabase.from('voice_commands')
        .update({ raw_transcript: rawTranscript, command_text: rawTranscript, status: 'transcribed' })
        .eq('id', commandId)
    }

    return Response.json({ text: rawTranscript, command_id: commandId })

  } catch(e) {
    if (commandId) {
      await supabase.from('voice_commands').update({ status: 'failed', result: e.message }).eq('id', commandId)
    }
    return Response.json({ error: e.message }, { status: 500 })
  }
}
