import { useEffect, useMemo, useState } from 'react'
import { accessService } from '../auth/accessService'
import type {
  AccessRequest,
  GovernanceLaboratory,
  GovernanceMembership,
  GovernanceReport,
  ResearchFlowRole,
  ResearchFlowUser
} from '../models/ResearchFlowUser'
import { formatDate, formatDuration, formatTime } from '../utils/report'
import { governanceService } from './governanceService'
import { GovernanceHeader, GovernanceModal, ReportDrawer, StatusPill } from './GovernanceShared'
import '../director-v5.css'

type DirectorTab = 'overview' | 'laboratories' | 'coordinators' | 'researchers' | 'researcherReports' | 'coordinatorReports' | 'requests'
type PeriodFilter = 'all' | 'today' | 'week' | 'month'

const labName = (labId: string | null, labs: GovernanceLaboratory[]) => labs.find(l=>l.id===labId)?.name || 'Sem laboratório'
const coordinatorForLab = (labId: string, members: GovernanceMembership[]) => members.find(m=>m.role==='lab_coordinator' && m.laboratory_id===labId && m.status==='active')
const memberForReport = (report: GovernanceReport, members: GovernanceMembership[]) => members.find(m=>m.auth_user_id===report.user_id)

export function DirectorDashboard({ profile }: { profile: ResearchFlowUser }) {
  const [tab, setTab] = useState<DirectorTab>('overview')
  const [labs, setLabs] = useState<GovernanceLaboratory[]>([])
  const [members, setMembers] = useState<GovernanceMembership[]>([])
  const [reports, setReports] = useState<GovernanceReport[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<GovernanceReport | null>(null)
  const [selectedCoordinator, setSelectedCoordinator] = useState<GovernanceMembership | null>(null)
  const [selectedResearcher, setSelectedResearcher] = useState<GovernanceMembership | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editLab, setEditLab] = useState<GovernanceLaboratory | null>(null)
  const [requestToReview, setRequestToReview] = useState<AccessRequest | null>(null)

  const load = async () => {
    setError('')
    const results = await Promise.allSettled([
      governanceService.listDirectorLaboratories(),
      governanceService.listDirectorMemberships(),
      governanceService.listDirectorReports(),
      accessService.listAccessRequests()
    ])

    let failed = false
    const [labResult, memberResult, reportResult, requestResult] = results

    if (labResult.status === 'fulfilled') setLabs(labResult.value)
    else { failed = true; console.error('Failed to load laboratories', labResult.reason) }

    if (memberResult.status === 'fulfilled') setMembers(memberResult.value)
    else { failed = true; console.error('Failed to load memberships', memberResult.reason) }

    if (reportResult.status === 'fulfilled') setReports(reportResult.value)
    else { failed = true; console.error('Failed to load reports', reportResult.reason) }

    if (requestResult.status === 'fulfilled') setRequests(requestResult.value)
    else { failed = true; console.error('Failed to load access requests', requestResult.reason) }

    if (failed) setError('Não foi possível carregar a visão da Diretoria.')
  }

  useEffect(()=>{ void load() }, [profile.membershipId])

  const researchers = useMemo(()=>members.filter(m=>m.role==='researcher'),[members])
  const coordinators = useMemo(()=>members.filter(m=>m.role==='lab_coordinator'),[members])
  const researcherReports = useMemo(()=>reports.filter(r=>r.report_type==='researcher'),[reports])
  const coordinatorReports = useMemo(()=>reports.filter(r=>r.report_type==='coordinator'),[reports])
  const selectedLab = labs.find(l=>l.id===selectedLabId) || null
  const selectedLabResearchers = researchers.filter(r=>r.laboratory_id===selectedLabId)
  const selectedLabCoordinator = selectedLabId ? coordinatorForLab(selectedLabId,members) : undefined
  const selectedLabMemberIds = new Set(
    members
      .filter(m=>m.laboratory_id===selectedLabId && (m.role==='researcher'||m.role==='lab_coordinator'))
      .map(m=>m.auth_user_id)
      .filter((id): id is string => Boolean(id))
  )
  const selectedLabReports = reports.filter(r=>selectedLabMemberIds.has(r.user_id))

  const laboratoryStats = (lab: GovernanceLaboratory) => {
    const labMembers = members.filter(m=>m.laboratory_id===lab.id && (m.role==='researcher'||m.role==='lab_coordinator'))
    const activeResearchers = labMembers.filter(m=>m.role==='researcher'&&m.status==='active')
    const userIds = new Set(labMembers.map(r=>r.auth_user_id).filter((id): id is string => Boolean(id)))
    const labReports = reports.filter(r=>userIds.has(r.user_id))
    return { researchers: activeResearchers.length, reports: labReports.length, last: labReports[0]?.created_at }
  }

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(()=>setMessage(''),3500)
  }

  const openReportFromModal = (report: GovernanceReport) => {
    setSelectedCoordinator(null)
    setSelectedResearcher(null)
    setSelectedReport(report)
  }

  return <div className="governance-shell v3-shell">
    <GovernanceHeader profile={profile} subtitle="Diretoria · Instituto Foton"/>
    <div className="governance-layout">
      <aside className="governance-nav director-v5-nav">
        <div><span className="eyebrow">Gestão Geral</span><strong>Diretoria</strong></div>
        {([
          ['overview','Visão Geral'],
          ['laboratories','Laboratórios'],
          ['coordinators','Coordenadores'],
          ['researchers','Pesquisadores'],
          ['researcherReports','Relatos — Pesquisadores'],
          ['coordinatorReports','Relatos — Coordenadores'],
          ['requests','Solicitações de acesso']
        ] as [DirectorTab,string][]).map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}{key==='requests'&&requests.some(r=>r.status==='pending')?<i>{requests.filter(r=>r.status==='pending').length}</i>:null}</button>)}
      </aside>

      <main className="governance-content">
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}

        {tab==='overview' && <>
          <section className="governance-hero">
            <span className="eyebrow">Diretoria — ResearchFlow</span>
            <h2>Gestão da estrutura de pesquisa</h2>
            <p>Navegue pelos laboratórios, coordenadores, pesquisadores e relatos. O conteúdo científico permanece em modo somente leitura.</p>
          </section>
          <section className="governance-stats four">
            <div><strong>{labs.filter(l=>l.active).length}</strong><span>Laboratórios</span></div>
            <div><strong>{coordinators.filter(c=>c.status==='active').length}</strong><span>Coordenadores ativos</span></div>
            <div><strong>{researchers.filter(r=>r.status==='active').length}</strong><span>Pesquisadores ativos</span></div>
            <div><strong>{reports.length}</strong><span>Relatos visíveis</span></div>
          </section>
          <section className="governance-panel">
            <div className="panel-heading"><div><span className="eyebrow">Estrutura atual</span><h3>Laboratórios</h3></div><button className="primary-button" onClick={()=>setCreateOpen(true)}>+ Criar laboratório</button></div>
            <div className="project-grid">{labs.map(l=><LaboratoryCard key={l.id} lab={l} coordinator={coordinatorForLab(l.id,members)} stats={laboratoryStats(l)} onOpen={()=>{setSelectedLabId(l.id);setTab('laboratories')}}/>)}</div>
          </section>
          <div className="director-recent-grid">
            <RecentReports title="Últimos relatos de pesquisadores" reports={researcherReports.slice(0,5)} onOpen={setSelectedReport}/>
            <RecentReports title="Últimos relatos de coordenadores" reports={coordinatorReports.slice(0,5)} onOpen={setSelectedReport}/>
          </div>
        </>}

        {tab==='laboratories' && <section className="governance-panel">
          <div className="panel-heading"><div><span className="eyebrow">Estrutura</span><h2>Laboratórios</h2></div><button className="primary-button" onClick={()=>setCreateOpen(true)}>+ Criar laboratório</button></div>
          <div className="project-grid">{labs.map(l=><LaboratoryCard key={l.id} lab={l} coordinator={coordinatorForLab(l.id,members)} stats={laboratoryStats(l)} active={selectedLabId===l.id} onOpen={()=>setSelectedLabId(l.id)}/>)}</div>
          {selectedLab && <LaboratoryDetail
            lab={selectedLab}
            coordinator={selectedLabCoordinator}
            researchers={selectedLabResearchers}
            reports={selectedLabReports}
            coordinators={coordinators}
            onEdit={()=>setEditLab(selectedLab)}
            onAssign={async(id)=>{try{await governanceService.assignCoordinator(selectedLab.id,id);flash('Coordenador atualizado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar coordenador.')}}}
            onOpenReport={setSelectedReport}
          />}
        </section>}

        {tab==='coordinators' && <section className="governance-panel">
          <div className="panel-heading"><div><span className="eyebrow">Pessoas</span><h2>Coordenadores</h2></div></div>
          <div className="data-table">
            <div className="table-head director-coordinator-cols"><span>Nome</span><span>E-mail</span><span>Laboratório</span><span>Status</span><span>Ações</span></div>
            {coordinators.map(c=><div className="table-row director-coordinator-cols" key={c.id}>
              <button className="link-button" onClick={()=>setSelectedCoordinator(c)}>{c.full_name||'—'}</button><span>{c.email}</span><span>{labName(c.laboratory_id,labs)}</span><StatusPill status={c.status}/>
              <div className="row-actions">
                <button onClick={()=>setSelectedCoordinator(c)}>Abrir</button>
                <select value={c.laboratory_id||''} onChange={async(e)=>{if(!e.target.value)return;try{await governanceService.assignCoordinator(e.target.value,c.id);flash('Laboratório do coordenador atualizado.');await load()}catch(err){setError(err instanceof Error?err.message:'Falha na atribuição.')}}}><option value="">Definir laboratório…</option>{labs.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select>
                <button onClick={async()=>{const next = c.status==='active' ? 'suspended' : 'active';try{await governanceService.updateMembershipStatus(c.id,next);await load()}catch(err){setError(err instanceof Error?err.message:'Falha ao mudar status.')}}}>{c.status==='active'?'Desativar':'Ativar'}</button>
              </div>
            </div>)}
          </div>
          {!coordinators.length&&<div className="empty-state"><strong>Nenhum coordenador encontrado.</strong><span>Os coordenadores ativos aparecerão aqui.</span></div>}
        </section>}

        {tab==='researchers' && <section className="governance-panel">
          <div className="panel-heading"><div><span className="eyebrow">Pessoas</span><h2>Pesquisadores</h2></div></div>
          <div className="data-table">
            <div className="table-head director-researcher-cols"><span>Pesquisador</span><span>E-mail</span><span>Laboratório</span><span>Coordenador</span><span>Último relato</span><span>Status</span><span>Ações</span></div>
            {researchers.map(r=>{const latest=researcherReports.find(x=>x.user_id===r.auth_user_id);const coord=r.laboratory_id?coordinatorForLab(r.laboratory_id,members):undefined;return <div className="table-row director-researcher-cols" key={r.id}><button className="link-button" onClick={()=>setSelectedResearcher(r)}>{r.full_name||'—'}</button><span>{r.email}</span><span>{labName(r.laboratory_id,labs)}</span><span>{coord?.full_name||'—'}</span><span>{latest?new Date(latest.created_at).toLocaleString('pt-BR'):'Sem relatos'}</span><StatusPill status={r.status}/><button className="table-open" onClick={()=>setSelectedResearcher(r)}>Abrir</button></div>})}
          </div>
          {!researchers.length&&<div className="empty-state"><strong>Nenhum pesquisador encontrado.</strong><span>Pesquisadores vinculados aos laboratórios aparecerão aqui.</span></div>}
        </section>}

        {tab==='researcherReports' && <DirectorReportsPage kind="researcher" reports={researcherReports} members={members} labs={labs} onOpen={setSelectedReport}/>} 
        {tab==='coordinatorReports' && <DirectorReportsPage kind="coordinator" reports={coordinatorReports} members={members} labs={labs} onOpen={setSelectedReport}/>} 

        {tab==='requests' && <section className="governance-panel">
          <div className="panel-heading"><div><span className="eyebrow">Acesso</span><h2>Solicitações de acesso</h2></div></div>
          <div className="simple-list">{requests.length ? requests.map(r=><div key={r.id} className="request-admin-row"><div><strong>{r.full_name||r.email}</strong><span>{r.email} · {new Date(r.requested_at).toLocaleString('pt-BR')}</span>{r.message&&<small>{r.message}</small>}</div><div><StatusPill status={r.status}/>{r.status==='pending'&&<><button onClick={()=>setRequestToReview(r)}>Aprovar</button><button onClick={async()=>{try{await accessService.rejectAccessRequest(r.id);await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao rejeitar.')}}}>Rejeitar</button></>}</div></div>) : <p className="muted">Nenhuma solicitação registrada.</p>}</div>
        </section>}
      </main>
    </div>

    {selectedReport && <ReportDrawer report={selectedReport} onClose={()=>setSelectedReport(null)}/>} 
    {selectedCoordinator && <CoordinatorDetailModal coordinator={selectedCoordinator} lab={labs.find(l=>l.id===selectedCoordinator.laboratory_id)||null} researchers={researchers.filter(r=>r.laboratory_id===selectedCoordinator.laboratory_id)} reports={reports} onClose={()=>setSelectedCoordinator(null)} onOpenReport={openReportFromModal}/>} 
    {selectedResearcher && <ResearcherDetailModal researcher={selectedResearcher} lab={labs.find(l=>l.id===selectedResearcher.laboratory_id)||null} coordinator={selectedResearcher.laboratory_id?coordinatorForLab(selectedResearcher.laboratory_id,members):undefined} reports={researcherReports.filter(r=>r.user_id===selectedResearcher.auth_user_id)} onClose={()=>setSelectedResearcher(null)} onOpenReport={openReportFromModal}/>} 
    {createOpen && <CreateLaboratoryModal coordinators={coordinators} onClose={()=>setCreateOpen(false)} onSave={async(input)=>{try{await governanceService.createLaboratory(input);setCreateOpen(false);flash('Laboratório criado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao criar laboratório.')}}}/>} 
    {editLab && <EditLaboratoryModal lab={editLab} onClose={()=>setEditLab(null)} onSave={async(input)=>{try{await governanceService.updateLaboratory(input);setEditLab(null);flash('Laboratório atualizado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar laboratório.')}}}/>} 
    {requestToReview && <ApproveRequestModal request={requestToReview} labs={labs} onClose={()=>setRequestToReview(null)} onApprove={async(role,labId)=>{try{await accessService.approveAccessRequest(requestToReview.id,role,labId);setRequestToReview(null);flash('Acesso aprovado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao aprovar acesso.')}}}/>} 
  </div>
}

function RecentReports({ title, reports, onOpen }: { title:string; reports:GovernanceReport[]; onOpen:(r:GovernanceReport)=>void }) {
  return <section className="governance-panel director-recent-panel"><div className="panel-heading"><div><span className="eyebrow">Atividade recente</span><h3>{title}</h3></div></div><div className="simple-list compact-list">{reports.length?reports.map(r=><button className="report-access-row" key={r.id} onClick={()=>onOpen(r)}><div><strong>{r.researcher_name}</strong><span>{r.tag} · {formatDate(r.created_at)} {formatTime(r.created_at)}</span></div><small>{formatDuration(r.duration_seconds)}</small></button>):<p className="muted">Nenhum relato registrado.</p>}</div></section>
}

function LaboratoryCard({ lab, coordinator, stats, active, onOpen }: {
  lab: GovernanceLaboratory
  coordinator?: GovernanceMembership
  stats: {researchers:number;reports:number;last?:string}
  active?:boolean
  onOpen:()=>void
}) {
  return <button className={`project-card ${active?'active':''}`} onClick={onOpen}>
    <div className="project-card-top"><span className="project-icon">L</span><StatusPill status={lab.active?'active':'suspended'}/></div>
    <h3>{lab.name}</h3><p>{lab.description||'Laboratório de pesquisa.'}</p>
    <dl><div><dt>Coordenador</dt><dd>{coordinator?.full_name||'Não definido'}</dd></div><div><dt>Pesquisadores</dt><dd>{stats.researchers}</dd></div><div><dt>Relatos</dt><dd>{stats.reports}</dd></div><div><dt>Última atividade</dt><dd>{stats.last?new Date(stats.last).toLocaleDateString('pt-BR'):'—'}</dd></div></dl>
  </button>
}

function LaboratoryDetail({ lab, coordinator, researchers, reports, coordinators, onEdit, onAssign, onOpenReport }: {
  lab: GovernanceLaboratory
  coordinator?: GovernanceMembership
  researchers: GovernanceMembership[]
  reports: GovernanceReport[]
  coordinators: GovernanceMembership[]
  onEdit:()=>void
  onAssign:(id:string)=>Promise<void>
  onOpenReport:(r:GovernanceReport)=>void
}) {
  const [coordId,setCoordId]=useState(coordinator?.id||'')
  useEffect(()=>setCoordId(coordinator?.id||''),[coordinator?.id])

  return <div className="project-detail">
    <div className="panel-heading"><div><span className="readonly-badge">Visualização da Diretoria — conteúdo científico somente leitura</span><h2>{lab.name}</h2><p>{lab.description||'Sem descrição.'}</p></div><button className="secondary-button" onClick={onEdit}>Editar laboratório</button></div>
    <div className="project-detail-grid">
      <div><span>Coordenador</span><strong>{coordinator?.full_name||'Não definido'}</strong><small>{coordinator?.email||''}</small><div className="inline-control"><select value={coordId} onChange={e=>setCoordId(e.target.value)}><option value="">Selecione…</option>{coordinators.map(c=><option value={c.id} key={c.id}>{c.full_name||c.email}</option>)}</select><button disabled={!coordId} onClick={()=>void onAssign(coordId)}>Alterar coordenador</button></div></div>
      <div><span>Pesquisadores</span><strong>{researchers.length}</strong><small>{researchers.filter(r=>r.status==='active').length} ativos</small></div>
      <div><span>Relatos do laboratório</span><strong>{reports.length}</strong><small>Pesquisadores + coordenador</small></div>
    </div>
    <h3>Pesquisadores</h3><div className="simple-list compact-list">{researchers.length?researchers.map(r=><div key={r.id}><div><strong>{r.full_name||r.email}</strong><span>{r.email}</span></div><StatusPill status={r.status}/></div>):<p className="muted">Nenhum pesquisador vinculado.</p>}</div>
    <h3>Relatos do laboratório</h3><div className="simple-list compact-list">{reports.length?reports.slice(0,30).map(r=><button className="report-access-row" key={r.id} onClick={()=>onOpenReport(r)}><div><strong>{r.tag}</strong><span>{r.researcher_name} · {r.report_type==='coordinator'?'Coordenador':'Pesquisador'} · {formatDate(r.created_at)} {formatTime(r.created_at)}</span></div><small>{formatDuration(r.duration_seconds)}</small></button>):<p className="muted">Nenhum relato registrado.</p>}</div>
  </div>
}

function CoordinatorDetailModal({ coordinator, lab, researchers, reports, onClose, onOpenReport }: {
  coordinator: GovernanceMembership
  lab: GovernanceLaboratory | null
  researchers: GovernanceMembership[]
  reports: GovernanceReport[]
  onClose:()=>void
  onOpenReport:(r:GovernanceReport)=>void
}) {
  const researcherIds = new Set(researchers.map(r=>r.auth_user_id).filter((id):id is string=>Boolean(id)))
  const ownReports = reports.filter(r=>r.report_type==='coordinator'&&r.user_id===coordinator.auth_user_id)
  const labResearcherReports = reports.filter(r=>r.report_type==='researcher'&&researcherIds.has(r.user_id))
  return <GovernanceModal title="Coordenador" onClose={onClose}><div className="director-detail-stack">
    <div className="identity-chip"><strong>{coordinator.full_name||coordinator.email}</strong><span>{coordinator.email}</span></div>
    <div className="director-detail-grid"><div><span>Laboratório</span><strong>{lab?.name||'Sem laboratório'}</strong></div><div><span>Status</span><StatusPill status={coordinator.status}/></div><div><span>Pesquisadores</span><strong>{researchers.length}</strong></div><div><span>Relatos próprios</span><strong>{ownReports.length}</strong></div></div>
    <h3>Pesquisadores do laboratório</h3><div className="simple-list compact-list">{researchers.length?researchers.map(r=><div key={r.id}><div><strong>{r.full_name||r.email}</strong><span>{r.email}</span></div><StatusPill status={r.status}/></div>):<p className="muted">Nenhum pesquisador vinculado.</p>}</div>
    <h3>Relatos do coordenador</h3><div className="simple-list compact-list">{ownReports.length?ownReports.map(r=><button className="report-access-row" key={r.id} onClick={()=>onOpenReport(r)}><div><strong>{r.tag}</strong><span>{formatDate(r.created_at)} {formatTime(r.created_at)}</span></div><small>{formatDuration(r.duration_seconds)}</small></button>):<p className="muted">Nenhum relato do coordenador.</p>}</div>
    <h3>Relatos dos pesquisadores</h3><div className="simple-list compact-list">{labResearcherReports.length?labResearcherReports.slice(0,20).map(r=><button className="report-access-row" key={r.id} onClick={()=>onOpenReport(r)}><div><strong>{r.researcher_name}</strong><span>{r.tag} · {formatDate(r.created_at)}</span></div><small>{formatDuration(r.duration_seconds)}</small></button>):<p className="muted">Nenhum relato de pesquisador.</p>}</div>
  </div></GovernanceModal>
}

function ResearcherDetailModal({ researcher, lab, coordinator, reports, onClose, onOpenReport }: {
  researcher: GovernanceMembership
  lab: GovernanceLaboratory | null
  coordinator?: GovernanceMembership
  reports: GovernanceReport[]
  onClose:()=>void
  onOpenReport:(r:GovernanceReport)=>void
}) {
  const latest = reports[0]
  return <GovernanceModal title="Pesquisador" onClose={onClose}><div className="director-detail-stack">
    <div className="identity-chip"><strong>{researcher.full_name||researcher.email}</strong><span>{researcher.email}</span></div>
    <div className="director-detail-grid"><div><span>Laboratório</span><strong>{lab?.name||'Sem laboratório'}</strong></div><div><span>Coordenador</span><strong>{coordinator?.full_name||'Não definido'}</strong></div><div><span>Status</span><StatusPill status={researcher.status}/></div><div><span>Total de relatos</span><strong>{reports.length}</strong></div><div><span>Último relato</span><strong>{latest?new Date(latest.created_at).toLocaleString('pt-BR'):'Sem relatos'}</strong></div></div>
    <h3>Biblioteca pessoal</h3><div className="simple-list compact-list">{reports.length?reports.map(r=><button className="report-access-row" key={r.id} onClick={()=>onOpenReport(r)}><div><strong>{r.tag}</strong><span>{formatDate(r.created_at)} {formatTime(r.created_at)}</span></div><small>{formatDuration(r.duration_seconds)}</small></button>):<p className="muted">Nenhum relato registrado.</p>}</div>
  </div></GovernanceModal>
}

function DirectorReportsPage({ kind, reports, members, labs, onOpen }: {
  kind:'researcher'|'coordinator'
  reports:GovernanceReport[]
  members:GovernanceMembership[]
  labs:GovernanceLaboratory[]
  onOpen:(r:GovernanceReport)=>void
}) {
  const [query,setQuery]=useState('')
  const [author,setAuthor]=useState('')
  const [laboratory,setLaboratory]=useState('')
  const [coordinator,setCoordinator]=useState('')
  const [period,setPeriod]=useState<PeriodFilter>('all')
  const [sort,setSort]=useState<'newest'|'oldest'>('newest')

  const authors = members.filter(m=>m.role===(kind==='researcher'?'researcher':'lab_coordinator'))
  const coordinators = members.filter(m=>m.role==='lab_coordinator')
  const filtered = useMemo(()=>{
    const now = new Date()
    const needle = query.trim().toLowerCase()
    return [...reports].filter(report=>{
      const owner = memberForReport(report,members)
      const date = new Date(report.created_at)
      const coord = owner?.laboratory_id ? coordinatorForLab(owner.laboratory_id,members) : undefined
      const searchOk = !needle || report.tag.toLowerCase().includes(needle) || report.researcher_name.toLowerCase().includes(needle) || (report.transcript||'').toLowerCase().includes(needle)
      const authorOk = !author || owner?.id===author
      const labOk = !laboratory || owner?.laboratory_id===laboratory
      const coordinatorOk = kind==='coordinator' || !coordinator || coord?.id===coordinator
      let periodOk = true
      if(period==='today') periodOk=date.toDateString()===now.toDateString()
      if(period==='week') { const weekAgo=new Date(now); weekAgo.setDate(now.getDate()-7); periodOk=date>=weekAgo }
      if(period==='month') periodOk=date.getMonth()===now.getMonth()&&date.getFullYear()===now.getFullYear()
      return searchOk&&authorOk&&labOk&&coordinatorOk&&periodOk
    }).sort((a,b)=>sort==='newest'?b.created_at.localeCompare(a.created_at):a.created_at.localeCompare(b.created_at))
  },[reports,members,query,author,laboratory,coordinator,period,sort,kind])

  return <section className="governance-panel report-library">
    <div className="panel-heading"><div><span className="eyebrow">Diretoria</span><h2>{kind==='researcher'?'Relatos dos Pesquisadores':'Relatos dos Coordenadores'}</h2></div><span className="library-count">{filtered.length} relato(s)</span></div>
    <div className="report-filters director-report-filters">
      <label className="search-field">Busca<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Autor, tag ou transcrição"/></label>
      <label>{kind==='researcher'?'Pesquisador':'Coordenador'}<select value={author} onChange={e=>setAuthor(e.target.value)}><option value="">Todos</option>{authors.map(m=><option key={m.id} value={m.id}>{m.full_name||m.email}</option>)}</select></label>
      <label>Laboratório<select value={laboratory} onChange={e=>setLaboratory(e.target.value)}><option value="">Todos</option>{labs.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
      {kind==='researcher'&&<label>Coordenador<select value={coordinator} onChange={e=>setCoordinator(e.target.value)}><option value="">Todos</option>{coordinators.map(c=><option key={c.id} value={c.id}>{c.full_name||c.email}</option>)}</select></label>}
      <label>Período<select value={period} onChange={e=>setPeriod(e.target.value as PeriodFilter)}><option value="all">Todos</option><option value="today">Hoje</option><option value="week">Últimos 7 dias</option><option value="month">Este mês</option></select></label>
      <label>Ordenação<select value={sort} onChange={e=>setSort(e.target.value as 'newest'|'oldest')}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option></select></label>
    </div>
    <div className="data-table">
      {kind==='researcher' ? <>
        <div className="table-head director-researcher-report-cols"><span>Tag</span><span>Pesquisador</span><span>Laboratório</span><span>Coordenador</span><span>Data</span><span>Horário</span><span>Duração</span><span>Status</span><span>Ações</span></div>
        {filtered.map(r=>{const owner=memberForReport(r,members);const coord=owner?.laboratory_id?coordinatorForLab(owner.laboratory_id,members):undefined;return <div className="table-row director-researcher-report-cols" key={r.id}><strong>{r.tag}</strong><span>{owner?.full_name||r.researcher_name}</span><span>{labName(owner?.laboratory_id||null,labs)}</span><span>{coord?.full_name||'—'}</span><span>{formatDate(r.recording_date||r.created_at)}</span><span>{formatTime(r.recording_date||r.created_at)}</span><span>{formatDuration(r.duration_seconds)}</span><StatusPill status={r.status}/><button className="table-open" onClick={()=>onOpen(r)}>Abrir</button></div>})}
      </> : <>
        <div className="table-head director-coordinator-report-cols"><span>Tag</span><span>Coordenador</span><span>Laboratório</span><span>Data</span><span>Horário</span><span>Duração</span><span>Status</span><span>Ações</span></div>
        {filtered.map(r=>{const owner=memberForReport(r,members);return <div className="table-row director-coordinator-report-cols" key={r.id}><strong>{r.tag}</strong><span>{owner?.full_name||r.researcher_name}</span><span>{labName(owner?.laboratory_id||null,labs)}</span><span>{formatDate(r.recording_date||r.created_at)}</span><span>{formatTime(r.recording_date||r.created_at)}</span><span>{formatDuration(r.duration_seconds)}</span><StatusPill status={r.status}/><button className="table-open" onClick={()=>onOpen(r)}>Abrir</button></div>})}
      </>}
    </div>
    {!filtered.length&&<div className="empty-state"><strong>Nenhum relato encontrado.</strong><span>Ajuste os filtros ou aguarde novos envios.</span></div>}
  </section>
}

function CreateLaboratoryModal({ coordinators, onClose, onSave }: {
  coordinators: GovernanceMembership[]
  onClose:()=>void
  onSave:(input:{name:string;description?:string;coordinatorMembershipId?:string;active:boolean})=>Promise<void>
}) {
  const [name,setName]=useState('')
  const [description,setDescription]=useState('')
  const [coordinator,setCoordinator]=useState('')
  const [active,setActive]=useState(true)
  const [busy,setBusy]=useState(false)

  return <GovernanceModal title="Criar laboratório" onClose={onClose}><div className="modal-form">
    <label>Nome<input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome do laboratório"/></label>
    <label>Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Opcional"/></label>
    <label>Coordenador<select value={coordinator} onChange={e=>setCoordinator(e.target.value)}><option value="">Definir depois</option>{coordinators.filter(c=>c.status==='active').map(c=><option value={c.id} key={c.id}>{c.full_name||c.email} — {c.email}</option>)}</select></label>
    <label>Status<select value={active?'active':'archived'} onChange={e=>setActive(e.target.value==='active')}><option value="active">Ativo</option><option value="archived">Arquivado</option></select></label>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!name.trim()||busy} onClick={async()=>{setBusy(true);try{await onSave({name,description,coordinatorMembershipId:coordinator||undefined,active})}finally{setBusy(false)}}}>{busy?'Criando…':'Criar laboratório'}</button></div>
  </div></GovernanceModal>
}

function EditLaboratoryModal({ lab, onClose, onSave }: {
  lab: GovernanceLaboratory
  onClose:()=>void
  onSave:(input:{id:string;name:string;description?:string;active:boolean})=>Promise<void>
}) {
  const [name,setName]=useState(lab.name)
  const [description,setDescription]=useState(lab.description||'')
  const [active,setActive]=useState(lab.active)
  const [busy,setBusy]=useState(false)

  return <GovernanceModal title="Editar laboratório" onClose={onClose}><div className="modal-form">
    <label>Nome<input value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <label>Status<select value={active?'active':'archived'} onChange={e=>setActive(e.target.value==='active')}><option value="active">Ativo</option><option value="archived">Arquivado</option></select></label>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!name.trim()||busy} onClick={async()=>{setBusy(true);try{await onSave({id:lab.id,name,description,active})}finally{setBusy(false)}}}>{busy?'Salvando…':'Salvar alterações'}</button></div>
  </div></GovernanceModal>
}

function ApproveRequestModal({ request, labs, onClose, onApprove }: {
  request: AccessRequest
  labs: GovernanceLaboratory[]
  onClose:()=>void
  onApprove:(role:ResearchFlowRole,labId?:string)=>Promise<void>
}) {
  const [role,setRole]=useState<ResearchFlowRole>('researcher')
  const [lab,setLab]=useState(labs[0]?.id||'')
  const [busy,setBusy]=useState(false)

  return <GovernanceModal title="Aprovar solicitação" onClose={onClose}><div className="modal-form">
    <div className="identity-chip"><strong>{request.full_name||request.email}</strong><span>{request.email}</span></div>
    <label>Papel<select value={role} onChange={e=>setRole(e.target.value as ResearchFlowRole)}><option value="researcher">Pesquisador</option><option value="lab_coordinator">Coordenador de Laboratório</option><option value="director">Diretor</option></select></label>
    {role!=='director'&&<label>Laboratório<select value={lab} onChange={e=>setLab(e.target.value)}>{labs.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select></label>}
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy||(role!=='director'&&!lab)} onClick={async()=>{setBusy(true);try{await onApprove(role,role==='director'?undefined:lab)}finally{setBusy(false)}}}>{busy?'Aprovando…':'Aprovar acesso'}</button></div>
  </div></GovernanceModal>
}
