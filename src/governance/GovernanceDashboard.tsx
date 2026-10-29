import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  AccessRequest,
  GovernanceLaboratory,
  GovernanceMembership,
  GovernanceReport,
  MembershipStatus,
  ResearchFlowRole,
  ResearchFlowUser
} from '../models/ResearchFlowUser'
import { authService } from '../services/supabase'
import { accessService } from '../auth/accessService'
import { formatDate, formatDuration, formatTime } from '../utils/report'
import { governanceService } from './governanceService'

type DirectorTab = 'overview' | 'projects' | 'coordinators' | 'researchers' | 'reports' | 'requests'
type CoordinatorTab = 'overview' | 'researchers' | 'reports'
type PeriodFilter = 'all' | 'today' | 'week' | 'month' | 'custom'

const statusText: Record<MembershipStatus, string> = {
  invited: 'Convidado',
  active: 'Ativo',
  suspended: 'Suspenso',
  revoked: 'Removido'
}

function Header({ profile, subtitle }: { profile: ResearchFlowUser; subtitle: string }) {
  return <header className="topbar governance-v3-topbar">
    <div className="brand-mark">RF</div>
    <div className="governance-brand"><h1>ResearchFlow</h1><p>{subtitle}</p></div>
    <div className="user-area">
      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="Foto do perfil" referrerPolicy="no-referrer"/> : <div className="avatar-fallback">{profile.fullName.slice(0,1)}</div>}
      <div className="user-copy"><strong>{profile.fullName}</strong><span>{profile.email}</span></div>
      <button className="secondary-button compact-action" onClick={() => void authService.signOut()}>Sair</button>
    </div>
  </header>
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose() }}>
    <div className="governance-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-title"><div><span className="eyebrow">ResearchFlow</span><h2>{title}</h2></div><button className="drawer-close" onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>
}

function StatusPill({ status }: { status: MembershipStatus | 'saved' | 'archived' | 'deleted' | 'pending' | 'approved' | 'rejected' | 'cancelled' }) {
  const label = status in statusText ? statusText[status as MembershipStatus] : status === 'saved' ? 'Salvo' : status === 'archived' ? 'Arquivado' : status === 'deleted' ? 'Removido pelo pesquisador' : status
  return <span className={`status-pill ${status}`}>{label}</span>
}

function ReportDrawer({ report, onClose }: { report: GovernanceReport; onClose: () => void }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioError, setAudioError] = useState('')
  useEffect(() => {
    setAudioUrl(null); setAudioError('')
    if (!report.audio_path) return
    void governanceService.createSignedAudioUrl(report.audio_path)
      .then(setAudioUrl)
      .catch(()=>setAudioError('Não foi possível abrir o áudio autorizado.'))
  }, [report.id, report.audio_path])

  return <div className="governance-drawer v3-drawer">
    <button className="drawer-close" onClick={onClose}>×</button>
    <span className="readonly-badge">Somente leitura</span>
    <span className="eyebrow">Relato de pesquisa</span>
    <h2>{report.tag}</h2>
    <div className="report-meta-grid">
      <div><span>Pesquisador</span><strong>{report.researcher_name}</strong></div>
      <div><span>Data</span><strong>{formatDate(report.recording_date || report.created_at)}</strong></div>
      <div><span>Horário</span><strong>{formatTime(report.recording_date || report.created_at)}</strong></div>
      <div><span>Duração</span><strong>{formatDuration(report.duration_seconds)}</strong></div>
    </div>
    <h3>Áudio</h3>
    {audioUrl ? <audio className="governance-audio" controls src={audioUrl}/> : <p className="muted">{audioError || (report.audio_path ? 'Carregando áudio…' : 'Áudio indisponível.')}</p>}
    <h3>Transcrição</h3>
    <div className="transcript-readonly">{report.transcript || 'Sem transcrição.'}</div>
    <div className="drawer-status"><StatusPill status={report.status}/>{report.deleted_by_researcher && <span className="muted">Oculto da biblioteca pessoal pelo pesquisador.</span>}</div>
  </div>
}

