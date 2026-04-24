// PeerChair SMS Notification Service
// Sends texts to Dalen via Twilio for key pipeline events

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM         = process.env.TWILIO_FROM
const TO           = process.env.ALERT_PHONE

export async function sendSMS(message) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !FROM || !TO) {
    console.error('Twilio not configured')
    return false
  }
  try {
    const body = new URLSearchParams({ To: TO, From: FROM, Body: message })
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(TWILIO_SID + ':' + TWILIO_TOKEN).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString()
      }
    )
    const data = await res.json()
    if (data.sid) {
      console.log('SMS sent:', data.sid)
      return true
    } else {
      console.error('SMS failed:', data)
      return false
    }
  } catch (err) {
    console.error('SMS error:', err)
    return false
  }
}

// Test endpoint — hit this URL to send a test text
export async function GET() {
  const ok = await sendSMS('PeerChair is live. SMS notifications are working.')
  return Response.json({ sent: ok, to: TO, from: FROM })
}

// Event endpoint — POST with { event, name, company, detail }
export async function POST(request) {
  try {
    const { event, name, company, detail } = await request.json()

    const messages = {
      new_connection:  `PeerChair: New connection — ${name}${company ? ' at ' + company : ''}. Check pipeline.`,
      linkedin_reply:  `PeerChair: ${name} replied on LinkedIn${company ? ' (' + company + ')' : ''}. Respond now.`,
      fit_call_booked: `PeerChair: Fit call booked — ${name}${company ? ' at ' + company : ''}${detail ? ' · ' + detail : ''}.`,
      fit_call_cancel: `PeerChair: Fit call CANCELED — ${name}. Reschedule needed.`,
      campaign_stopped:`PeerChair: ⚠️ HeyReach campaign stopped. Check your LinkedIn connection.`,
      engagement_expired: `PeerChair: ${name} hit 14-day window with no reply. Move to reserve or re-engage.`,
    }

    const msg = messages[event] || `PeerChair alert: ${event} — ${name}`
    const ok = await sendSMS(msg)
    return Response.json({ sent: ok, message: msg })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
