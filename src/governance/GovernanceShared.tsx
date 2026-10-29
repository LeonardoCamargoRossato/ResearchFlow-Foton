import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GovernanceMembership, GovernanceReport, GovernanceReportType, MembershipStatus, ResearchFlowUser } from '../models/ResearchFlowUser'
import { authService } from '../services/supabase'
import { formatDate, formatDuration, formatTime } from '../utils/report'
import { governanceService } from './governanceService'

export type PeriodFilter = 'all' | 'today' | 'week' | 'month' | 'custom'

const statusText: Record<MembershipStatus, string> = {
  invited: 'Convidado',
  active: 'Ativo',
  suspended: 'Suspenso',
  revoked: 'Removido'
}

export function GovernanceHeader({ profile, subtitle }: { profile: ResearchFlowUser; subtitle: string }) {
  return <header className="topbar governance-v3-topbar">
    <div className="brand-mark">RF</div>
    <div className="governance-brand"><h1>ResearchFlow</h1><p>{subtitle}</p></div>
    <div className="user-area governance-user-area">
      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="Foto do perfil" referrerPolicy="no-referrer"/> : <div className="avatar-fallback">{profile.fullName.slice(0,1)}</div>}
      <div className="user-copy"><strong>{profile.fullName}</strong><span>{profile.email}</span></div>
      <button className="secondary-button compact-action" onClick={() => void authService.signOut()}>Sair</button>
    </div>
  </header>
}

export function GovernanceModal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose() }}>
    <div className="governance-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-title"><div><span className="eyebrow">ResearchFlow</span><h2>{title}</h2></div><button className="drawer-close" onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>
}

export function StatusPill({ status }: { status: MembershipStatus | 'saved' | 'archived' | 'deleted' | 'pending' | 'approved' | 'rejected' | 'cancelled' }) {
  const label = status in statusText
    ? statusText[status as MembershipStatus]
    : status === 'saved' ? 'Salvo'
      : status === 'archived' ? 'Arquivado'
        : status === 'deleted' ? 'Removido pelo pesquisador'
          : status
  return <span className={`status-pill ${status}`}>{label}</span>
}

const reportTypeLabel = (type: GovernanceReportType) => type === 'coordinator' ? 'Coordenador' : 'Pesquisador'

export function ReportDrawer({ report, onClose, editable=false, onSaveTranscript }: {
  report: GovernanceReport
  onClose: () => void
  editable?: boolean
  onSaveTranscript?: (reportId:string, transcript:string)=>Promise<void>
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioError, setAudioError] = useState('')
  const [transcript,setTranscript]=useState(report.transcript||'')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  useEffect(() => {
    setTranscript(report.transcript||'')
    setAudioUrl(null)
    setAudioError('')
    if (!report.audio_path) return
    void governanceService.createSignedAudioUrl(report.audio_path)
      .then(setAudioUrl)
      .catch(()=>setAudioError('Não foi possível abrir o áudio autorizado.'))
  }, [report.id, report.audio_path, report.transcript])

  return <div className="governance-drawer v3-drawer">
    <button className="drawer-close" onClick={onClose}>×</button>
    <span className="readonly-badge">{editable?'Relato do coordenador · editável':'Relato do pesquisador · somente leitura'}</span>
    <span className="eyebrow">{reportTypeLabel(report.report_type)}</span>
    <h2>{report.tag}</h2>
    <div className="report-meta-grid">
      <div><span>Autor</span><strong>{report.researcher_name}</strong></div>
      <div><span>Tipo</span><strong>{reportTypeLabel(report.report_type)}</strong></div>
      <div><span>Data</span><strong>{formatDate(report.recording_date || report.created_at)}</strong></div>
      <div><span>Horário</span><strong>{formatTime(report.recording_date || report.created_at)}</strong></div>
      <div><span>Duração</span><strong>{formatDuration(report.duration_seconds)}</strong></div>
      <div><span>Status</span><StatusPill status={report.status}/></div>
    </div>
    <h3>Áudio</h3>
    {audioUrl ? <audio className="governance-audio" controls src={audioUrl}/> : <p className="muted">{audioError || (report.audio_path ? 'Carregando áudio…' : 'Áudio indisponível.')}</p>}
    <h3>Transcrição</h3>
    {editable ? <>
      <textarea className="governance-transcript-editor" value={transcript} onChange={e=>setTranscript(e.target.value)} rows={12}/>
      <button className="primary-button transcript-save" disabled={busy} onClick={async()=>{
        if(!onSaveTranscript) return
        setBusy(true);setMessage('')
        try{await onSaveTranscript(report.id,transcript);setMessage('Transcrição atualizada.')}
        catch(e){setMessage(e instanceof Error?e.message:'Não foi possível salvar a transcrição.')}
        finally{setBusy(false)}
      }}>{busy?'Salvando…':'Salvar transcrição'}</button>
      {message&&<p className="drawer-feedback">{message}</p>}
    </> : <div className="transcript-readonly">{report.transcript || 'Sem transcrição.'}</div>}
    <div className="drawer-status">{report.deleted_by_researcher && <span className="muted">Oculto da biblioteca pessoal pelo pesquisador, mas preservado para acompanhamento.</span>}</div>
  </div>
}

