// POST /api/transcribe
// Accepts an audio blob, sends to OpenAI Whisper, returns clean text
// Replaces browser SpeechRecognition throughout the app

export async function POST(request) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_KEY) return Response.json({ error: 'No OPENAI_API_KEY' }, { status: 500 })

  try {
    const formData = await request.formData()
    const audio = formData.get('audio')
    if (!audio) return Response.json({ error: 'No audio file' }, { status: 400 })

    // Forward to Whisper API
    const whisperForm = new FormData()
    whisperForm.append('file', audio, 'recording.webm')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', 'en')
    // Prompt helps Whisper understand domain-specific terms
    whisperForm.append('prompt', 'CFO Circle, Stalliant, HeyReach, DigitalOcean, Calendly, Supabase, PeerChair, Sales Navigator, Dalen Lawrence, Los Angeles, LinkedIn')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + OPENAI_KEY },
      body: whisperForm
    })

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: 'Whisper error: ' + err }, { status: 500 })
    }

    const data = await res.json()
    return Response.json({ text: data.text || '' })

  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
