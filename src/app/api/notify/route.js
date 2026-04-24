import { sendAlert } from '@/lib/notify'

export async function GET() {
  const ok = await sendAlert(
    '✅ PeerChair Notifications Active',
    'PeerChair email notifications are working correctly.',
    `<div style="font-family:sans-serif;max-width:480px;padding:20px">
      <h2 style="color:#f0c84a;margin:0 0 8px">✅ PeerChair is Live</h2>
      <p style="font-size:16px;margin:0 0 16px">Email notifications are working. You will receive alerts for:</p>
      <ul style="margin:0 0 16px;padding-left:20px">
        <li>New LinkedIn connections</li>
        <li>LinkedIn replies</li>
        <li>Fit calls booked or canceled</li>
        <li>14-day engagement window expiring</li>
        <li>HeyReach campaign stopped</li>
      </ul>
      <a href="https://www.peerchair.com" style="background:#f0c84a;color:#000;padding:10px 20px;border-radius:5px;text-decoration:none;font-weight:bold">Open PeerChair →</a>
    </div>`
  )
  return Response.json({ sent: ok, to: process.env.ALERT_EMAIL })
}

export async function POST(request) {
  try {
    const { subject, message, html } = await request.json()
    const { sendAlert } = await import('@/lib/notify')
    const ok = await sendAlert(subject, message, html)
    return Response.json({ sent: ok })
  } catch(err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
