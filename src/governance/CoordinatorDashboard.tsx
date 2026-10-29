import { useEffect, useMemo, useState } from 'react'
import { WeeklyReportRecorder } from '../components/WeeklyReportRecorder'
import type { GovernanceLaboratory, GovernanceMembership, GovernanceReport, MembershipStatus, ResearchFlowUser } from '../models/ResearchFlowUser'
import { formatDate, formatDuration, formatTime } from '../utils/report'
import { governanceService } from './governanceService'
import { GovernanceHeader, GovernanceModal, ReportDrawer, ReportLibrary, StatusPill } from './GovernanceShared'

type CoordinatorTab = 'overview' | 'researchers' | 'reports' | 'coordinatorReport'

export function CoordinatorDashboard({ profile }: { profile: ResearchFlowUser }) {
  const [tab,setTab]=useState<CoordinatorTab>('overview')
  const [lab,setLab]=useState<GovernanceLaboratory|null>(null)
  const [members,setMembers]=useState<GovernanceMembership[]>([])
  const [reports,setReports]=useState<GovernanceReport[]>([])
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [addOpen,setAddOpen]=useState(false)
  const [editResearcher,setEditResearcher]=useState<GovernanceMembership|null>(null)
  const [selectedResearcher,setSelectedResearcher]=useState<GovernanceMembership|null>(null)
  const [selectedReport,setSelectedReport]=useState<GovernanceReport|null>(null)

  const load=async()=>{
    setError('')
    try{
      const [nextLab,nextMembers,nextReports]=await Promise.all([
        governanceService.getCoordinatorLaboratory(),
        governanceService.listCoordinatorMembers(),
        governanceService.listCoordinatorReports()
      ])
      if(!nextLab) throw new Error('Seu membership de coordenador não está vinculado a um laboratório ativo.')
      setLab(nextLab)
      setMembers(nextMembers)
      setReports(nextReports)
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível carregar o workspace do laboratório.')
    }
  }

  useEffect(()=>{void load()},[profile.membershipId])

  const labName=lab?.name||profile.laboratoryName||'Meu laboratório'
  const researchers=members.filter(m=>m.role==='researcher')
  const coordinatorReports=reports.filter(r=>r.report_type==='coordinator'&&r.user_id===profile.authUserId)
  const flash=(text:string)=>{setMessage(text);window.setTimeout(()=>setMessage(''),3500)}

  const nav:[CoordinatorTab,string][]=[
    ['overview','Visão Geral'],
    ['researchers','Pesquisadores'],
    ['reports','Biblioteca de Relatos'],
    ['coordinatorReport','Relato do Coordenador']
  ]

  return <div className="governance-shell v3-shell coordinator-v4-shell">
    <GovernanceHeader profile={profile} subtitle={`${labName} · Coordenador de Laboratório`}/>
    <div className="governance-layout">
      <aside className="governance-nav">
        <div><span className="eyebrow">Laboratório</span><strong>{labName}</strong></div>
        {nav.map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}
      </aside>

      <main className="governance-content coordinator-content">
        {error&&<div className="error-banner coordinator-load-error"><strong>Não foi possível carregar todos os dados do laboratório.</strong><span>{error}</span></div>}
        {message&&<div className="success-banner">{message}</div>}

        {tab==='overview'&&<>
          <section className="governance-hero coordinator-hero">
            <span className="eyebrow">Coordenador de Laboratório</span>
            <h2>{labName}</h2>
            <p>Acompanhe pesquisadores, relatos semanais e o progresso do laboratório em um único ambiente.</p>
          </section>
          <section className="governance-stats">
            <div><strong>{researchers.filter(r=>r.status==='active').length}</strong><span>Pesquisadores ativos</span></div>
            <div><strong>{reports.length}</strong><span>Relatos na biblioteca</span></div>
            <div><strong>{reports.filter(r=>new Date(r.created_at).toDateString()===new Date().toDateString()).length}</strong><span>Enviados hoje</span></div>
          </section>
          <section className="governance-panel">
            <div className="panel-heading"><div><span className="eyebrow">Acompanhamento</span><h3>Relatos recentes</h3></div></div>
            <RecentReports reports={reports} onOpen={setSelectedReport}/>
          </section>
        </>}

        {tab==='researchers'&&<section className="governance-panel">
          <div className="panel-heading"><div><span className="eyebrow">Equipe</span><h2>Pesquisadores</h2><p>Pesquisadores vinculados exclusivamente a {labName}.</p></div><button className="primary-button" onClick={()=>setAddOpen(true)}>+ Adicionar pesquisador</button></div>
          <div className="researcher-cards">{researchers.map(r=><div className="researcher-card" key={r.id}>
            <button className="researcher-avatar researcher-avatar-button" onClick={()=>setSelectedResearcher(r)}>{(r.full_name||r.email).slice(0,1)}</button>
            <div><button className="researcher-name-button" onClick={()=>setSelectedResearcher(r)}>{r.full_name||r.email}</button><span>{r.email}</span><small>{labName}</small></div>
            <StatusPill status={r.status}/>
            <div className="row-actions">
              <button onClick={()=>setSelectedResearcher(r)}>Ver detalhes</button>
              <button onClick={()=>setEditResearcher(r)}>Editar</button>
              <button className="danger-text" disabled={r.status==='revoked'} onClick={async()=>{
                if(!window.confirm(`Remover ${r.full_name||r.email} do laboratório? O histórico será preservado.`)) return
                try{await governanceService.removeResearcher(r.id);flash('Pesquisador removido; histórico preservado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao remover.')}
              }}>Remover</button>
            </div>
          </div>)}</div>
          {!researchers.length&&!error&&<div className="empty-state"><strong>Nenhum pesquisador vinculado.</strong><span>Use “Adicionar pesquisador” para montar a equipe deste laboratório.</span></div>}
        </section>}

        {tab==='reports'&&<ReportLibrary reports={reports} members={researchers} onOpen={setSelectedReport} title="Biblioteca de Relatos" coordinatorMode/>}

        {tab==='coordinatorReport'&&<div className="coordinator-report-workspace">
          <WeeklyReportRecorder
            eyebrow="Relato do Coordenador"
            heading="Como evoluiu o laboratório nesta semana?"
            contextText="Faça um relato sobre o acompanhamento do laboratório, atividades realizadas, decisões, dificuldades, reuniões, avanços dos pesquisadores e próximos passos."
            successText="Relato do coordenador salvo com sucesso."
            onSave={async draft=>{
              await governanceService.createCoordinatorReport(profile.authUserId,profile.fullName,draft)
              await load()
            }}
          />
          <CoordinatorHistory reports={coordinatorReports} onOpen={setSelectedReport}/>
        </div>}
      </main>
    </div>

    {selectedReport&&<ReportDrawer
      report={selectedReport}
      onClose={()=>setSelectedReport(null)}
      editable={selectedReport.report_type==='coordinator'&&selectedReport.user_id===profile.authUserId}
      onSaveTranscript={async(id,transcript)=>{
        await governanceService.updateCoordinatorTranscript(id,transcript)
        await load()
        setSelectedReport(current=>current?.id===id?{...current,transcript,transcript_status:'edited'}:current)
      }}
    />}
    {selectedResearcher&&<ResearcherDetailModal researcher={selectedResearcher} laboratoryName={labName} reports={reports.filter(r=>r.user_id===selectedResearcher.auth_user_id)} onOpenReport={r=>{setSelectedResearcher(null);setSelectedReport(r)}} onClose={()=>setSelectedResearcher(null)}/>} 
    {addOpen&&<AddResearcherModal laboratoryName={labName} onClose={()=>setAddOpen(false)} onSave={async(input)=>{try{await governanceService.addResearcher(input);setAddOpen(false);flash('Pesquisador adicionado ao laboratório.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao adicionar pesquisador.')}}}/>} 
    {editResearcher&&<EditResearcherModal researcher={editResearcher} laboratoryName={labName} onClose={()=>setEditResearcher(null)} onSave={async(input)=>{try{await governanceService.updateResearcher(input);setEditResearcher(null);flash('Pesquisador atualizado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao atualizar pesquisador.')}}}/>} 
  </div>
}