export const researcherForUser = (userId: string, members: GovernanceMembership[]) =>
  members.find(m=>m.role==='researcher' && m.auth_user_id===userId)

export function ReportLibrary({ reports, members, onOpen, title, coordinatorMode=false }: {
  reports: GovernanceReport[]
  members: GovernanceMembership[]
  onOpen:(r:GovernanceReport)=>void
  title:string
  coordinatorMode?:boolean
}) {
  const [query,setQuery]=useState('')
  const [researcher,setResearcher]=useState('')
  const [period,setPeriod]=useState<PeriodFilter>('all')
  const [sort,setSort]=useState<'newest'|'oldest'>('newest')
  const [type,setType]=useState<'all'|GovernanceReportType>('all')
  const [start,setStart]=useState('')
  const [end,setEnd]=useState('')

  const filtered=useMemo(()=>{
    const now=new Date()
    const needle=query.trim().toLowerCase()
    const startDate=start?new Date(`${start}T00:00:00`):null
    const endDate=end?new Date(`${end}T23:59:59`):null
    return [...reports].filter(r=>{
      const date=new Date(r.created_at)
      const owner=researcherForUser(r.user_id,members)
      const searchOk=!needle || r.tag.toLowerCase().includes(needle) || r.researcher_name.toLowerCase().includes(needle) || (r.transcript||'').toLowerCase().includes(needle)
      const researcherOk=!researcher || owner?.id===researcher
      const typeOk=type==='all'||r.report_type===type
      let periodOk=true
      if(period==='today') periodOk=date.toDateString()===now.toDateString()
      if(period==='week') { const weekAgo=new Date(now); weekAgo.setDate(now.getDate()-7); periodOk=date>=weekAgo }
      if(period==='month') periodOk=date.getMonth()===now.getMonth() && date.getFullYear()===now.getFullYear()
      if(period==='custom') periodOk=(!startDate||date>=startDate)&&(!endDate||date<=endDate)
      return searchOk&&researcherOk&&typeOk&&periodOk
    }).sort((a,b)=>sort==='newest'?b.created_at.localeCompare(a.created_at):a.created_at.localeCompare(b.created_at))
  },[reports,members,query,researcher,period,sort,type,start,end])

  return <section className="governance-panel report-library">
    <div className="panel-heading"><div><span className="eyebrow">{coordinatorMode?'Laboratório':'Diretoria'}</span><h2>{title}</h2></div><span className="library-count">{filtered.length} relato(s)</span></div>
    <div className="report-filters coordinator-report-filters">
      <label className="search-field">Buscar relatos<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisador, tag ou transcrição"/></label>
      <label>Pesquisador<select value={researcher} onChange={e=>setResearcher(e.target.value)}><option value="">Todos</option>{members.filter(m=>m.role==='researcher').map(m=><option key={m.id} value={m.id}>{m.full_name||m.email}</option>)}</select></label>
      <label>Tipo<select value={type} onChange={e=>setType(e.target.value as 'all'|GovernanceReportType)}><option value="all">Todos</option><option value="researcher">Pesquisador</option><option value="coordinator">Coordenador</option></select></label>
      <label>Período<select value={period} onChange={e=>setPeriod(e.target.value as PeriodFilter)}><option value="all">Todos</option><option value="today">Hoje</option><option value="week">Esta semana</option><option value="month">Este mês</option><option value="custom">Período personalizado</option></select></label>
      <label>Ordenação<select value={sort} onChange={e=>setSort(e.target.value as 'newest'|'oldest')}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option></select></label>
      {period==='custom'&&<><label>De<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Até<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></>}
    </div>
    <div className="data-table">
      <div className="table-head report-cols v4-report-cols"><span>Tag</span><span>Autor</span><span>Tipo</span><span>Data</span><span>Horário</span><span>Duração</span><span>Status</span><span>Ações</span></div>
      {filtered.map(r=><div className="table-row report-cols v4-report-cols" key={r.id}><strong>{r.tag}</strong><span>{r.researcher_name}</span><span>{reportTypeLabel(r.report_type)}</span><span>{formatDate(r.recording_date||r.created_at)}</span><span>{formatTime(r.recording_date||r.created_at)}</span><span>{formatDuration(r.duration_seconds)}</span><StatusPill status={r.status}/><button className="table-open" onClick={()=>onOpen(r)}>Abrir</button></div>)}
    </div>
    {!filtered.length&&<div className="empty-state"><strong>Nenhum relato encontrado.</strong><span>Ajuste os filtros ou aguarde novos envios.</span></div>}
  </section>
}
