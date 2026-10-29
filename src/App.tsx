import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Session } from '@supabase/supabase-js'
import { WeeklyReportRecorder, type WeeklyReportDraft } from './components/WeeklyReportRecorder'
import type { ResearchReport } from './models/ResearchReport'
import { reportRepository } from './services/reportRepository'
import { authService, supabase, supabaseConfigured } from './services/supabase'
import { formatDate, formatDuration, formatTime } from './utils/report'

type Filter = 'all' | 'month' | 'year'
type Sort = 'newest' | 'oldest'
type IconName = 'play' | 'pause' | 'save' | 'file' | 'trash' | 'search' | 'close' | 'logout' | 'google'

const Icon = ({ name, size = 20 }: { name: IconName; size?: number }) => {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<IconName, ReactElement> = {
    play: <path d="m8 5 11 7-11 7Z"/>,
    pause: <><path d="M9 5v14M15 5v14"/></>,
    save: <><path d="M5 21h14a2 2 0 0 0 2-2V7l-4-4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"/><path d="M7 3v6h10V3M8 21v-8h8v8"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    close: <path d="M18 6 6 18M6 6l12 12"/>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></>,
    google: <><circle cx="12" cy="12" r="9"/><path d="M21 12h-9M12 12v4"/></>
  }
  return <svg {...common}>{paths[name]}</svg>
}

const AudioPlayer = ({ url, compact = false, durationHint = 0 }: { url?: string; compact?: boolean; durationHint?: number }) => {
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(durationHint)
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if ((!Number.isFinite(duration) || duration <= 0) && durationHint > 0) setDuration(durationHint)
  }, [durationHint, duration])

  useEffect(() => {
    const pauseOther = (event: Event) => {
      const other = (event as CustomEvent<HTMLAudioElement>).detail
      if (ref.current && other !== ref.current && !ref.current.paused) ref.current.pause()
    }
    window.addEventListener('researchflow:audio-play', pauseOther)
    return () => window.removeEventListener('researchflow:audio-play', pauseOther)
  }, [])

  if (!url) return <span className="muted">Áudio indisponível</span>
  const toggle = () => {
    const audio = ref.current
    if (!audio) return
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent('researchflow:audio-play', { detail: audio }))
      void audio.play()
    } else audio.pause()
  }
  const effectiveDuration = Number.isFinite(duration) && duration > 0 ? duration : durationHint
  const progress = effectiveDuration ? Math.min(100, (current / effectiveDuration) * 100) : 0
  const syncDuration = (value: number) => {
    if (Number.isFinite(value) && value > 0) setDuration(value)
    else if (durationHint > 0) setDuration(durationHint)
  }
  return <div className={`audio-player ${compact ? 'compact' : ''}`}>
    <audio ref={ref} src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)} onLoadedMetadata={(e) => syncDuration(e.currentTarget.duration)} onDurationChange={(e) => syncDuration(e.currentTarget.duration)} onEnded={() => setPlaying(false)} />
    <button className="icon-button" onClick={toggle} aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}><Icon name={playing ? 'pause' : 'play'} size={18}/></button>
    <span className="timecode">{formatDuration(current)} / {formatDuration(effectiveDuration)}</span>
    <div className="progress-track"><span style={{ width: `${progress}%` }}/></div>
  </div>
}

