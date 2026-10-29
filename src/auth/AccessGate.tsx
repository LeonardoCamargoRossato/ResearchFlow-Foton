import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from '../App'
import type { AccessRequest, ResearchFlowRole, ResearchFlowUser } from '../models/ResearchFlowUser'
import { authService, supabase, supabaseConfigured } from '../services/supabase'
import { accessService } from './accessService'

type Bootstrap = 'loading' | 'guest' | 'restricted' | 'authorized' | 'error'

const roleLabel: Record<ResearchFlowRole, string> = {
  researcher: 'Pesquisador',
  lab_coordinator: 'Coordenação de Laboratório',
  vertical_coordinator: 'Coordenação de Vertical',
  director: 'Diretoria'
}

function AccessRestricted({ session, onRetry }: { session: Session; onRetry: () => void }) {
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<AccessRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void accessService.getPendingRequest(session.user.id).then(setPending).catch(() => undefined) }, [session.user.id])

  const request = async () => {
    setBusy(true); setError('')
    try { setPending(await accessService.requestAccess(session.user, message)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível registrar a solicitação.') }
    finally { setBusy(false) }
  }

  return <div className="access-page">
    <div className="access-card">
      <div className="brand-mark">RF</div>
      <span className="eyebrow">Instituto Foton · ResearchFlow</span>
      <h1>Acesso não autorizado</h1>
      <p>Sua conta Google foi autenticada, mas este e-mail ainda não possui autorização para acessar o ResearchFlow do Instituto Foton.</p>
      <div className="identity-chip"><strong>{session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Usuário'}</strong><span>{session.user.email}</span></div>
      {pending ? <div className="pending-box"><strong>Sua solicitação de acesso já está pendente.</strong><span>Solicitada em {new Date(pending.requested_at).toLocaleString('pt-BR')}.</span></div> : <>
        <label className="request-message">Mensagem para o Instituto Foton <span>(opcional)</span><textarea value={message} onChange={(e)=>setMessage(e.target.value)} placeholder="Informe seu laboratório, projeto ou vínculo com o Instituto Foton." maxLength={800}/></label>
        <button className="primary-button" onClick={request} disabled={busy}>{busy ? 'Enviando…' : 'Solicitar acesso'}</button>
      </>}
      {error && <div className="error-banner">{error}</div>}
      <div className="access-actions"><button className="secondary-button" onClick={onRetry}>Verificar novamente</button><button className="secondary-button" onClick={() => void authService.signOut()}>Sair</button></div>
    </div>
  </div>
}

function GovernanceWorkspace({ profile }: { profile: ResearchFlowUser }) {
  const [members, setMembers] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [selectedReport, setSelectedReport] = useState<any | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    try {
      const [m, r] = await Promise.all([accessService.listVisibleMembers(), accessService.listVisibleReports()])
      setMembers(m); setReports(r)
      if (profile.role === 'director') setRequests(await accessService.listAccessRequests())
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar o workspace autorizado.') }
  }
  useEffect(() => { void load() }, [profile.membershipId])

  const scope = profile.role === 'director' ? 'Instituto Foton' : profile.role === 'vertical_coordinator' ? (profile.verticalName || 'Vertical atribuída') : (profile.laboratoryName || 'Laboratório atribuído')
  const researchers = useMemo(() => members.filter((m:any)=>m.role === 'researcher'), [members])

  const approve = async (request: AccessRequest) => {
    const role = (window.prompt('Papel: researcher, lab_coordinator, vertical_coordinator ou director', 'researcher') || '') as ResearchFlowRole
    if (!['researcher','lab_coordinator','vertical_coordinator','director'].includes(role)) return
    const lab = role === 'researcher' || role === 'lab_coordinator' ? (window.prompt('laboratory_id (UUID; deixe vazio se não se aplica)') || undefined) : undefined
    const vertical = role === 'vertical_coordinator' ? (window.prompt('vertical_id (UUID)') || undefined) : undefined
    try { await accessService.approveAccessRequest(request.id, role, lab, vertical); await load() } catch(e) { setError(e instanceof Error ? e.message : 'Falha ao aprovar.') }
  }

  const reject = async (request: AccessRequest) => {
    const notes = window.prompt('Observação da rejeição (opcional)') || undefined
    try { await accessService.rejectAccessRequest(request.id, notes); await load() } catch(e) { setError(e instanceof Error ? e.message : 'Falha ao rejeitar.') }
  }

  return <div className="governance-shell">
    <header className="topbar governance-topbar"><div className="brand-mark">RF</div><div><h1>ResearchFlow</h1><p>{roleLabel[profile.role]} · {scope}</p></div><div className="user-area"><div className="avatar-fallback">{profile.fullName.slice(0,1)}</div><div className="user-copy"><strong>{profile.fullName}</strong><span>{profile.email}</span></div><button className="secondary-button" onClick={()=>void authService.signOut()}>Sair</button></div></header>
    <main className="governance-main">
      <section className="governance-hero"><span className="eyebrow">{roleLabel[profile.role]}</span><h2>{profile.role === 'lab_coordinator' ? 'Laboratório' : profile.role === 'vertical_coordinator' ? 'Círculo de Pesquisa / Vertical' : 'Diretoria — ResearchFlow'}</h2><p>Visibilidade aplicada pelo PostgreSQL/RLS ao escopo <strong>{scope}</strong>.</p></section>
      {error && <div className="error-banner">{error}</div>}
      <section className="governance-stats"><div><strong>{researchers.length}</strong><span>Pesquisadores visíveis</span></div><div><strong>{reports.length}</strong><span>Relatos recentes</span></div>{profile.role==='director'&&<div><strong>{requests.filter(r=>r.status==='pending').length}</strong><span>Solicitações pendentes</span></div>}</section>
      <section className="governance-panel"><h3>Pesquisadores autorizados</h3><div className="simple-list">{researchers.length ? researchers.map((m:any)=><div key={m.id}><div><strong>{m.full_name || m.email}</strong><span>{m.email}</span></div><small>{m.laboratories?.name || m.research_verticals?.name || 'Escopo institucional'}</small></div>) : <p className="muted">Nenhum pesquisador retornado para seu escopo.</p>}</div></section>
      <section className="governance-panel"><h3>Relatos recentes</h3><div className="simple-list">{reports.length ? reports.map((r:any)=><button className="report-access-row" key={r.id} onClick={()=>setSelectedReport(r)}><div><strong>{r.tag}</strong><span>{r.researcher_name} · {new Date(r.created_at).toLocaleString('pt-BR')}</span></div><small>{Math.round((r.duration_seconds||0)/60)} min</small></button>) : <p className="muted">Nenhum relato autorizado foi retornado.</p>}</div></section>
      {profile.role === 'director' && <section className="governance-panel"><h3>Solicitações de acesso</h3><div className="simple-list">{requests.map(r=><div key={r.id} className="request-admin-row"><div><strong>{r.full_name || r.email}</strong><span>{r.email} · {new Date(r.requested_at).toLocaleString('pt-BR')}</span>{r.message&&<small>{r.message}</small>}</div><div><span className={`status-pill ${r.status}`}>{r.status}</span>{r.status==='pending'&&<><button onClick={()=>void approve(r)}>Aprovar</button><button onClick={()=>void reject(r)}>Rejeitar</button></>}</div></div>)}</div></section>}
    </main>
    {selectedReport && <div className="governance-drawer"><button className="drawer-close" onClick={()=>setSelectedReport(null)}>×</button><span className="eyebrow">Relato</span><h2>{selectedReport.tag}</h2><p><strong>{selectedReport.researcher_name}</strong><br/>{new Date(selectedReport.created_at).toLocaleString('pt-BR')}</p><h3>Transcrição</h3><div className="transcript-readonly">{selectedReport.transcript || 'Sem transcrição.'}</div><p className="muted">Acesso de coordenação/diretoria é somente leitura nesta versão.</p></div>}
  </div>
}

export default function AccessGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ResearchFlowUser | null>(null)
  const [state, setState] = useState<Bootstrap>('loading')
  const [error, setError] = useState('')

  const bootstrap = async (nextSession?: Session | null) => {
    setState('loading'); setError('')
    try {
      const active = nextSession === undefined ? await authService.getSession() : nextSession
      setSession(active)
      if (!active) { setProfile(null); setState('guest'); return }
      const member = await accessService.loadCurrentUser(active.user)
      setProfile(member)
      setState(member ? 'authorized' : 'restricted')
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao validar seu acesso institucional.'); setState('error') }
  }

  useEffect(() => {
    if (!supabaseConfigured || !supabase) { setState('guest'); return }
    void bootstrap()
    const { data } = supabase.auth.onAuthStateChange((_event, next)=>void bootstrap(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (state === 'loading') return <div className="app-loading">Validando acesso ao ResearchFlow…</div>
  if (state === 'guest') return <App />
  if (state === 'restricted' && session) return <AccessRestricted session={session} onRetry={()=>void bootstrap(session)}/>
  if (state === 'error') return <div className="access-page"><div className="access-card"><h1>Não foi possível validar o acesso</h1><p>{error}</p><p className="muted">Se a migração V2 ainda não foi aplicada no Supabase, execute-a antes de testar a governança.</p><button className="secondary-button" onClick={()=>void authService.signOut()}>Sair</button></div></div>
  if (profile?.role === 'researcher') return <App />
  if (profile) return <GovernanceWorkspace profile={profile}/>
  return <App />
}
