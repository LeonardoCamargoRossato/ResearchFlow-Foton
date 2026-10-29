import { useMemo, useState } from 'react'
import type {
  AccessStatus,
  GovernanceLaboratory,
  GovernanceMembership,
  GovernanceReport,
  InstitutionalPerson,
  InstitutionalRole,
  LaboratoryCoordinatorRelation,
  ResearchFlowInvite
} from '../models/ResearchFlowUser'
import { inviteService } from '../invites/inviteService'
import { governanceService } from './governanceService'
import { GovernanceModal, StatusPill } from './GovernanceShared'
import { formatDate, formatDuration } from '../utils/report'

export const accessStatusLabel: Record<AccessStatus,string> = {
  not_invited: 'Não convidado',
  invite_created: 'Convite criado',
  pending_acceptance: 'Aguardando aceite',
  active: 'Ativo',
  suspended: 'Suspenso',
  revoked: 'Revogado'
}

const roleLabel = (role: InstitutionalRole) => role === 'director' ? 'Diretor' : role === 'lab_coordinator' ? 'Coordenador' : role === 'researcher' ? 'Pesquisador' : 'Outro'
const inviteCacheKey = (inviteId:string) => `researchflow.inviteLink.${inviteId}`

export function AccessStatePill({ status }: { status: AccessStatus }) {
  return <span className={`access-state ${status}`}>{accessStatusLabel[status]}</span>
}

const coordinatorsForLab = (labId:string, people:InstitutionalPerson[], relations:LaboratoryCoordinatorRelation[]) =>
  relations.filter(r=>r.laboratory_id===labId&&r.active).map(r=>people.find(p=>p.id===r.person_id)).filter((p):p is InstitutionalPerson=>Boolean(p))

const labsForPerson = (personId:string, labs:GovernanceLaboratory[], relations:LaboratoryCoordinatorRelation[]) =>
  relations.filter(r=>r.person_id===personId&&r.active).map(r=>labs.find(l=>l.id===r.laboratory_id)).filter((l):l is GovernanceLaboratory=>Boolean(l))

export function InstitutionalLaboratoryCards({ labs, people, relations, members, reports, onOpen }: {
  labs: GovernanceLaboratory[]
  people: InstitutionalPerson[]
  relations: LaboratoryCoordinatorRelation[]
  members: GovernanceMembership[]
  reports: GovernanceReport[]
  onOpen:(id:string)=>void
}) {
  return <div className="project-grid institutional-lab-grid">{labs.map(lab=>{
    const coordinators=coordinatorsForLab(lab.id,people,relations)
    const activeAccess=coordinators.filter(p=>p.access_status==='active').length
    const labMembers=members.filter(m=>m.laboratory_id===lab.id)
    const userIds=new Set(labMembers.map(m=>m.auth_user_id).filter((x):x is string=>Boolean(x)))
    const labReports=reports.filter(r=>userIds.has(r.user_id))
    return <button className="project-card institutional-lab-card" key={lab.id} onClick={()=>onOpen(lab.id)}>
      <div className="project-card-top"><span className="project-icon">Q</span><span className="status-pill active">Ativo</span></div>
      <h3>{lab.name}</h3>{lab.subtitle&&<p className="lab-subtitle">{lab.subtitle}</p>}
      <div className="institutional-coordinator-names"><span>Coordenador{coordinators.length===1?'':'es'}</span>{coordinators.map(p=><strong key={p.id}>{p.display_name}</strong>)}</div>
      <dl><div><dt>Acesso ResearchFlow</dt><dd>{activeAccess} / {coordinators.length} configurados</dd></div><div><dt>Pesquisadores</dt><dd>{labMembers.filter(m=>m.role==='researcher'&&m.status==='active').length}</dd></div><div><dt>Relatos</dt><dd>{labReports.length}</dd></div><div><dt>Última atividade</dt><dd>{labReports[0]?formatDate(labReports[0].created_at):'—'}</dd></div></dl>
    </button>
  })}</div>
}

