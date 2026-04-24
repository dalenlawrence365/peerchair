export async function GET() {
  try {
    const TOKEN = process.env.CALENDLY_TOKEN
    if (!TOKEN) return Response.json({ error: 'No CALENDLY_TOKEN set' }, { status: 500 })

    const headers = {
      'Authorization': 'Bearer ' + TOKEN,
      'Content-Type': 'application/json'
    }

    // Get current user + org
    const meRes = await fetch('https://api.calendly.com/users/me', { headers })
    const me = await meRes.json()
    const userUri = me.resource?.uri
    const orgUri = me.resource?.current_organization

    if (!userUri) return Response.json({ error: 'Could not get user', me }, { status: 500 })

    // Check existing webhooks
    const existingRes = await fetch('https://api.calendly.com/webhook_subscriptions?organization=' + encodeURIComponent(orgUri) + '&scope=organization', { headers })
    const existing = await existingRes.json()
    const alreadyExists = existing.collection?.some(w => w.callback_url?.includes('peerchair'))

    if (alreadyExists) {
      return Response.json({ status: 'already_registered', webhooks: existing.collection })
    }

    // Register webhook
    const payload = {
      url: 'https://www.peerchair.com/api/calendly-webhook',
      events: ['invitee.created', 'invitee.canceled'],
      organization: orgUri,
      user: userUri,
      scope: 'user'
    }

    const regRes = await fetch('https://api.calendly.com/webhook_subscriptions', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    const reg = await regRes.json()

    // Get event types for reference
    const etRes = await fetch('https://api.calendly.com/event_types?user=' + encodeURIComponent(userUri), { headers })
    const et = await etRes.json()
    const eventTypes = et.collection?.map(e => ({ name: e.name, slug: e.slug, active: e.active }))

    return Response.json({
      status: 'webhook_registered',
      webhook: reg,
      eventTypes
    })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
