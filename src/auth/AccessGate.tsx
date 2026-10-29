import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from '../App'
import { InviteEnrollment } from '../invites/InviteEnrollment'
import type { AccessRequest, ResearchFlowUser } from '../models/ResearchFlowUser'
import { CoordinatorDashboard, DirectorDashboard } from '../governance/GovernanceDashboard'
import { authService, supabase, supabaseConfigured } from '../services/supabase'
import { accessService } from './accessService'

type Bootstrap = 'loading' | 'guest' | 'restricted' | 'authorized' | 'error'

const inviteTokenFromLocation = () => {
  const match = window.location.hash.match(/^#\/invite\/([^/?#]+)/i)
  if (match?.[1]) return decodeURIComponent(match[1])
  return authService.getPendingInviteToken()
}

function AccessRestricted({ session, onRetry }: { session: Session; onRetry: () => void }) {
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<AccessRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void accessService.getPendingRequest(session.user.id).then(setPending).catch(() => undefined)
  }, [session.user.id])

  const request = async () => {
    setBusy(true)
    setError('')
    try {
      setPending(await accessService.requestAccess(session.user, message))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar a solicitação.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="access-page">
    <div className="access-card">
      <div className="brand-mark">RF</div>
      <span className="eyebrow">Instituto Foton · ResearchFlow</span>
      <h1>Acesso não autorizado</h1>
      <p>Sua conta Google foi autenticada, mas este e-mail ainda não possui autorização para acessar o ResearchFlow do Instituto Foton.</p>
      <div className="identity-chip">
        <strong>{session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Usuário'}</strong>
        <span>{session.user.email}</span>
      </div>
      {pending ? <div className="pending-box">
        <strong>Sua solicitação de acesso já está pendente.</strong>
        <span>Solicitada em {new Date(pending.requested_at).toLocaleString('pt-BR')}.</span>
      </div> : <>
        <label className="request-message">Mensagem para o Instituto Foton <span>(opcional)</span>
          <textarea value={message} onChange={(e)=>setMessage(e.target.value)} placeholder="Informe seu laboratório, projeto ou vínculo com o Instituto Foton." maxLength={800}/>
        </label>
        <button className="primary-button" onClick={request} disabled={busy}>{busy ? 'Enviando…' : 'Solicitar acesso'}</button>
      </>}
      {error && <div className="error-banner">{error}</div>}
      <div className="access-actions">
        <button className="secondary-button" onClick={onRetry}>Verificar novamente</button>
        <button className="secondary-button" onClick={() => void authService.signOut()}>Sair</button>
      </div>
    </div>
  </div>
}

export default function AccessGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ResearchFlowUser | null>(null)
  const [state, setState] = useState<Bootstrap>('loading')
  const [error, setError] = useState('')
  const [inviteToken, setInviteToken] = useState<string | null>(() => inviteTokenFromLocation())

  const bootstrap = async (nextSession?: Session | null) => {
    setState('loading')
    setError('')
    try {
      const active = nextSession === undefined ? await authService.getSession() : nextSession
      setSession(active)

      const token = inviteTokenFromLocation()
      setInviteToken(token)
      if (token) {
        setProfile(null)
        setState(active ? 'authorized' : 'guest')
        return
      }

      if (!active) {
        setProfile(null)
        setState('guest')
        return
      }
      const member = await accessService.loadCurrentUser(active.user)
      setProfile(member)
      setState(member ? 'authorized' : 'restricted')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao validar seu acesso institucional.')
      setState('error')
    }
  }

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setState('guest')
      return
    }
    void bootstrap()
    const { data } = supabase.auth.onAuthStateChange((_event, next) => void bootstrap(next))
    const onHashChange = () => void bootstrap()
    window.addEventListener('hashchange', onHashChange)
    return () => {
      data.subscription.unsubscribe()
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  if (inviteToken) return <InviteEnrollment token={inviteToken} session={session}/>
  if (state === 'loading') return <div className="app-loading">Validando acesso ao ResearchFlow…</div>
  if (state === 'guest') return <App />
  if (state === 'restricted' && session) return <AccessRestricted session={session} onRetry={() => void bootstrap(session)}/>
  if (state === 'error') return <div className="access-page"><div className="access-card">
    <h1>Não foi possível validar o acesso</h1>
    <p>{error}</p>
    <p className="muted">Verifique se as migrations mais recentes do ResearchFlow foram aplicadas no Supabase e tente novamente.</p>
    <div className="access-actions">
      {session && <button className="secondary-button" onClick={() => void bootstrap(session)}>Tentar novamente</button>}
      <button className="secondary-button" onClick={() => void authService.signOut()}>Sair</button>
    </div>
  </div></div>

  if (profile?.role === 'researcher') return <App />
  if (profile?.role === 'lab_coordinator') return <CoordinatorDashboard profile={profile}/>
  if (profile?.role === 'director') return <DirectorDashboard profile={profile}/>

  return <div className="access-page"><div className="access-card">
    <h1>Papel de acesso não suportado</h1>
    <p>O ResearchFlow possui três níveis funcionais: Diretor, Coordenador de Laboratório e Pesquisador.</p>
    <button className="secondary-button" onClick={() => void authService.signOut()}>Sair</button>
  </div></div>
}