const LoginPage = ({ onLogin, error }: { onLogin: () => void; error: string }) => <div className="login-page">
  <div className="login-brand"><div className="brand-mark">RF</div><div><strong>ResearchFlow</strong><span>Instituto Foton</span></div></div>
  <main className="login-grid">
    <section className="login-story">
      <span className="eyebrow">Pesquisa sem burocracia</span>
      <h1>Relatos simples para acompanhar a evolução da pesquisa.</h1>
      <p>Registre em áudio o que você fez nesta semana e o que pretende desenvolver na próxima. O ResearchFlow organiza seus relatos em uma biblioteca pessoal.</p>
      <div className="login-flow"><span>1</span><b>Grave</b><i/><span>2</span><b>Revise</b><i/><span>3</span><b>Acompanhe</b></div>
      <div className="login-questions"><p>O que você fez durante esta semana?</p><p>O que você pretende fazer na próxima semana?</p></div>
    </section>
    <section className="login-card">
      <span className="eyebrow">Instituto Foton</span>
      <h2>Bem-vindo ao ResearchFlow</h2>
      <p>Entre com sua conta Google para acessar seu ambiente e sua biblioteca pessoal de pesquisa.</p>
      <button className="google-button" onClick={onLogin} disabled={!supabaseConfigured}><Icon name="google"/> <span className="login-button-label">Entrar</span></button>
      {!supabaseConfigured && <div className="config-warning"><strong>Configuração do Supabase pendente.</strong><span>O aplicativo já está preparado. Adicione as variáveis do Supabase no GitHub para habilitar o login.</span></div>}
      {error && <div className="error-banner">{error}</div>}
      <small>Seus relatos ficam associados à conta autenticada e protegidos por políticas de acesso.</small>
    </section>
  </main>
  <footer><span>ResearchFlow · Instituto Foton</span><span>Pesquisa • Ciência • Tecnologia</span></footer>