const labName = (labId: string | null, labs: GovernanceLaboratory[]) => labs.find(l=>l.id===labId)?.name || 'Sem projeto'
const coordinatorForLab = (labId: string, members: GovernanceMembership[]) => members.find(m=>m.role==='lab_coordinator' && m.laboratory_id===labId && m.status==='active')
const researcherForUser = (userId: string, members: GovernanceMembership[]) => members.find(m=>m.role==='researcher' && m.auth_user_id===userId)

function DirectorDashboard({ profile }: { profile: ResearchFlowUser }) {
  const [tab, setTab] = useState<DirectorTab>('overview')
  const [labs, setLabs] = useState<GovernanceLaboratory[]>([])
  const [members, setMembers] = useState<GovernanceMembership[]>([])
  const [reports, setReports] = useState<GovernanceReport[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<GovernanceReport | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editLab, setEditLab] = useState<GovernanceLaboratory | null>(null)
  const [requestToReview, setRequestToReview] = useState<AccessRequest | null>(null)

  const load = async () => {
    setError('')
    try {
      const [nextLabs,nextMembers,nextReports,nextRequests] = await Promise.all([
        governanceService.listLaboratories(), governanceService.listMemberships(), governanceService.listReports(), accessService.listAccessRequests()
      ])
      setLabs(nextLabs); setMembers(nextMembers); setReports(nextReports); setRequests(nextRequests)
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar a visão da Diretoria.') }
  }
  useEffect(()=>{ void load() }, [profile.membershipId])

  const researchers = useMemo(()=>members.filter(m=>m.role==='researcher'),[members])
  const coordinators = useMemo(()=>members.filter(m=>m.role==='lab_coordinator'),[members])
  const selectedLab = labs.find(l=>l.id===selectedLabId) || null
  const selectedLabResearchers = researchers.filter(r=>r.laboratory_id===selectedLabId)
  const selectedLabReports = reports.filter(r=>selectedLabResearchers.some(m=>m.auth_user_id===r.user_id))

  const projectStats = (lab: GovernanceLaboratory) => {
    const labResearchers = researchers.filter(r=>r.laboratory_id===lab.id)
    const userIds = new Set(labResearchers.map(r=>r.auth_user_id).filter(Boolean))
    const labReports = reports.filter(r=>userIds.has(r.user_id))
    return { researchers: labResearchers.length, reports: labReports.length, last: labReports[0]?.created_at }
  }

  const flash = (text: string) => { setMessage(text); window.setTimeout(()=>setMessage(''),3500) }

  return <div className="governance-shell v3-shell">
    <Header profile={profile} subtitle="Diretoria · Instituto Foton"/>
    <div className="governance-layout">
      <aside className="governance-nav">
        <div><span className="eyebrow">Gestão Geral</span><strong>Diretoria</strong></div>
        {([
          ['overview','Visão Geral'],['projects','Projetos / Laboratórios'],['coordinators','Coordenadores'],['researchers','Pesquisadores'],['reports','Relatos'],['requests','Solicitações de acesso']
        ] as [DirectorTab,string][]).map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}{key==='requests' && requests.some(r=>r.status==='pending') ? <i>{requests.filter(r=>r.status==='pending').length}</i>:null}</button>)}
      </aside>
      <main className="governance-content">
        {error && <div className="error-banner">{error}</div>}
        {message && <div className="success-banner">{message}</div>}

        {tab==='overview' && <>
          <section className="governance-hero"><span className="eyebrow">Diretoria — ResearchFlow</span><h2>Gestão da estrutura de pesquisa</h2><p>Navegue de projetos e coordenadores até pesquisadores e seus relatos, mantendo o conteúdo científico em modo somente leitura.</p></section>
          <section className="governance-stats four"><div><strong>{labs.length}</strong><span>Projetos / Laboratórios</span></div><div><strong>{coordinators.filter(c=>c.status==='active').length}</strong><span>Coordenadores ativos</span></div><div><strong>{researchers.filter(r=>r.status==='active').length}</strong><span>Pesquisadores ativos</span></div><div><strong>{reports.length}</strong><span>Relatos visíveis</span></div></section>
          <section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Estrutura atual</span><h3>Projetos / Laboratórios</h3></div><button className="primary-button" onClick={()=>setCreateOpen(true)}>+ Criar novo projeto</button></div><div className="project-grid">{labs.map(l=><ProjectCard key={l.id} lab={l} coordinator={coordinatorForLab(l.id,members)} stats={projectStats(l)} onOpen={()=>{setSelectedLabId(l.id);setTab('projects')}}/>)}</div></section>
        </>}

        {tab==='projects' && <section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Estrutura</span><h2>Projetos / Laboratórios</h2></div><button className="primary-button" onClick={()=>setCreateOpen(true)}>+ Criar novo projeto</button></div>
          <div className="project-grid">{labs.map(l=><ProjectCard key={l.id} lab={l} coordinator={coordinatorForLab(l.id,members)} stats={projectStats(l)} active={selectedLabId===l.id} onOpen={()=>setSelectedLabId(l.id)}/>)}</div>
          {selectedLab && <ProjectDetail lab={selectedLab} coordinator={coordinatorForLab(selectedLab.id,members)} researchers={selectedLabResearchers} reports={selectedLabReports} coordinators={coordinators} onEdit={()=>setEditLab(selectedLab)} onAssign={async(id)=>{try{await governanceService.assignCoordinator(selectedLab.id,id);flash('Coordenador atualizado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar coordenador.')}}} onOpenReport={setSelectedReport}/>} 
        </section>}

        {tab==='coordinators' && <section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Pessoas</span><h2>Coordenadores</h2></div></div><div className="data-table"><div className="table-head coordinator-cols"><span>Nome</span><span>E-mail</span><span>Projeto / Laboratório</span><span>Status</span><span>Ações</span></div>{coordinators.map(c=><div className="table-row coordinator-cols" key={c.id}><strong>{c.full_name||'—'}</strong><span>{c.email}</span><span>{labName(c.laboratory_id,labs)}</span><StatusPill status={c.status}/><div className="row-actions"><select value={c.laboratory_id||''} onChange={async(e)=>{if(!e.target.value)return;try{await governanceService.assignCoordinator(e.target.value,c.id);flash('Laboratório do coordenador atualizado.');await load()}catch(err){setError(err instanceof Error?err.message:'Falha na atribuição.')}}}><option value="">Definir projeto…</option>{labs.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select><button onClick={async()=>{const next:c['status']=c.status==='active'?'suspended':'active';try{await governanceService.updateMembershipStatus(c.id,next);await load()}catch(err){setError(err instanceof Error?err.message:'Falha ao mudar status.')}}}>{c.status==='active'?'Desativar':'Ativar'}</button></div></div>)}</div></section>}

        {tab==='researchers' && <section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Pessoas</span><h2>Pesquisadores</h2></div></div><div className="data-table"><div className="table-head researcher-cols"><span>Pesquisador</span><span>E-mail</span><span>Projeto / Laboratório</span><span>Coordenador</span><span>Último relato</span><span>Status</span></div>{researchers.map(r=>{const latest=reports.find(x=>x.user_id===r.auth_user_id);const coord=r.laboratory_id?coordinatorForLab(r.laboratory_id,members):undefined;return <div className="table-row researcher-cols" key={r.id}><strong>{r.full_name||'—'}</strong><span>{r.email}</span><span>{labName(r.laboratory_id,labs)}</span><span>{coord?.full_name||'—'}</span><span>{latest?new Date(latest.created_at).toLocaleString('pt-BR'):'Sem relatos'}</span><StatusPill status={r.status}/></div>})}</div></section>}

        {tab==='reports' && <ReportLibrary reports={reports} members={members} onOpen={setSelectedReport} title="Relatos institucionais"/>}

        {tab==='requests' && <section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Acesso</span><h2>Solicitações de acesso</h2></div></div><div className="simple-list">{requests.length?requests.map(r=><div key={r.id} className="request-admin-row"><div><strong>{r.full_name||r.email}</strong><span>{r.email} · {new Date(r.requested_at).toLocaleString('pt-BR')}</span>{r.message&&<small>{r.message}</small>}</div><div><StatusPill status={r.status}/>{r.status==='pending'&&<><button onClick={()=>setRequestToReview(r)}>Aprovar</button><button onClick={async()=>{try{await accessService.rejectAccessRequest(r.id);await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao rejeitar.')}}}>Rejeitar</button></>}</div></div>):<p className="muted">Nenhuma solicitação registrada.</p>}</div></section>}
      </main>
    </div>
    {selectedReport && <ReportDrawer report={selectedReport} onClose={()=>setSelectedReport(null)}/>} 
    {createOpen && <CreateProjectModal coordinators={coordinators} onClose={()=>setCreateOpen(false)} onSave={async(input)=>{try{await governanceService.createLaboratory(input);setCreateOpen(false);flash('Projeto criado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao criar projeto.')}}}/>} 
    {editLab && <EditProjectModal lab={editLab} onClose={()=>setEditLab(null)} onSave={async(input)=>{try{await governanceService.updateLaboratory(input);setEditLab(null);flash('Projeto atualizado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar projeto.')}}}/>} 
    {requestToReview && <ApproveRequestModal request={requestToReview} labs={labs} onClose={()=>setRequestToReview(null)} onApprove={async(role,labId)=>{try{await accessService.approveAccessRequest(requestToReview.id,role,labId);setRequestToReview(null);flash('Acesso aprovado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao aprovar acesso.')}}}/>} 
  </div>
}

function ProjectCard({ lab, coordinator, stats, active, onOpen }: { lab: GovernanceLaboratory; coordinator?: GovernanceMembership; stats: {researchers:number;reports:number;last?:string}; active?:boolean; onOpen:()=>void }) {
  return <button className={`project-card ${active?'active':''}`} onClick={onOpen}><div className="project-card-top"><span className="project-icon">P</span><StatusPill status={lab.active?'active':'suspended'}/></div><h3>{lab.name}</h3><p>{lab.description||'Projeto / laboratório de pesquisa.'}</p><dl><div><dt>Coordenador</dt><dd>{coordinator?.full_name||'Não definido'}</dd></div><div><dt>Pesquisadores</dt><dd>{stats.researchers}</dd></div><div><dt>Relatos</dt><dd>{stats.reports}</dd></div><div><dt>Última atividade</dt><dd>{stats.last?new Date(stats.last).toLocaleDateString('pt-BR'):'—'}</dd></div></dl></button>
}

function ProjectDetail({ lab, coordinator, researchers, reports, coordinators, onEdit, onAssign, onOpenReport }: { lab: GovernanceLaboratory; coordinator?: GovernanceMembership; researchers: GovernanceMembership[]; reports: GovernanceReport[]; coordinators: GovernanceMembership[]; onEdit:()=>void; onAssign:(id:string)=>Promise<void>; onOpenReport:(r:GovernanceReport)=>void }) {
  const [coordId,setCoordId]=useState(coordinator?.id||'')
  useEffect(()=>setCoordId(coordinator?.id||''),[coordinator?.id])
  return <div className="project-detail"><div className="panel-heading"><div><span className="readonly-badge">Visualização da Diretoria — conteúdo científico somente leitura</span><h2>{lab.name}</h2><p>{lab.description||'Sem descrição.'}</p></div><button className="secondary-button" onClick={onEdit}>Editar projeto</button></div><div className="project-detail-grid"><div><span>Coordenador</span><strong>{coordinator?.full_name||'Não definido'}</strong><small>{coordinator?.email||''}</small><div className="inline-control"><select value={coordId} onChange={e=>setCoordId(e.target.value)}><option value="">Selecione…</option>{coordinators.map(c=><option value={c.id} key={c.id}>{c.full_name||c.email}</option>)}</select><button disabled={!coordId} onClick={()=>void onAssign(coordId)}>Alterar coordenador</button></div></div><div><span>Pesquisadores</span><strong>{researchers.length}</strong><small>{researchers.filter(r=>r.status==='active').length} ativos</small></div><div><span>Relatos</span><strong>{reports.length}</strong><small>Histórico autorizado</small></div></div><h3>Pesquisadores</h3><div className="simple-list compact-list">{researchers.map(r=><div key={r.id}><div><strong>{r.full_name||r.email}</strong><span>{r.email}</span></div><StatusPill status={r.status}/></div>)}</div><h3>Biblioteca do projeto</h3><div className="simple-list compact-list">{reports.slice(0,20).map(r=><button className="report-access-row" key={r.id} onClick={()=>onOpenReport(r)}><div><strong>{r.tag}</strong><span>{r.researcher_name} · {formatDate(r.created_at)} {formatTime(r.created_at)}</span></div><small>{formatDuration(r.duration_seconds)}</small></button>)}</div></div>
}

function CreateProjectModal({ coordinators, onClose, onSave }: { coordinators: GovernanceMembership[]; onClose:()=>void; onSave:(input:{name:string;description?:string;coordinatorMembershipId?:string;active:boolean})=>Promise<void> }) {
  const [name,setName]=useState('');const [description,setDescription]=useState('');const [coordinator,setCoordinator]=useState('');const [active,setActive]=useState(true);const [busy,setBusy]=useState(false)
  return <Modal title="Criar novo projeto" onClose={onClose}><div className="modal-form"><label>Nome<input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome do projeto / laboratório"/></label><label>Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Opcional"/></label><label>Coordenador<select value={coordinator} onChange={e=>setCoordinator(e.target.value)}><option value="">Definir depois</option>{coordinators.map(c=><option value={c.id} key={c.id}>{c.full_name||c.email} — {c.email}</option>)}</select></label><label>Status<select value={active?'active':'archived'} onChange={e=>setActive(e.target.value==='active')}><option value="active">Ativo</option><option value="archived">Arquivado</option></select></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!name.trim()||busy} onClick={async()=>{setBusy(true);await onSave({name,description,coordinatorMembershipId:coordinator||undefined,active});setBusy(false)}}>{busy?'Criando…':'Criar projeto'}</button></div></div></Modal>
}

function EditProjectModal({ lab, onClose, onSave }: { lab: GovernanceLaboratory; onClose:()=>void; onSave:(input:{id:string;name:string;description?:string;active:boolean})=>Promise<void> }) {
  const [name,setName]=useState(lab.name);const [description,setDescription]=useState(lab.description||'');const [active,setActive]=useState(lab.active);const [busy,setBusy]=useState(false)
  return <Modal title="Editar projeto" onClose={onClose}><div className="modal-form"><label>Nome<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><label>Status<select value={active?'active':'archived'} onChange={e=>setActive(e.target.value==='active')}><option value="active">Ativo</option><option value="archived">Arquivado</option></select></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!name.trim()||busy} onClick={async()=>{setBusy(true);await onSave({id:lab.id,name,description,active});setBusy(false)}}>{busy?'Salvando…':'Salvar alterações'}</button></div></div></Modal>
}

function ApproveRequestModal({ request, labs, onClose, onApprove }: { request: AccessRequest; labs: GovernanceLaboratory[]; onClose:()=>void; onApprove:(role:ResearchFlowRole,labId?:string)=>Promise<void> }) {
  const [role,setRole]=useState<ResearchFlowRole>('researcher');const [lab,setLab]=useState(labs[0]?.id||'');const [busy,setBusy]=useState(false)
  return <Modal title="Aprovar solicitação" onClose={onClose}><div className="modal-form"><div className="identity-chip"><strong>{request.full_name||request.email}</strong><span>{request.email}</span></div><label>Papel<select value={role} onChange={e=>setRole(e.target.value as ResearchFlowRole)}><option value="researcher">Pesquisador</option><option value="lab_coordinator">Coordenador de Laboratório</option><option value="director">Diretor</option></select></label>{role!=='director'&&<label>Projeto / Laboratório<select value={lab} onChange={e=>setLab(e.target.value)}>{labs.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select></label>}<div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy||(role!=='director'&&!lab)} onClick={async()=>{setBusy(true);await onApprove(role,role==='director'?undefined:lab);setBusy(false)}}>{busy?'Aprovando…':'Aprovar acesso'}</button></div></div></Modal>
}

function CoordinatorDashboard({ profile }: { profile: ResearchFlowUser }) {
  const [tab,setTab]=useState<CoordinatorTab>('overview')
  const [labs,setLabs]=useState<GovernanceLaboratory[]>([])
  const [members,setMembers]=useState<GovernanceMembership[]>([])
  const [reports,setReports]=useState<GovernanceReport[]>([])
  const [error,setError]=useState('');const [message,setMessage]=useState('')
  const [addOpen,setAddOpen]=useState(false);const [editResearcher,setEditResearcher]=useState<GovernanceMembership|null>(null);const [selectedReport,setSelectedReport]=useState<GovernanceReport|null>(null)

  const load=async()=>{setError('');try{const [l,m,r]=await Promise.all([governanceService.listLaboratories(),governanceService.listMemberships(),governanceService.listReports()]);setLabs(l);setMembers(m);setReports(r)}catch(e){setError(e instanceof Error?e.message:'Não foi possível carregar o laboratório.')}}
  useEffect(()=>{void load()},[profile.membershipId])
  const lab=labs.find(l=>l.id===profile.laboratoryId)||labs[0]
  const researchers=members.filter(m=>m.role==='researcher')
  const flash=(text:string)=>{setMessage(text);window.setTimeout(()=>setMessage(''),3500)}

  return <div className="governance-shell v3-shell"><Header profile={profile} subtitle={`${lab?.name||profile.laboratoryName||'Laboratório'} · Coordenador de Laboratório`}/><div className="governance-layout"><aside className="governance-nav"><div><span className="eyebrow">Laboratório</span><strong>{lab?.name||profile.laboratoryName||'Meu laboratório'}</strong></div>{([['overview','Visão Geral'],['researchers','Pesquisadores'],['reports','Biblioteca de Relatos']] as [CoordinatorTab,string][]).map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}</aside><main className="governance-content">{error&&<div className="error-banner">{error}</div>}{message&&<div className="success-banner">{message}</div>}
    {tab==='overview'&&<><section className="governance-hero"><span className="eyebrow">Coordenador de Laboratório</span><h2>{lab?.name||profile.laboratoryName}</h2><p>Você vê apenas os pesquisadores e os relatos associados a este laboratório. A autorização é aplicada pelo PostgreSQL/RLS.</p></section><section className="governance-stats"><div><strong>{researchers.filter(r=>r.status==='active').length}</strong><span>Pesquisadores ativos</span></div><div><strong>{reports.length}</strong><span>Relatos na biblioteca</span></div><div><strong>{reports.filter(r=>new Date(r.created_at).toDateString()===new Date().toDateString()).length}</strong><span>Enviados hoje</span></div></section><section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Acompanhamento</span><h3>Relatos recentes</h3></div></div><SubmissionQueue researchers={researchers} reports={reports}/></section></>}
    {tab==='researchers'&&<section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Equipe</span><h2>Pesquisadores</h2></div><button className="primary-button" onClick={()=>setAddOpen(true)}>+ Adicionar pesquisador</button></div><div className="researcher-cards">{researchers.map(r=><div className="researcher-card" key={r.id}><div className="researcher-avatar">{(r.full_name||r.email).slice(0,1)}</div><div><strong>{r.full_name||r.email}</strong><span>{r.email}</span><small>{lab?.name||profile.laboratoryName}</small></div><StatusPill status={r.status}/><div className="row-actions"><button onClick={()=>setEditResearcher(r)}>Editar</button><button className="danger-text" disabled={r.status==='revoked'} onClick={async()=>{if(!confirm(`Remover ${r.full_name||r.email} do laboratório? O histórico será preservado.`))return;try{await governanceService.removeResearcher(r.id);flash('Pesquisador removido; histórico preservado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao remover.')}}}>Remover</button></div></div>)}</div></section>}
    {tab==='reports'&&<ReportLibrary reports={reports} members={researchers} onOpen={setSelectedReport} title="Biblioteca de Relatos" coordinatorMode/>}
  </main></div>{selectedReport&&<ReportDrawer report={selectedReport} onClose={()=>setSelectedReport(null)}/>} {addOpen&&<AddResearcherModal laboratoryName={lab?.name||profile.laboratoryName||'Laboratório'} onClose={()=>setAddOpen(false)} onSave={async(input)=>{try{await governanceService.addResearcher(input);setAddOpen(false);flash('Pesquisador adicionado ao laboratório.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao adicionar pesquisador.')}}}/>} {editResearcher&&<EditResearcherModal researcher={editResearcher} laboratoryName={lab?.name||profile.laboratoryName||'Laboratório'} onClose={()=>setEditResearcher(null)} onSave={async(input)=>{try{await governanceService.updateResearcher(input);setEditResearcher(null);flash('Pesquisador atualizado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar pesquisador.')}}}/>}</div>
}

function SubmissionQueue({ researchers, reports }: { researchers: GovernanceMembership[]; reports: GovernanceReport[] }) {
  return <div className="submission-queue">{researchers.filter(r=>r.status==='active').map(r=>{const last=reports.find(x=>x.user_id===r.auth_user_id);return <div key={r.id}><div className="researcher-avatar small">{(r.full_name||r.email).slice(0,1)}</div><div><strong>{r.full_name||r.email}</strong><span>{last?`Último envio: ${new Date(last.created_at).toLocaleString('pt-BR')}`:'Ainda não enviou relatos'}</span></div>{last&&<span className="queue-tag">{last.tag}</span>}</div>})}</div>
}

function ReportLibrary({ reports, members, onOpen, title, coordinatorMode=false }: { reports: GovernanceReport[]; members: GovernanceMembership[]; onOpen:(r:GovernanceReport)=>void; title:string; coordinatorMode?:boolean }) {
  const [query,setQuery]=useState('');const [researcher,setResearcher]=useState('');const [period,setPeriod]=useState<PeriodFilter>('all');const [sort,setSort]=useState<'newest'|'oldest'>('newest');const [start,setStart]=useState('');const [end,setEnd]=useState('')
  const filtered=useMemo(()=>{const now=new Date();const needle=query.trim().toLowerCase();const startDate=start?new Date(`${start}T00:00:00`):null;const endDate=end?new Date(`${end}T23:59:59`):null;return [...reports].filter(r=>{const date=new Date(r.created_at);const owner=researcherForUser(r.user_id,members);const searchOk=!needle||r.tag.toLowerCase().includes(needle)||r.researcher_name.toLowerCase().includes(needle)||(r.transcript||'').toLowerCase().includes(needle);const researcherOk=!researcher||owner?.id===researcher;let periodOk=true;if(period==='today')periodOk=date.toDateString()===now.toDateString();if(period==='week'){const weekAgo=new Date(now);weekAgo.setDate(now.getDate()-7);periodOk=date>=weekAgo}if(period==='month')periodOk=date.getMonth()===now.getMonth()&&date.getFullYear()===now.getFullYear();if(period==='custom')periodOk=(!startDate||date>=startDate)&&(!endDate||date<=endDate);return searchOk&&researcherOk&&periodOk}).sort((a,b)=>sort==='newest'?b.created_at.localeCompare(a.created_at):a.created_at.localeCompare(b.created_at))},[reports,members,query,researcher,period,sort,start,end])
  return <section className="governance-panel report-library"><div className="panel-heading"><div><span className="eyebrow">{coordinatorMode?'Laboratório':'Diretoria'}</span><h2>{title}</h2></div><span className="library-count">{filtered.length} relato(s)</span></div><div className="report-filters"><label className="search-field">Buscar relatos<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisador, tag ou transcrição"/></label><label>Pesquisador<select value={researcher} onChange={e=>setResearcher(e.target.value)}><option value="">Todos</option>{members.filter(m=>m.role==='researcher').map(m=><option key={m.id} value={m.id}>{m.full_name||m.email}</option>)}</select></label><label>Período<select value={period} onChange={e=>setPeriod(e.target.value as PeriodFilter)}><option value="all">Todos</option><option value="today">Hoje</option><option value="week">Esta semana</option><option value="month">Este mês</option><option value="custom">Período personalizado</option></select></label><label>Ordenação<select value={sort} onChange={e=>setSort(e.target.value as 'newest'|'oldest')}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option></select></label>{period==='custom'&&<><label>De<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Até<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></>}</div><div className="data-table"><div className="table-head report-cols"><span>Tag</span><span>Pesquisador</span><span>Data</span><span>Horário</span><span>Duração</span><span>Status</span><span>Ações</span></div>{filtered.map(r=><div className="table-row report-cols" key={r.id}><strong>{r.tag}</strong><span>{r.researcher_name}</span><span>{formatDate(r.recording_date||r.created_at)}</span><span>{formatTime(r.recording_date||r.created_at)}</span><span>{formatDuration(r.duration_seconds)}</span><StatusPill status={r.status}/><button className="table-open" onClick={()=>onOpen(r)}>Abrir</button></div>)}</div>{!filtered.length&&<div className="empty-state"><strong>Nenhum relato encontrado.</strong><span>Ajuste os filtros ou aguarde novos envios.</span></div>}</section>
}

function AddResearcherModal({ laboratoryName, onClose, onSave }: { laboratoryName:string;onClose:()=>void;onSave:(input:{fullName:string;email:string;status:'active'|'invited'})=>Promise<void> }) {
  const [fullName,setFullName]=useState('');const [email,setEmail]=useState('');const [status,setStatus]=useState<'active'|'invited'>('active');const [busy,setBusy]=useState(false)
  return <Modal title="Adicionar pesquisador" onClose={onClose}><div className="modal-form"><label>Nome<input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nome do pesquisador"/></label><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="pesquisador@gmail.com"/></label><label>Laboratório<input value={laboratoryName} readOnly/></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value as 'active'|'invited')}><option value="active">Ativo</option><option value="invited">Convidado</option></select></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!email.trim()||busy} onClick={async()=>{setBusy(true);await onSave({fullName,email,status});setBusy(false)}}>{busy?'Adicionando…':'Adicionar pesquisador'}</button></div></div></Modal>
}

function EditResearcherModal({ researcher, laboratoryName, onClose, onSave }: { researcher:GovernanceMembership;laboratoryName:string;onClose:()=>void;onSave:(input:{membershipId:string;fullName:string;status:MembershipStatus})=>Promise<void> }) {
  const [fullName,setFullName]=useState(researcher.full_name||'');const [status,setStatus]=useState<MembershipStatus>(researcher.status);const [busy,setBusy]=useState(false)
  return <Modal title="Editar pesquisador" onClose={onClose}><div className="modal-form"><label>Nome<input value={fullName} onChange={e=>setFullName(e.target.value)}/></label><label>E-mail<input value={researcher.email} readOnly/></label><label>Laboratório<input value={laboratoryName} readOnly/></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value as MembershipStatus)}><option value="active">Ativo</option><option value="invited">Convidado</option><option value="suspended">Suspenso</option><option value="revoked">Removido</option></select></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} onClick={async()=>{setBusy(true);await onSave({membershipId:researcher.id,fullName,status});setBusy(false)}}>{busy?'Salvando…':'Salvar'}</button></div></div></Modal>
}

export { DirectorDashboard, CoordinatorDashboard }
