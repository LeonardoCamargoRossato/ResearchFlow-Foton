import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminEmail = Deno.env.get('ADMIN_NOTIFICATION_EMAIL')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('ACCESS_NOTIFICATION_FROM_EMAIL') || 'ResearchFlow <onboarding@resend.dev>'

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json().catch(() => ({}))
  const requestId = String(body.requestId || '')
  if (!requestId) return new Response('requestId required', { status: 400 })

  const admin = createClient(supabaseUrl, serviceRole)
  const { data: accessRequest, error } = await admin.from('access_requests').select('id,auth_user_id,email,full_name,requested_at,message,status').eq('id', requestId).single()
  if (error || !accessRequest || accessRequest.auth_user_id !== user.id) return new Response('Request not found', { status: 404 })

  // Request storage is the source of truth. Notification is deliberately best-effort.
  if (!adminEmail || !resendKey) {
    return Response.json({ ok: true, notified: false, reason: 'Email provider not configured' })
  }

  const html = `<h2>ResearchFlow — Nova solicitação de acesso</h2>
    <p><strong>Nome:</strong> ${escapeHtml(accessRequest.full_name || 'Não informado')}</p>
    <p><strong>E-mail:</strong> ${escapeHtml(accessRequest.email)}</p>
    <p><strong>Data:</strong> ${escapeHtml(accessRequest.requested_at)}</p>
    <p><strong>Mensagem:</strong> ${escapeHtml(accessRequest.message || 'Sem mensagem')}</p>
    <p><strong>ID:</strong> ${escapeHtml(accessRequest.id)}</p>`

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [adminEmail], subject: 'ResearchFlow — Nova solicitação de acesso', html })
  })

  if (!emailResponse.ok) {
    console.error('Notification failed', await emailResponse.text())
    return Response.json({ ok: true, notified: false, reason: 'Provider failure' })
  }
  return Response.json({ ok: true, notified: true })
})

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char] || char))
}