export function InstitutionalLaboratoriesPage({ labs, people, relations, members, reports, onCreateInvite, onEditPerson }: {
  labs:GovernanceLaboratory[];people:InstitutionalPerson[];relations:LaboratoryCoordinatorRelation[];members:GovernanceMembership[];reports:GovernanceReport[]
  onCreateInvite:(person:InstitutionalPerson)=>void;onEditPerson:(person:InstitutionalPerson)=>void
}) {
  const [selected,setSelected]=useState<string|null>(null)
  const lab=labs.find(l=>l.id===selected)||null
  const coords=lab?coordinatorsForLab(lab.id,people,relations):[]
  const researchers=lab?members.filter(m=>m.role==='researcher'&&m.laboratory_id===lab.id):[]
  const userIds=new Set((lab?members.filter(m=>m.laboratory_id===lab.id):[]).map(m=>m.auth_user_id).filter((x):x is string=>Boolean(x)))
  const labReports=reports.filter(r=>userIds.has(r.user_id))
  return <section className="governance-panel">
    <div className="panel-heading"><div><span className="eyebrow">Estrutura institucional</span><h2>Laboratórios</h2></div></div>
    <InstitutionalLaboratoryCards labs={labs} people={people} relations={relations} members={members} reports={reports} onOpen={setSelected}/>
    {lab&&<div className="institutional-lab-detail">
      <div className="panel-heading"><div><span className="readonly-badge">Estrutura institucional</span><h2>{lab.name}</h2>{lab.subtitle&&<p>{lab.subtitle}</p>}</div><button className="secondary-button" onClick={()=>setSelected(null)}>Fechar detalhe</button></div>
      <h3>Coordenadores</h3><div className="people-card-list">{coords.map(p=><div className="person-card" key={p.id}><div><strong>{p.display_name}</strong><span>{p.email||'E-mail não cadastrado'}</span></div><AccessStatePill status={p.access_status}/><div className="row-actions">{p.access_status!=='active'&&<button onClick={()=>onCreateInvite(p)}>Criar link de invite</button>}<button onClick={()=>onEditPerson(p)}>Editar</button></div></div>)}</div>
      <h3>Pesquisadores</h3><div className="simple-list compact-list">{researchers.length?researchers.map(r=><div key={r.id}><div><strong>{r.full_name||r.email}</strong><span>{r.email}</span></div><StatusPill status={r.status}/></div>):<p className="muted">Nenhum pesquisador ativo neste laboratório.</p>}</div>
      <h3>Relatos do laboratório</h3><div className="simple-list compact-list">{labReports.length?labReports.slice(0,12).map(r=><div key={r.id}><div><strong>{r.researcher_name}</strong><span>{r.tag} · {formatDate(r.created_at)}</span></div><small>{formatDuration(r.duration_seconds)}</small></div>):<p className="muted">Nenhum relato registrado.</p>}</div>
    </div>}
  </section>
}

export function InstitutionalCoordinatorsPage({ labs, people, relations, onCreateInvite, onEditPerson }: {
  labs:GovernanceLaboratory[];people:InstitutionalPerson[];relations:LaboratoryCoordinatorRelation[]
  onCreateInvite:(person:InstitutionalPerson)=>void;onEditPerson:(person:InstitutionalPerson)=>void
}) {
  const coordinators=people.filter(p=>p.institutional_role==='lab_coordinator')
  return <section className="governance-panel">
    <div className="panel-heading"><div><span className="eyebrow">Estrutura institucional</span><h2>Coordenadores</h2></div></div>
    <div className="data-table"><div className="table-head institutional-person-cols"><span>Nome</span><span>Laboratório</span><span>E-mail</span><span>Status de acesso</span><span>Ações</span></div>
      {coordinators.map(p=>{const personLabs=labsForPerson(p.id,labs,relations);return <div className="table-row institutional-person-cols" key={p.id}><strong>{p.display_name}</strong><span>{personLabs.map(l=>l.name).join(', ')||'—'}</span><span>{p.email||'E-mail não cadastrado'}</span><AccessStatePill status={p.access_status}/><div className="row-actions">{p.access_status!=='active'&&<button onClick={()=>onCreateInvite(p)}>{p.access_status==='not_invited'?'Criar link de invite':'Regenerar link'}</button>}<button onClick={()=>onEditPerson(p)}>{p.access_status==='active'?'Gerenciar acesso':'Editar'}</button></div></div>})}
    </div>
  </section>
}

