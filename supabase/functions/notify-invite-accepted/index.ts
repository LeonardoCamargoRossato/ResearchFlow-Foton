import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('INVITE_CONFIRMATION_FROM_EMAIL') || 'ResearchFlow <onboarding@resend.dev>'

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user?.email) return new Response('Unauthorized', { status: 401 })

  const admin = createClient(supabaseUrl, serviceRole)
  const { data: invite } = await admin
    .from('researchflow_invites')
    .select('id,person_id,laboratory_id,intended_role,status,accepted_email,accepted_at')
    .eq('accepted_auth_user_id', user.id)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!invite) return new Response('Accepted invite not found', { status: 404 })

  const [{ data: person }, { data: lab }] = await Promise.all([
    admin.from('people').select('display_name').eq('id', invite.person_id).maybeSingle(),
    invite.laboratory_id ? admin.from('laboratories').select('name').eq('id', invite.laboratory_id).maybeSingle() : Promise.resolve({ data: null })
  ])

  if (!resendKey) return Response.json({ ok: true, notified: false, reason: 'Email provider not configured' })

  const profile = invite.intended_role === 'director' ? 'Diretor' : invite.intended_role === 'lab_coordinator' ? 'Coordenador' : 'Pesquisador'
  const html = `<h2>Bem-vindo ao ResearchFlow — Instituto Foton</h2>
    <p>Olá, ${escapeHtml(person?.display_name || user.email)}.</p>
    <p>Seu acesso ao ResearchFlow foi ativado.</p>
    <p><strong>Perfil:</strong> ${escapeHtml(profile)}</p>
    ${lab?.name ? `<p><strong>Laboratório:</strong> ${escapeHtml(lab.name)}</p>` : ''}
    <p><strong>Conta:</strong> ${escapeHtml(user.email)}</p>
    <p><a href="https://leonardocamargorossato.github.io/ResearchFlow-Foton/">Acessar ResearchFlow</a></p>
    <p>Bem-vindo ao ambiente de acompanhamento de pesquisa do Instituto Foton.</p>`

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [user.email], subject: 'Bem-vindo ao ResearchFlow — Instituto Foton', html })
  })

  if (!emailResponse.ok) {
    console.error('Invite confirmation email failed', await emailResponse.text())
    return Response.json({ ok: true, notified: false, reason: 'Provider failure' })
  }
  return Response.json({ ok: true, notified: true })
})

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char] || char))
}
