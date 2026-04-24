export async function sendSMS(message) {
  const sid   = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from  = process.env.TWILIO_FROM
  const to    = process.env.ALERT_PHONE
  if (!sid || !token || !from || !to) return false
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: message }).toString()
      }
    )
    const data = await res.json()
    return !!data.sid
  } catch(e) { console.error('SMS error:', e); return false }
}