</div>

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [selected, setSelected] = useState<ResearchReport | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void authService.getSession().then(setSession).catch(() => setAuthError('Não foi possível verificar sua sessão.')).finally(() => setAuthLoading(false))
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  const user = session?.user
  const researcherName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Pesquisador')
  const avatarUrl = String(user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '')

  const reload = async () => {
    if (!user) return
    setLoading(true)
    try {
      setReports(await reportRepository.list(user.id))
      setMessage('')
    } catch {
      setMessage('Não foi possível carregar sua biblioteca. Verifique a configuração do Supabase.')
    } finally { setLoading(false) }
  }

  useEffect(() => { if (user) void reload(); else setReports([]) }, [user?.id])

  const visibleReports = useMemo(() => {
    const now = new Date(), needle = query.trim().toLowerCase()
    return [...reports].filter((report) => {
      const created = new Date(report.createdAt)
      const textMatch = !needle || [report.tag, report.researcherName, report.transcript].some((v) => v.toLowerCase().includes(needle))
      const dateMatch = filter === 'all' || (filter === 'month' && created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()) || (filter === 'year' && created.getFullYear() === now.getFullYear())
      return textMatch && dateMatch
    }).sort((a,b) => sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt))
  }, [reports, query, filter, sort])

  const saveResearcherDraft = async (draft: WeeklyReportDraft) => {
    if (!user) throw new Error('Sessão do pesquisador indisponível.')
    const report: ResearchReport = {
      id:draft.id,
      tag:draft.tag,
      createdAt:draft.createdAt,
      researcherId:user.id,
      researcherName,
      recordingDate:draft.recordingDate,
      recordingTime:draft.recordingDate,
      durationSeconds:draft.durationSeconds,
      audioBlob:draft.audioBlob,
      audioMimeType:draft.audioMimeType,
      transcript:draft.transcript,
      transcriptStatus:draft.transcriptStatus,
      status:'saved',
      periodType:'weekly',
      periodStart:draft.periodStart,
      periodEnd:draft.periodEnd
    }
    await reportRepository.create(report)
    await reload()
  }

  const updateSelected = async () => {
    if (!selected) return
    const updated = { ...selected, transcriptStatus: 'edited' as const }
    try { await reportRepository.updateTranscript(updated); setSelected(updated); await reload(); setMessage('Transcrição atualizada.') }
    catch { setMessage('Não foi possível salvar a transcrição.') }
  }

  const deleteReport = async (report: ResearchReport) => {
    if (!window.confirm(`Excluir ${report.tag} da sua biblioteca?`)) return
    await reportRepository.softDelete(report); if (selected?.id === report.id) setSelected(null); await reload()
  }

  const signIn = () => { setAuthError(''); void authService.signInWithGoogle().catch((e) => setAuthError(e instanceof Error ? e.message : 'Falha ao entrar com Google.')) }
  if (authLoading) return <div className="app-loading">Carregando ResearchFlow…</div>
  if (!session) return <LoginPage onLogin={signIn} error={authError}/>

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark">RF</div><div><h1>ResearchFlow</h1><p>Instituto Foton</p></div>
      <nav className="topnav"><a href="#novo">Novo relato</a><a href="#relatos">Meus relatos</a></nav>
      <div className="user-area">{avatarUrl ? <img src={avatarUrl} alt="Foto do perfil" referrerPolicy="no-referrer"/> : <div className="avatar-fallback">{researcherName.slice(0,1)}</div>}<div className="user-copy"><strong>{researcherName}</strong><span>{user?.email}</span></div><button className="icon-button" onClick={() => void authService.signOut()} title="Sair"><Icon name="logout" size={18}/></button></div>
    </header>

    <main>
      <div id="novo">
        <WeeklyReportRecorder
          contextText="Grave um relato informal incluindo atividades, testes, resultados, dificuldades, decisões, reuniões, leituras, experimentos, códigos, documentos, próximos passos e bloqueios importantes."
          onSave={saveResearcherDraft}
        />
      </div>

      {message && <div className="toast">{message}</div>}
      <section className="library" id="relatos"><div className="library-heading"><div><span className="eyebrow">Biblioteca pessoal</span><h2>Meus Relatos</h2><p>Áudios e transcrições vinculados à sua conta.</p></div><div className="library-count">{reports.length} {reports.length===1?'relato':'relatos'}</div></div>
        <div className="toolbar"><label className="search-box"><Icon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar relatos"/></label><select value={filter} onChange={e=>setFilter(e.target.value as Filter)}><option value="all">Todos</option><option value="month">Este mês</option><option value="year">Este ano</option></select><select value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option></select></div>
        {loading ? <div className="empty-state">Carregando sua biblioteca…</div> : visibleReports.length===0 ? <div className="empty-state"><div className="empty-icon"><Icon name="file" size={30}/></div><h3>{reports.length?'Nenhum relato encontrado.':'Nenhum relato registrado ainda.'}</h3><p>{reports.length?'Ajuste a busca ou os filtros.':'Seu primeiro relato aparecerá aqui depois que você salvar uma gravação.'}</p></div> : <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Relato</th><th>Data</th><th>Horário</th><th>Duração</th><th>Status</th><th>Áudio</th><th>Ações</th></tr></thead><tbody>{visibleReports.map(report=><tr key={report.id}><td data-label="Relato"><button className="report-link" onClick={()=>setSelected(report)}>{report.tag}</button></td><td data-label="Data">{formatDate(report.createdAt)}</td><td data-label="Horário">{formatTime(report.createdAt)}</td><td data-label="Duração">{formatDuration(report.durationSeconds)}</td><td data-label="Status"><span className="status-pill">Salvo</span></td><td data-label="Áudio"><AudioPlayer url={report.audioUrl} compact durationHint={report.durationSeconds}/></td><td data-label="Ações"><div className="row-actions"><button className="secondary-button mini" onClick={()=>setSelected(report)}>Abrir</button><button className="icon-button danger" onClick={()=>void deleteReport(report)}><Icon name="trash" size={16}/></button></div></td></tr>)}</tbody></table></div>}
      </section>
    </main>

    <footer><span>ResearchFlow · Instituto Foton</span><span>Biblioteca protegida por conta</span></footer>
    {selected && <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="drawer"><div className="drawer-header"><div><span className="eyebrow">Relato</span><h2>{selected.tag}</h2></div><button className="icon-button" onClick={()=>setSelected(null)}><Icon name="close"/></button></div><div className="detail-grid"><div><span>Pesquisador</span><strong>{selected.researcherName}</strong></div><div><span>Data</span><strong>{formatDate(selected.createdAt)} · {formatTime(selected.createdAt)}</strong></div><div><span>Duração</span><strong>{formatDuration(selected.durationSeconds)}</strong></div><div><span>Status</span><strong>Salvo</strong></div></div><section className="detail-section"><span className="eyebrow">Áudio</span><AudioPlayer url={selected.audioUrl} durationHint={selected.durationSeconds}/></section><section className="detail-section transcript-section"><span className="eyebrow">Transcrição</span><textarea value={selected.transcript} onChange={e=>setSelected({...selected, transcript:e.target.value})} rows={12}/><button className="primary-button" onClick={()=>void updateSelected()}><Icon name="save" size={18}/> Salvar alterações</button></section></aside></div>}
  </div>
}

export default App