function RecentReports({reports,onOpen}:{reports:GovernanceReport[];onOpen:(report:GovernanceReport)=>void}){
  const recent=reports.slice(0,6)
  if(!recent.length) return <div className="empty-state compact-empty"><strong>Nenhum relato enviado ainda.</strong><span>Os relatos do laboratório aparecerão aqui.</span></div>
  return <div className="recent-report-list">{recent.map(r=><button key={r.id} onClick={()=>onOpen(r)}>
    <div><strong>{r.researcher_name}</strong><span>{r.tag}</span></div>
    <div className="recent-report-meta"><span>{r.report_type==='coordinator'?'Coordenador':'Pesquisador'}</span><span>{formatDate(r.created_at)} · {formatTime(r.created_at)}</span><span>{formatDuration(r.duration_seconds)}</span></div>
    <b>Abrir</b>
  </button>)}</div>
}

function CoordinatorHistory({reports,onOpen}:{reports:GovernanceReport[];onOpen:(report:GovernanceReport)=>void}){
  return <section className="governance-panel coordinator-history">
    <div className="panel-heading"><div><span className="eyebrow">Histórico pessoal</span><h3>Meus relatos como coordenador</h3></div><span className="library-count">{reports.length} relato(s)</span></div>
    {reports.length?<div className="recent-report-list">{reports.map(r=><button key={r.id} onClick={()=>onOpen(r)}><div><strong>{r.tag}</strong><span>{formatDate(r.created_at)} · {formatTime(r.created_at)}</span></div><div className="recent-report-meta"><span>{formatDuration(r.duration_seconds)}</span><StatusPill status={r.status}/></div><b>Abrir</b></button>)}</div>:<div className="empty-state compact-empty"><strong>Nenhum relato do coordenador ainda.</strong><span>Seu primeiro relato aparecerá aqui após salvar a gravação.</span></div>}
  </section>
}

