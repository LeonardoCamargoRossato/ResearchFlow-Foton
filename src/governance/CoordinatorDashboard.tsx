import { useEffect, useState } from 'react'
import type { GovernanceLaboratory, GovernanceMembership, GovernanceReport, MembershipStatus, ResearchFlowUser } from '../models/ResearchFlowUser'
import { governanceService } from './governanceService'
import { GovernanceHeader, GovernanceModal, ReportDrawer, ReportLibrary, StatusPill } from './GovernanceShared'

type CoordinatorTab = 'overview' | 'researchers' | 'reports'

export function CoordinatorDashboard({ profile }: { profile: ResearchFlowUser }) {
  const [tab,setTab]=useState<CoordinatorTab>('overview')
  const [labs,setLabs]=useState<GovernanceLaboratory[]>([])
  const [members,setMembers]=useState<GovernanceMembership[]>([])
  const [reports,setReports]=useState<GovernanceReport[]>([])
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [addOpen,setAddOpen]=useState(false)
  const [editResearcher,setEditResearcher]=useState<GovernanceMembership|null>(null)
  const [selectedReport,setSelectedReport]=useState<GovernanceReport|null>(null)

  const load=async()=>{
    setError('')
    try{
      const [nextLabs,nextMembers,nextReports]=await Promise.all([
        governanceService.listLaboratories(),
        governanceService.listMemberships(),
        governanceService.listReports()
      ])
      setLabs(nextLabs)
      setMembers(nextMembers)
      setReports(nextReports)
    } catch(e) {
      setError(e instanceof Error?e.message:'Não foi possível carregar o laboratório.')
    }
  }

  useEffect(()=>{void load()},[profile.membershipId])

  const lab=labs.find(l=>l.id===profile.laboratoryId)||labs[0]
  const researchers=members.filter(m=>m.role==='researcher')
  const flash=(text:string)=>{setMessage(text);window.setTimeout(()=>setMessage(''),3500)}

  return <div className="governance-shell v3-shell">
    <GovernanceHeader profile={profile} subtitle={`${lab?.name||profile.laboratoryName||'Laboratório'} · Coordenador de Laboratório`}/>
    <div className="governance-layout">
      <aside className="governance-nav">
        <div><span className="eyebrow">Laboratório</span><strong>{lab?.name||profile.laboratoryName||'Meu laboratório'}</strong></div>
        {([['overview','Visão Geral'],['researchers','Pesquisadores'],['reports','Biblioteca de Relatos']] as [CoordinatorTab,string][]).map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}
      </aside>

      <main className="governance-content">
        {error&&<div className="error-banner">{error}</div>}
        {message&&<div className="success-banner">{message}</div>}

        {tab==='overview'&&<>
          <section className="governance-hero">
            <span className="eyebrow">Coordenador de Laboratório</span>
            <h2>{lab?.name||profile.laboratoryName}</h2>
            <p>Você vê apenas os pesquisadores e os relatos associados a este laboratório. A autorização é aplicada pelo PostgreSQL/RLS.</p>
          </section>
          <section className="governance-stats">
            <div><strong>{researchers.filter(r=>r.status==='active').length}</strong><span>Pesquisadores ativos</span></div>
            <div><strong>{reports.length}</strong><span>Relatos na biblioteca</span></div>
            <div><strong>{reports.filter(r=>new Date(r.created_at).toDateString()===new Date().toDateString()).length}</strong><span>Enviados hoje</span></div>
          </section>
          <section className="governance-panel">
            <div className="panel-heading"><div><span className="eyebrow">Acompanhamento</span><h3>Relatos recentes</h3></div></div>
            <SubmissionQueue researchers={researchers} reports={reports}/>
          </section>
        </>}

        {tab==='researchers'&&<section className="governance-panel">
          <div className="panel-heading"><div><span className="eyebrow">Equipe</span><h2>Pesquisadores</h2></div><button className="primary-button" onClick={()=>setAddOpen(true)}>+ Adicionar pesquisador</button></div>
          <div className="researcher-cards">{researchers.map(r=><div className="researcher-card" key={r.id}>
            <div className="researcher-avatar">{(r.full_name||r.email).slice(0,1)}</div>
            <div><strong>{r.full_name||r.email}</strong><span>{r.email}</span><small>{lab?.name||profile.laboratoryName}</small></div>
            <StatusPill status={r.status}/>
            <div className="row-actions">
              <button onClick={()=>setEditResearcher(r)}>Editar</button>
              <button className="danger-text" disabled={r.status==='revoked'} onClick={async()=>{
                if(!window.confirm(`Remover ${r.full_name||r.email} do laboratório? O histórico será preservado.`)) return
                try{await governanceService.removeResearcher(r.id);flash('Pesquisador removido; histórico preservado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao remover.')}
              }}>Remover</button>
            </div>
          </div>)}</div>
        </section>}

        {tab==='reports'&&<ReportLibrary reports={reports} members={researchers} onOpen={setSelectedReport} title="Biblioteca de Relatos" coordinatorMode/>}
      </main>
    </div>

    {selectedReport&&<ReportDrawer report={selectedReport} onClose={()=>setSelectedReport(null)}/>} 
    {addOpen&&<AddResearcherModal laboratoryName={lab?.name||profile.laboratoryName||'Laboratório'} onClose={()=>setAddOpen(false)} onSave={async(input)=>{try{await governanceService.addResearcher(input);setAddOpen(false);flash('Pesquisador adicionado ao laboratório.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao adicionar pesquisador.')}}}/>} 
    {editResearcher&&<EditResearcherModal researcher={editResearcher} laboratoryName={lab?.name||profile.laboratoryName||'Laboratório'} onClose={()=>setEditResearcher(null)} onSave={async(input)=>{try{await governanceService.updateResearcher(input);setEditResearcher(null);flash('Pesquisador atualizado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar pesquisador.')}}}/>} 
  </div>
}

