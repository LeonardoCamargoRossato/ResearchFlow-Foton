import { useEffect, useMemo, useState } from 'react'
import { accessService } from '../auth/accessService'
import { inviteService } from '../invites/inviteService'
import type {
  AccessRequest,
  GovernanceLaboratory,
  GovernanceMembership,
  GovernanceReport,
  InstitutionalPerson,
  LaboratoryCoordinatorRelation,
  ResearchFlowInvite,
  ResearchFlowUser
} from '../models/ResearchFlowUser'
import { governanceService } from './governanceService'
import { GovernanceHeader, GovernanceModal, ReportDrawer, ReportLibrary, StatusPill } from './GovernanceShared'
import {
  DirectorsPage,
  InstitutionalCoordinatorsPage,
  InstitutionalLaboratoriesPage,
  InstitutionalLaboratoryCards,
  PeopleAccessPage
} from './DirectorInstitutionalV6'
import '../director-v5.css'
import '../director-v6.css'

type DirectorTab = 'overview' | 'laboratories' | 'coordinators' | 'directors' | 'peopleAccess' | 'researchers' | 'researcherReports' | 'coordinatorReports' | 'requests'

export function DirectorDashboardV6({ profile }: { profile: ResearchFlowUser }) {
  const [tab,setTab]=useState<DirectorTab>('overview')
  const [labs,setLabs]=useState<GovernanceLaboratory[]>([])
  const [members,setMembers]=useState<GovernanceMembership[]>([])
  const [reports,setReports]=useState<GovernanceReport[]>([])
  const [requests,setRequests]=useState<AccessRequest[]>([])
  const [people,setPeople]=useState<InstitutionalPerson[]>([])
  const [relations,setRelations]=useState<LaboratoryCoordinatorRelation[]>([])
  const [invites,setInvites]=useState<ResearchFlowInvite[]>([])
  const [selectedReport,setSelectedReport]=useState<GovernanceReport|null>(null)
  const [createLabOpen,setCreateLabOpen]=useState(false)
  const [generatedInvite,setGeneratedInvite]=useState<{person:InstitutionalPerson;url:string;expiresAt:string}|null>(null)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  const load = async () => {
    setError('')
    const results=await Promise.allSettled([
      governanceService.listDirectorLaboratories(),
      governanceService.listDirectorMemberships(),
      governanceService.listDirectorReports(),
      accessService.listAccessRequests(),
      governanceService.listDirectorPeople(),
      governanceService.listDirectorLaboratoryCoordinators(),
      inviteService.listDirectorInvites()
    ])
    const labels=['laboratories','memberships','reports','access requests','people','laboratory coordinators','invites']
    let failed=false
    results.forEach((r,index)=>{if(r.status==='rejected'){failed=true;console.error(`Failed to load ${labels[index]}`,r.reason)}})
    if(results[0].status==='fulfilled') setLabs(results[0].value.filter(l=>l.active))
    if(results[1].status==='fulfilled') setMembers(results[1].value)
    if(results[2].status==='fulfilled') setReports(results[2].value)
    if(results[3].status==='fulfilled') setRequests(results[3].value)
    if(results[4].status==='fulfilled') setPeople(results[4].value)
    if(results[5].status==='fulfilled') setRelations(results[5].value)
    if(results[6].status==='fulfilled') setInvites(results[6].value)
    if(failed) setError('Não foi possível carregar todos os dados da Diretoria. Verifique se a migration V6 foi aplicada.')
  }

  useEffect(()=>{void load()},[profile.membershipId])

  const researchers=useMemo(()=>members.filter(m=>m.role==='researcher'),[members])
  const researcherReports=useMemo(()=>reports.filter(r=>r.report_type==='researcher'),[reports])
  const coordinatorReports=useMemo(()=>reports.filter(r=>r.report_type==='coordinator'),[reports])
  const institutionalCoordinators=useMemo(()=>people.filter(p=>p.institutional_role==='lab_coordinator'),[people])

  const flash=(text:string)=>{setMessage(text);window.setTimeout(()=>setMessage(''),3500)}

  const createInvite=async(person:InstitutionalPerson)=>{
    try{
      const created=await inviteService.create(person.id)
      const url=`${window.location.origin}${import.meta.env.BASE_URL}#/invite/${created.token}`
      setGeneratedInvite({person,url,expiresAt:created.expiresAt})
      await load()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível criar o convite.')}
  }

  const navigation:[DirectorTab,string][]=[
    ['overview','Visão Geral'],
    ['laboratories','Laboratórios'],
    ['coordinators','Coordenadores'],
    ['directors','Diretoria'],
    ['peopleAccess','Pessoas & Acessos'],
    ['researchers','Pesquisadores'],
    ['researcherReports','Relatos — Pesquisadores'],
    ['coordinatorReports','Relatos — Coordenadores'],
    ['requests','Solicitações de acesso']
  ]

  return <div className="governance-shell v3-shell">
    <GovernanceHeader profile={profile} subtitle="Diretoria · Instituto Foton"/>
    <div className="governance-layout">
      <aside className="governance-nav director-v5-nav">
        <div><span className="eyebrow">Gestão Geral</span><strong>Diretoria</strong></div>
        {navigation.map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}{key==='requests'&&requests.some(r=>r.status==='pending')?<i>{requests.filter(r=>r.status==='pending').length}</i>:null}</button>)}
      </aside>
      <main className="governance-content">
        {error&&<div className="error-banner">{error}</div>}{message&&<div className="success-banner">{message}</div>}

        {tab==='overview'&&<>
          <section className="governance-hero"><span className="eyebrow">Diretoria — ResearchFlow</span><h2>Estrutura institucional de pesquisa</h2><p>Laboratórios e pessoas existem independentemente de já possuírem conta ResearchFlow. Acesso e autenticação são gerenciados separadamente.</p></section>
          <section className="governance-stats four"><div><strong>{labs.length}</strong><span>Laboratórios</span></div><div><strong>{institutionalCoordinators.length}</strong><span>Coordenadores institucionais</span></div><div><strong>{people.filter(p=>p.access_status==='active').length}</strong><span>Acessos ativos</span></div><div><strong>{reports.length}</strong><span>Relatos visíveis</span></div></section>
          <section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Estrutura atual</span><h3>Laboratórios</h3></div><button className="primary-button" onClick={()=>setCreateLabOpen(true)}>+ Criar laboratório</button></div><InstitutionalLaboratoryCards labs={labs} people={people} relations={relations} members={members} reports={reports} onOpen={()=>setTab('laboratories')}/></section>
          <div className="director-recent-grid"><Recent title="Últimos relatos de pesquisadores" reports={researcherReports.slice(0,5)} onOpen={setSelectedReport}/><Recent title="Últimos relatos de coordenadores" reports={coordinatorReports.slice(0,5)} onOpen={setSelectedReport}/></div>
        </>}

        {tab==='laboratories'&&<InstitutionalLaboratoriesPage labs={labs} people={people} relations={relations} members={members} reports={reports} onCreateInvite={p=>void createInvite(p)} onEditPerson={()=>setTab('peopleAccess')}/>} 
        {tab==='coordinators'&&<InstitutionalCoordinatorsPage labs={labs} people={people} relations={relations} onCreateInvite={p=>void createInvite(p)} onEditPerson={()=>setTab('peopleAccess')}/>} 
        {tab==='directors'&&<DirectorsPage people={people} onCreateInvite={p=>void createInvite(p)} onEditPerson={()=>setTab('peopleAccess')}/>} 
        {tab==='peopleAccess'&&<PeopleAccessPage people={people} labs={labs} relations={relations} invites={invites} onReload={load}/>} 

        {tab==='researchers'&&<section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Contas ativas</span><h2>Pesquisadores</h2></div></div><div className="data-table"><div className="table-head researcher-cols"><span>Pesquisador</span><span>E-mail</span><span>Laboratório</span><span>Status</span><span>Último relato</span><span>Relatos</span></div>{researchers.map(r=>{const lab=labs.find(l=>l.id===r.laboratory_id);const own=researcherReports.filter(x=>x.user_id===r.auth_user_id);return <div className="table-row researcher-cols" key={r.id}><strong>{r.full_name||r.email}</strong><span>{r.email}</span><span>{lab?.name||'—'}</span><StatusPill status={r.status}/><span>{own[0]?new Date(own[0].created_at).toLocaleString('pt-BR'):'Sem relatos'}</span><strong>{own.length}</strong></div>})}</div>{!researchers.length&&<div className="empty-state"><strong>Nenhum pesquisador encontrado.</strong></div>}</section>}

        {tab==='researcherReports'&&<ReportLibrary reports={researcherReports} members={members} onOpen={setSelectedReport} title="Relatos dos Pesquisadores"/>}
        {tab==='coordinatorReports'&&<ReportLibrary reports={coordinatorReports} members={members} onOpen={setSelectedReport} title="Relatos dos Coordenadores"/>}

        {tab==='requests'&&<section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Acesso</span><h2>Solicitações de acesso</h2></div></div><div className="simple-list">{requests.length?requests.map(r=><div key={r.id} className="request-admin-row"><div><strong>{r.full_name||r.email}</strong><span>{r.email} · {new Date(r.requested_at).toLocaleString('pt-BR')}</span>{r.message&&<small>{r.message}</small>}</div><div><StatusPill status={r.status}/></div></div>):<p className="muted">Nenhuma solicitação registrada.</p>}</div></section>}
      </main>
    </div>

    {selectedReport&&<ReportDrawer report={selectedReport} onClose={()=>setSelectedReport(null)}/>} 
    {createLabOpen&&<CreateLabModal onClose={()=>setCreateLabOpen(false)} onSave={async(name,description)=>{try{await governanceService.createLaboratory({name,description,active:true});setCreateLabOpen(false);flash('Laboratório criado.');await load()}catch(e){setError(e instanceof Error?e.message:'Falha ao criar laboratório.')}}}/>} 
    {generatedInvite&&<GeneratedInviteModal person={generatedInvite.person} url={generatedInvite.url} expiresAt={generatedInvite.expiresAt} onClose={()=>setGeneratedInvite(null)}/>} 
  </div>
}