export function DirectorsPage({ people, onCreateInvite, onEditPerson }: {
  people:InstitutionalPerson[];onCreateInvite:(person:InstitutionalPerson)=>void;onEditPerson:(person:InstitutionalPerson)=>void
}) {
  const directors=people.filter(p=>p.institutional_role==='director')
  return <section className="governance-panel">
    <div className="panel-heading"><div><span className="eyebrow">Instituto Foton</span><h2>Diretoria</h2></div></div>
    <div className="people-card-list">{directors.map(p=><div className="person-card" key={p.id}><div><strong>{p.display_name}</strong><span>{p.email||'E-mail não cadastrado'}</span></div><AccessStatePill status={p.access_status}/><div className="row-actions">{p.access_status!=='active'&&<button onClick={()=>onCreateInvite(p)}>{p.access_status==='not_invited'?'Criar link de invite':'Regenerar link'}</button>}<button onClick={()=>onEditPerson(p)}>Editar</button></div></div>)}</div>
  </section>
}

export function PeopleAccessPage({ people, labs, relations, invites, onReload }: {
  people:InstitutionalPerson[];labs:GovernanceLaboratory[];relations:LaboratoryCoordinatorRelation[];invites:ResearchFlowInvite[];onReload:()=>Promise<void>
}) {
  const [generated,setGenerated]=useState<{person:InstitutionalPerson;url:string;expiresAt:string;inviteId:string}|null>(null)
  const [editing,setEditing]=useState<InstitutionalPerson|null>(null)
  const [error,setError]=useState('')

  const createInvite=async(person:InstitutionalPerson)=>{
    setError('')
    try{
      const created=await inviteService.create(person.id)
      const url=`${window.location.origin}${import.meta.env.BASE_URL}#/invite/${created.token}`
      window.sessionStorage.setItem(inviteCacheKey(created.inviteId),url)
      setGenerated({person,url,expiresAt:created.expiresAt,inviteId:created.inviteId})
      await onReload()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível criar o convite.')}
  }

  const activeInviteFor=(personId:string)=>invites.find(i=>i.person_id===personId&&i.status==='active'&&new Date(i.expires_at)>new Date())
  return <>
    <section className="governance-panel">
      <div className="panel-heading"><div><span className="eyebrow">Identidades</span><h2>Pessoas & Acessos</h2><p>Pessoas institucionais podem existir antes de possuir uma conta ResearchFlow.</p></div></div>
      {error&&<div className="error-banner">{error}</div>}
      <div className="data-table"><div className="table-head people-access-cols"><span>Nome</span><span>Cargo</span><span>Laboratório</span><span>E-mail de acesso</span><span>Status</span><span>Ações</span></div>
        {people.map(p=>{const personLabs=labsForPerson(p.id,labs,relations);const activeInvite=activeInviteFor(p.id);const cachedLink=activeInvite?window.sessionStorage.getItem(inviteCacheKey(activeInvite.id)):null;return <div className="table-row people-access-cols" key={p.id}><strong>{p.display_name}</strong><span>{roleLabel(p.institutional_role)}</span><span>{p.institutional_role==='director'?'Instituto Foton':personLabs.map(l=>l.name).join(', ')||'—'}</span><span>{p.email||'E-mail não cadastrado'}</span><AccessStatePill status={p.access_status}/><div className="row-actions">{p.access_status!=='active'&&<button onClick={()=>void createInvite(p)}>{activeInvite?'Regenerar invite':'Criar link de invite'}</button>}{cachedLink&&<button onClick={async()=>{await navigator.clipboard.writeText(cachedLink)}}>Copiar link</button>}{activeInvite&&<button onClick={async()=>{try{await inviteService.revoke(activeInvite.id);window.sessionStorage.removeItem(inviteCacheKey(activeInvite.id));await onReload()}catch(e){setError(e instanceof Error?e.message:'Falha ao revogar convite.')}}}>Revogar invite</button>}<button onClick={()=>setEditing(p)}>{p.access_status==='active'?'Gerenciar acesso':'Editar'}</button></div></div>})}
      </div>
    </section>
    <section className="governance-panel invite-audit-panel"><div className="panel-heading"><div><span className="eyebrow">Auditoria</span><h3>Histórico de convites</h3></div></div><div className="data-table"><div className="table-head invite-audit-cols"><span>Pessoa</span><span>Status</span><span>Criado em</span><span>Expira em</span><span>Aceito em</span><span>Conta vinculada</span></div>{invites.slice(0,50).map(i=>{const person=people.find(p=>p.id===i.person_id);return <div className="table-row invite-audit-cols" key={i.id}><strong>{person?.display_name||'Pessoa removida'}</strong><span>{i.status}</span><span>{new Date(i.created_at).toLocaleString('pt-BR')}</span><span>{new Date(i.expires_at).toLocaleString('pt-BR')}</span><span>{i.accepted_at?new Date(i.accepted_at).toLocaleString('pt-BR'):'—'}</span><span>{i.accepted_email||'—'}</span></div>})}</div>{!invites.length&&<p className="muted">Nenhum convite gerado ainda.</p>}</section>
    {generated&&<InviteLinkModal data={generated} onClose={()=>setGenerated(null)}/>} 
    {editing&&<EditPersonModal person={editing} labs={labs} relations={relations} onClose={()=>setEditing(null)} onSaved={async()=>{setEditing(null);await onReload()}}/>}
  </>
}

function InviteLinkModal({ data, onClose }: { data:{person:InstitutionalPerson;url:string;expiresAt:string;inviteId:string};onClose:()=>void }) {
  const [copied,setCopied]=useState(false)
  return <GovernanceModal title="Link de invite" onClose={onClose}><div className="modal-form">
    <div className="identity-chip"><strong>{data.person.display_name}</strong><span>Válido até {new Date(data.expiresAt).toLocaleString('pt-BR')}</span></div>
    <label>Link seguro<textarea readOnly value={data.url}/></label>
    <p className="muted">O token bruto fica apenas nesta sessão do navegador. O banco persiste somente o hash SHA-256; se o link for perdido em outra sessão, gere um novo.</p>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button" onClick={async()=>{await navigator.clipboard.writeText(data.url);setCopied(true)}}>{copied?'Copiado!':'Copiar link'}</button></div>
  </div></GovernanceModal>
}

function EditPersonModal({ person, labs, relations, onClose, onSaved }: {
  person:InstitutionalPerson;labs:GovernanceLaboratory[];relations:LaboratoryCoordinatorRelation[];onClose:()=>void;onSaved:()=>Promise<void>
}) {
  const currentLab=labsForPerson(person.id,labs,relations)[0]?.id||person.primary_laboratory_id||''
  const [name,setName]=useState(person.display_name)
  const [title,setTitle]=useState(person.title_prefix||'')
  const [role,setRole]=useState<InstitutionalRole>(person.institutional_role)
  const [email,setEmail]=useState(person.email||'')
  const [status,setStatus]=useState<AccessStatus>(person.access_status)
  const [laboratory,setLaboratory]=useState(currentLab)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  return <GovernanceModal title="Editar pessoa institucional" onClose={onClose}><div className="modal-form">
    <label>Nome de exibição<input value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>Título<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Dr., Dra., Msc. (opcional)"/></label>
    <label>Cargo<select value={role} onChange={e=>setRole(e.target.value as InstitutionalRole)}><option value="director">Diretor</option><option value="lab_coordinator">Coordenador</option><option value="researcher">Pesquisador</option><option value="other">Outro</option></select></label>
    {role!=='director'&&<label>Laboratório<select value={laboratory} onChange={e=>setLaboratory(e.target.value)}><option value="">Sem laboratório</option>{labs.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select></label>}
    <label>E-mail de acesso<input value={email} onChange={e=>setEmail(e.target.value)} readOnly={Boolean(person.auth_user_id)} placeholder="E-mail não cadastrado"/></label>
    <label>Status<select value={status} onChange={e=>setStatus(e.target.value as AccessStatus)}><option value="not_invited">Não convidado</option><option value="invite_created">Convite criado</option><option value="pending_acceptance">Aguardando aceite</option><option value="active">Ativo</option><option value="suspended">Suspenso</option><option value="revoked">Revogado</option></select></label>
    {person.auth_user_id&&<p className="muted">A conta Google já foi verificada. Para trocar o e-mail com segurança, revogue o acesso e faça um novo convite.</p>}
    {error&&<div className="error-banner">{error}</div>}
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy||!name.trim()} onClick={async()=>{setBusy(true);setError('');try{await governanceService.updateInstitutionalPerson({personId:person.id,displayName:name,titlePrefix:title,institutionalRole:role,email:email||undefined,accessStatus:status});if(role!=='director')await governanceService.setInstitutionalPersonLaboratory(person.id,laboratory||null);await onSaved()}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar a pessoa.')}finally{setBusy(false)}}}>{busy?'Salvando…':'Salvar'}</button></div>
  </div></GovernanceModal>
}