function SubmissionQueue({ researchers, reports }: { researchers: GovernanceMembership[]; reports: GovernanceReport[] }) {
  return <div className="submission-queue">{researchers.filter(r=>r.status==='active').map(r=>{
    const last=reports.find(x=>x.user_id===r.auth_user_id)
    return <div key={r.id}>
      <div className="researcher-avatar small">{(r.full_name||r.email).slice(0,1)}</div>
      <div><strong>{r.full_name||r.email}</strong><span>{last?`Último envio: ${new Date(last.created_at).toLocaleString('pt-BR')}`:'Ainda não enviou relatos'}</span></div>
      {last&&<span className="queue-tag">{last.tag}</span>}
    </div>
  })}</div>
}

function AddResearcherModal({ laboratoryName, onClose, onSave }: {
  laboratoryName:string
  onClose:()=>void
  onSave:(input:{fullName:string;email:string;status:'active'|'invited'})=>Promise<void>
}) {
  const [fullName,setFullName]=useState('')
  const [email,setEmail]=useState('')
  const [status,setStatus]=useState<'active'|'invited'>('active')
  const [busy,setBusy]=useState(false)

  return <GovernanceModal title="Adicionar pesquisador" onClose={onClose}><div className="modal-form">
    <label>Nome<input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nome do pesquisador"/></label>
    <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="pesquisador@gmail.com"/></label>
    <label>Laboratório<input value={laboratoryName} readOnly/></label>
    <label>Status<select value={status} onChange={e=>setStatus(e.target.value as 'active'|'invited')}><option value="active">Ativo</option><option value="invited">Convidado</option></select></label>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!email.trim()||busy} onClick={async()=>{setBusy(true);try{await onSave({fullName,email,status})}finally{setBusy(false)}}}>{busy?'Adicionando…':'Adicionar pesquisador'}</button></div>
  </div></GovernanceModal>
}

function EditResearcherModal({ researcher, laboratoryName, onClose, onSave }: {
  researcher:GovernanceMembership
  laboratoryName:string
  onClose:()=>void
  onSave:(input:{membershipId:string;fullName:string;status:MembershipStatus})=>Promise<void>
}) {
  const [fullName,setFullName]=useState(researcher.full_name||'')
  const [status,setStatus]=useState<MembershipStatus>(researcher.status)
  const [busy,setBusy]=useState(false)

  return <GovernanceModal title="Editar pesquisador" onClose={onClose}><div className="modal-form">
    <label>Nome<input value={fullName} onChange={e=>setFullName(e.target.value)}/></label>
    <label>E-mail<input value={researcher.email} readOnly/></label>
    <label>Laboratório<input value={laboratoryName} readOnly/></label>
    <label>Status<select value={status} onChange={e=>setStatus(e.target.value as MembershipStatus)}><option value="active">Ativo</option><option value="invited">Convidado</option><option value="suspended">Suspenso</option><option value="revoked">Removido</option></select></label>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy} onClick={async()=>{setBusy(true);try{await onSave({membershipId:researcher.id,fullName,status})}finally{setBusy(false)}}}>{busy?'Salvando…':'Salvar'}</button></div>
  </div></GovernanceModal>
}