function ResearcherDetailModal({researcher,laboratoryName,reports,onOpenReport,onClose}:{
  researcher:GovernanceMembership
  laboratoryName:string
  reports:GovernanceReport[]
  onOpenReport:(report:GovernanceReport)=>void
  onClose:()=>void
}){
  const ordered=useMemo(()=>[...reports].sort((a,b)=>b.created_at.localeCompare(a.created_at)),[reports])
  const latest=ordered[0]
  return <GovernanceModal title="Detalhes do pesquisador" onClose={onClose}>
    <div className="researcher-detail-summary">
      <div><span>Nome</span><strong>{researcher.full_name||researcher.email}</strong></div>
      <div><span>E-mail</span><strong>{researcher.email}</strong></div>
      <div><span>Status</span><StatusPill status={researcher.status}/></div>
      <div><span>Laboratório</span><strong>{laboratoryName}</strong></div>
      <div><span>Relatos</span><strong>{reports.length}</strong></div>
      <div><span>Último relato</span><strong>{latest?`${formatDate(latest.created_at)} · ${latest.tag}`:'Nenhum envio'}</strong></div>
    </div>
    <h3>Biblioteca pessoal</h3>
    <div className="researcher-detail-reports">{ordered.map(r=><button key={r.id} onClick={()=>onOpenReport(r)}><strong>{r.tag}</strong><span>{formatDate(r.created_at)} · {formatDuration(r.duration_seconds)}</span><b>Abrir</b></button>)}</div>
    {!ordered.length&&<p className="muted">Este pesquisador ainda não possui relatos visíveis.</p>}
  </GovernanceModal>
}

function AddResearcherModal({ laboratoryName, onClose, onSave }: {
  laboratoryName:string
  onClose:()=>void
  onSave:(input:{fullName:string;email:string;status:'active'|'invited'})=>Promise<void>
}) {
  const [fullName,setFullName]=useState('')
  const [email,setEmail]=useState('')
  const [busy,setBusy]=useState(false)

  return <GovernanceModal title="Adicionar pesquisador" onClose={onClose}><div className="modal-form">
    <label>Nome<input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nome do pesquisador"/></label>
    <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="pesquisador@gmail.com"/></label>
    <label>Laboratório<input value={laboratoryName} readOnly/></label>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!email.trim()||busy} onClick={async()=>{setBusy(true);try{await onSave({fullName,email,status:'active'})}finally{setBusy(false)}}}>{busy?'Adicionando…':'Adicionar pesquisador'}</button></div>
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
