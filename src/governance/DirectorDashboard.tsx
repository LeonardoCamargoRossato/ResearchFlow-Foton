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
import { GovernanceHeader, GovernanceModal, ReportDrawer, ReportLibrary, StatusPill } from './GovernanceShared'

type DirectorTab = 'overview' | 'projects' | 'coordinators' | 'researchers' | 'reports' | 'requests'

const labName = (labId: string | null, labs: GovernanceLaboratory[]) => labs.find(l=>l.id===labId)?.name || 'Sem projeto'
const coordinatorForLab = (labId: string, members: GovernanceMembership[]) => members.find(m=>m.role==='lab_coordinator' && m.laboratory_id===labId && m.status==='active')

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
  const [createOpen, setCreateOpen] = useState(false)
  const [editLab, setEditLab] = useState<GovernanceLaboratory | null>(null)
  const [requestToReview, setRequestToReview] = useState<AccessRequest | null>(null)

  const load = async () => {
    setError('')
    try {
      const [nextLabs,nextMembers,nextReports,nextRequests] = await Promise.all([
        governanceService.listLaboratories(),
        governanceService.listMemberships(),
        governanceService.listReports(),
        accessService.listAccessRequests()
      ])
      setLabs(nextLabs)
      setMembers(nextMembers)
      setReports(nextReports)
      setRequests(nextRequests)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar a visão da Diretoria.')
    }
  }

  useEffect(()=>{ void load() }, [profile.membershipId])

  const researchers = useMemo(()=>members.filter(m=>m.role==='researcher'),[members])
  const coordinators = useMemo(()=>members.filter(m=>m.role==='lab_coordinator'),[members])
  const selectedLab = labs.find(l=>l.id===selectedLabId) || null
  const selectedLabResearchers = researchers.filter(r=>r.laboratory_id===selectedLabId)
  const selectedLabReports = reports.filter(r=>selectedLabResearchers.some(m=>m.auth_user_id===r.user_id))

  const projectStats = (lab: GovernanceLaboratory) => {
    const labResearchers = researchers.filter(r=>r.laboratory_id===lab.id)
    const userIds = new Set(labResearchers.map(r=>r.auth_user_id).filter((id): id is string => Boolean(id)))
    const labReports = reports.filter(r=>userIds.has(r.user_id))
    return { researchers: labResearchers.length, reports: labReports.length, last: labReports[0]?.created_at }
  }

  const flash = (text: string) => {
    setMessage(text)
    window.setTimeout(()=>setMessage(''),3500)
  }

  return <div className="governance-shell v3-shell">
    <GovernanceHeader profile={profile} subtitle="Diretoria · Instituto Foton"/>
    <div className="governance-layout">
      <aside className="governance-nav">
        <div><span className="eyebrow">Gestão Geral</span><strong>Diretoria</strong></div>
        {([
          ['overview','Visão Geral'],
          ['projects','Projetos / Laboratórios'],
          ['coordinators','Coordenadores'],
          ['researchers','Pesquisadores'],
          ['reports','Relatos'],
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
            <p>Navegue de projetos e coordenadores até pesquisadores e seus relatos. O conteúdo científico permanece em modo somente leitura.</p>
          </section>
          <section className="governance-stats four">
            <div><strong>{labs.length}</strong><span>Projetos / Laboratórios</span></div>
            <div><strong>{coordinators.filter(c=>c.status==='active').length}</strong><span>Coordenadores ativos</span></div>
            <div><strong>{researchers.filter(r=>r.status==='active').length}</strong><span>Pesquisadores ativos</span></div>
            <div><strong>{reports.length}</strong><span>Relatos visíveis</span></div>
          </section>
          <section className="governance-panel">
            <div className="panel-heading"><div><span className="eyebrow">Estrutura atual</span><h3>Projetos / Laboratórios</h3></div><button className="primary-button" onClick={()=>setCreateOpen(true)}>+ Criar novo projeto</button></div>
            <div className="project-grid">{labs.map(l=><ProjectCard key={l.id} lab={l} coordinator={coordinatorForLab(l.id,members)} stats={projectStats(l)} onOpen={()=>{setSelectedLabId(l.id);setTab('projects')}}/>)}</div>
          </section>
        </>}

        {tab==='projects' && <section className="governance-panel">
          <div className="panel-heading"><div><span className="eyebrow">Estrutura</span><h2>Projetos / Laboratórios</h2></div><button className="primary-button" onClick={()=>setCreateOpen(true)}>+ Criar novo projeto</button></div>
          <div className="project-grid">{labs.map(l=><ProjectCard key={l.id} lab={l} coordinator={coordinatorForLab(l.id,members)} stats={projectStats(l)} active={selectedLabId===l.id} onOpen={()=>setSelectedLabId(l.id)}/>)}</div>
          {selectedLab && <ProjectDetail
            lab={selectedLab}
            coordinator={coordinatorForLab(selectedLab.id,members)}
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
            <div className="table-head coordinator-cols"><span>Nome</span><span>E-mail</span><span>Projeto / Laboratório</span><span>Status</span><span>Ações</span></div>
            {coordinators.map(c=><div className="table-row coordinator-cols" key={c.id}>
              <strong>{c.full_name||'—'}</strong><span>{c.email}</span><span>{labName(c.laboratory_id,labs)}</span><StatusPill status={c.status}/>
              <div className="row-actions">
                <select value={c.laboratory_id||''} onChange={async(e)=>{if(!e.target.value)return;try{await governanceService.assignCoordinator(e.target.value,c.id);flash('Laboratório do coordenador atualizado.');await load()}catch(err){setError(err instanceof Error?err.message:'Falha na atribuição.')}}}><option value="">Definir projeto…</option>{labs.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select>
                <button onClick={async()=>{const next = c.status==='active' ? 'suspended' : 'active';try{await governanceService.updateMembershipStatus(c.id,next);await load()}catch(err){setError(err instanceof Error?err.message:'Falha ao mudar status.')}}}>{c.status==='active'?'Desativar':'Ativar'}</button>
              </div>
            </div>)}
          </div>
        </section>}

        {tab==='researchers' && <section className="governance-panel">
          <div className="panel-heading"><div><span className="eyebrow">Pessoas</span><h2>Pesquisadores</h2></div></div>
          <div className="data-table">
            <div className="table-head researcher-cols"><span>Pesquisador</span><span>E-mail</span><span>Projeto / Laboratório</span><span>Coordenador</span><span>Último relato</span><span>Status</span></div>
            {researchers.map(r=>{const latest=reports.find(x=>x.user_id===r.auth_user_id);const coord=r.laboratory_id?coordinatorForLab(r.laboratory_id,members):undefined;return <div className="table-row researcher-cols" key={r.id}><strong>{r.full_name||'—'}</strong><span>{r.email}</span><span>{labName(r.laboratory_id,labs)}</span><span>{coord?.full_name||'—'}</span><span>{latest?new Date(latest.created_at).toLocaleString('pt-BR'):'Sem relatos'}</span><StatusPill status={r.status}/></div>})}
          </div>
        </section>}

        {tab==='reports' && <ReportLibrary reports={reports} members={members} onOpen={setSelectedReport} title="Relatos institucionais"/>}

        {tab==='requests' && <section className="governance-panel">
          <div className="panel-heading"><div><span className="eyebrow">Acesso</span><h2>Solicitações de acesso</h2></div></div>
          <div className="simple-list">{requests.length ? requests.map(r=><div key={r.id} className="request-admin-row"><div><strong>{r.full_name||r.email}</strong><span>{r.email} · {new Date(r.requested_at).toLocaleString('pt-BR')}</span>{r.message&&<small>{r.message}</small>}</div><div><StatusPill status={r.status}/>{r.status==='pending'&&<><button onClick={()=>setRequestToReview(r)}>Aprovar</button><button onClick={async()=>{try{await accessService.rejectAccessRequest(r.id);await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao rejeitar.')}}}>Rejeitar</button></>}</div></div>) : <p className="muted">Nenhuma solicitação registrada.</p>}</div>
        </section>}
      </main>
    </div>

    {selectedReport && <ReportDrawer report={selectedReport} onClose={()=>setSelectedReport(null)}/>} 
    {createOpen && <CreateProjectModal coordinators={coordinators} onClose={()=>setCreateOpen(false)} onSave={async(input)=>{try{await governanceService.createLaboratory(input);setCreateOpen(false);flash('Projeto criado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao criar projeto.')}}}/>} 
    {editLab && <EditProjectModal lab={editLab} onClose={()=>setEditLab(null)} onSave={async(input)=>{try{await governanceService.updateLaboratory(input);setEditLab(null);flash('Projeto atualizado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar projeto.')}}}/>} 
    {requestToReview && <ApproveRequestModal request={requestToReview} labs={labs} onClose={()=>setRequestToReview(null)} onApprove={async(role,labId)=>{try{await accessService.approveAccessRequest(requestToReview.id,role,labId);setRequestToReview(null);flash('Acesso aprovado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao aprovar acesso.')}}}/>} 
  </div>
}

function ProjectCard({ lab, coordinator, stats, active, onOpen }: {
  lab: GovernanceLaboratory
  coordinator?: GovernanceMembership
  stats: {researchers:number;reports:number;last?:string}
  active?:boolean
  onOpen:()=>void
}) {
  return <button className={`project-card ${active?'active':''}`} onClick={onOpen}>
    <div className="project-card-top"><span className="project-icon">P</span><StatusPill status={lab.active?'active':'suspended'}/></div>
    <h3>{lab.name}</h3><p>{lab.description||'Projeto / laboratório de pesquisa.'}</p>
    <dl><div><dt>Coordenador</dt><dd>{coordinator?.full_name||'Não definido'}</dd></div><div><dt>Pesquisadores</dt><dd>{stats.researchers}</dd></div><div><dt>Relatos</dt><dd>{stats.reports}</dd></div><div><dt>Última atividade</dt><dd>{stats.last?new Date(stats.last).toLocaleDateString('pt-BR'):'—'}</dd></div></dl>
  </button>
}

function ProjectDetail({ lab, coordinator, researchers, reports, coordinators, onEdit, onAssign, onOpenReport }: {
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
    <div className="panel-heading"><div><span className="readonly-badge">Visualização da Diretoria — conteúdo científico somente leitura</span><h2>{lab.name}</h2><p>{lab.description||'Sem descrição.'}</p></div><button className="secondary-button" onClick={onEdit}>Editar projeto</button></div>
    <div className="project-detail-grid">
      <div><span>Coordenador</span><strong>{coordinator?.full_name||'Não definido'}</strong><small>{coordinator?.email||''}</small><div className="inline-control"><select value={coordId} onChange={e=>setCoordId(e.target.value)}><option value="">Selecione…</option>{coordinators.map(c=><option value={c.id} key={c.id}>{c.full_name||c.email}</option>)}</select><button disabled={!coordId} onClick={()=>void onAssign(coordId)}>Alterar coordenador</button></div></div>
      <div><span>Pesquisadores</span><strong>{researchers.length}</strong><small>{researchers.filter(r=>r.status==='active').length} ativos</small></div>
      <div><span>Relatos</span><strong>{reports.length}</strong><small>Histórico autorizado</small></div>
    </div>
    <h3>Pesquisadores</h3><div className="simple-list compact-list">{researchers.map(r=><div key={r.id}><div><strong>{r.full_name||r.email}</strong><span>{r.email}</span></div><StatusPill status={r.status}/></div>)}</div>
    <h3>Biblioteca do projeto</h3><div className="simple-list compact-list">{reports.slice(0,20).map(r=><button className="report-access-row" key={r.id} onClick={()=>onOpenReport(r)}><div><strong>{r.tag}</strong><span>{r.researcher_name} · {formatDate(r.created_at)} {formatTime(r.created_at)}</span></div><small>{formatDuration(r.duration_seconds)}</small></button>)}</div>
  </div>
}

function CreateProjectModal({ coordinators, onClose, onSave }: {
  coordinators: GovernanceMembership[]
  onClose:()=>void
  onSave:(input:{name:string;description?:string;coordinatorMembershipId?:string;active:boolean})=>Promise<void>
}) {
  const [name,setName]=useState('')
  const [description,setDescription]=useState('')
  const [coordinator,setCoordinator]=useState('')
  const [active,setActive]=useState(true)
  const [busy,setBusy]=useState(false)

  return <GovernanceModal title="Criar novo projeto" onClose={onClose}><div className="modal-form">
    <label>Nome<input value={name} onChange={e=>setName(e.target.value)} placeholder="Nome do projeto / laboratório"/></label>
    <label>Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Opcional"/></label>
    <label>Coordenador<select value={coordinator} onChange={e=>setCoordinator(e.target.value)}><option value="">Definir depois</option>{coordinators.map(c=><option value={c.id} key={c.id}>{c.full_name||c.email} — {c.email}</option>)}</select></label>
    <label>Status<select value={active?'active':'archived'} onChange={e=>setActive(e.target.value==='active')}><option value="active">Ativo</option><option value="archived">Arquivado</option></select></label>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!name.trim()||busy} onClick={async()=>{setBusy(true);try{await onSave({name,description,coordinatorMembershipId:coordinator||undefined,active})}finally{setBusy(false)}}}>{busy?'Criando…':'Criar projeto'}</button></div>
  </div></GovernanceModal>
}

function EditProjectModal({ lab, onClose, onSave }: {
  lab: GovernanceLaboratory
  onClose:()=>void
  onSave:(input:{id:string;name:string;description?:string;active:boolean})=>Promise<void>
}) {
  const [name,setName]=useState(lab.name)
  const [description,setDescription]=useState(lab.description||'')
  const [active,setActive]=useState(lab.active)
  const [busy,setBusy]=useState(false)

  return <GovernanceModal title="Editar projeto" onClose={onClose}><div className="modal-form">
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
    {role!=='director'&&<label>Projeto / Laboratório<select value={lab} onChange={e=>setLab(e.target.value)}>{labs.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select></label>}
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy||(role!=='director'&&!lab)} onClick={async()=>{setBusy(true);try{await onApprove(role,role==='director'?undefined:lab)}finally{setBusy(false)}}}>{busy?'Aprovando…':'Aprovar acesso'}</button></div>
  </div></GovernanceModal>
}
