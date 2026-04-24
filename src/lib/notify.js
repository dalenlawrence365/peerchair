// PeerChair Notification Service
// Sends alerts via Resend email (SMS via Twilio when A2P registration completes)

export async function sendAlert(subject, message, html) {
  const apiKey = process.env.RESEND_API_KEY
  const to     = process.env.ALERT_EMAIL
  if (!apiKey || !to) { console.error('Resend not configured'); return false }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'PeerChair <onboarding@resend.dev>',
        to: [to],
        subject: subject,
        html: html || '<p>' + message + '</p>',
        text: message,
      })
    })
    const data = await res.json()
    if (data.id) { console.log('Email sent:', data.id); return true }
    console.error('Email failed:', data)
    return false
  } catch(e) { console.error('Email error:', e); return false }
}

// Convenience wrappers for each event type
export async function alertNewConnection(firstName, lastName, company) {
  const name = firstName + ' ' + lastName
  return sendAlert(
    '🔗 New Connection — ' + name,
    'New LinkedIn connection: ' + name + (company ? ' at ' + company : '') + '. Check PeerChair pipeline.',
    `<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#f0c84a;margin:0 0 8px">🔗 New Connection</h2>
      <p style="font-size:16px;margin:0 0 16px"><strong>${name}</strong>${company ? ' · ' + company : ''}</p>
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`
  )
}

export async function alertLinkedInReply(firstName, lastName, company, messagePreview) {
  const name = firstName + ' ' + lastName
  return sendAlert(
    '💬 LinkedIn Reply — ' + name,
    name + ' replied on LinkedIn. Respond now.',
    `<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#f0c84a;margin:0 0 8px">💬 LinkedIn Reply</h2>
      <p style="font-size:16px;margin:0 0 8px"><strong>${name}</strong>${company ? ' · ' + company : ''}</p>
      ${messagePreview ? '<p style="background:#f5f5f5;padding:12px;border-radius:5px;font-style:italic;margin:0 0 16px">"' + messagePreview + '"</p>' : ''}
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`
  )
}

export async function alertFitCallBooked(name, dateStr) {
  return sendAlert(
    '📅 Fit Call Booked — ' + name,
    'Fit call booked with ' + name + (dateStr ? ' for ' + dateStr : '') + '.',
    `<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#2ecc71;margin:0 0 8px">📅 Fit Call Booked</h2>
      <p style="font-size:16px;margin:0 0 8px"><strong>${name}</strong>${dateStr ? ' · ' + dateStr : ''}</p>
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`
  )
}

export async function alertFitCallCanceled(name) {
  return sendAlert(
    '⚠️ Fit Call Canceled — ' + name,
    name + ' canceled their fit call. Reschedule needed.',
    `<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#e74c3c;margin:0 0 8px">⚠️ Fit Call Canceled</h2>
      <p style="font-size:16px;margin:0 0 16px"><strong>${name}</strong> canceled their fit call. Reschedule needed.</p>
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`
  )
}

export async function alertCampaignStopped() {
  return sendAlert(
    '🚨 HeyReach Campaign Stopped',
    'Your HeyReach campaign has stopped. Check your LinkedIn connection immediately.',
    `<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#e74c3c;margin:0 0 8px">🚨 Campaign Stopped</h2>
      <p style="font-size:16px;margin:0 0 16px">Your HeyReach campaign has stopped running. Check your LinkedIn / Sales Navigator connection immediately — your pipeline has stopped growing.</p>
      <a href="https://app.heyreach.io" style="background:#e74c3c;color:#fff;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open HeyReach →</a>
    </div>`
  )
}

export async function alertEngagementExpired(contacts) {
  const list = contacts.map(function(c){ return '<li>' + c + '</li>' }).join('')
  return sendAlert(
    '⏰ Engagement Window Expired — ' + contacts.length + ' contacts',
    contacts.length + ' contacts hit the 14-day window with no reply: ' + contacts.join(', '),
    `<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#e67e22;margin:0 0 8px">⏰ Engagement Window Expired</h2>
      <p style="margin:0 0 12px">${contacts.length} contact${contacts.length > 1 ? 's have' : ' has'} hit the 14-day window with no reply. Move to reserve or re-engage:</p>
      <ul style="margin:0 0 16px;padding-left:20px">${list}</ul>
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`
  )
}