function Recent({title,reports,onOpen}:{title:string;reports:GovernanceReport[];onOpen:(r:GovernanceReport)=>void}){return <section className="governance-panel"><div className="panel-heading"><div><span className="eyebrow">Atividade recente</span><h3>{title}</h3></div></div><div className="simple-list compact-list">{reports.length?reports.map(r=><button className="report-access-row" key={r.id} onClick={()=>onOpen(r)}><div><strong>{r.researcher_name}</strong><span>{r.tag} · {new Date(r.created_at).toLocaleDateString('pt-BR')}</span></div></button>):<p className="muted">Nenhum relato ainda.</p>}</div></section>}

function CreateLabModal({onClose,onSave}:{onClose:()=>void;onSave:(name:string,description:string)=>Promise<void>}){const[name,setName]=useState('');const[description,setDescription]=useState('');const[busy,setBusy]=useState(false);return <GovernanceModal title="Criar laboratório" onClose={onClose}><div className="modal-form"><label>Nome<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Descrição<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy||!name.trim()} onClick={async()=>{setBusy(true);try{await onSave(name,description)}finally{setBusy(false)}}}>{busy?'Criando…':'Criar laboratório'}</button></div></div></GovernanceModal>}

function GeneratedInviteModal({person,url,expiresAt,onClose}:{person:InstitutionalPerson;url:string;expiresAt:string;onClose:()=>void}){const[copied,setCopied]=useState(false);return <GovernanceModal title="Link de invite" onClose={onClose}><div className="modal-form"><div className="identity-chip"><strong>{person.display_name}</strong><span>Válido até {new Date(expiresAt).toLocaleString('pt-BR')}</span></div><label>Link seguro<textarea value={url} readOnly/></label><p className="muted">Este link é exibido somente nesta geração; o banco guarda apenas o hash do token.</p><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button" onClick={async()=>{await navigator.clipboard.writeText(url);setCopied(true)}}>{copied?'Copiado!':'Copiar link'}</button></div></div></GovernanceModal>}
