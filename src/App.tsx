import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import type { ResearchReport } from './models/ResearchReport'
import { reportRepository } from './services/reportRepository'
import { authService, supabase, supabaseConfigured } from './services/supabase'
import { createReportIdentity, formatDate, formatDuration, formatTime } from './utils/report'

type Filter = 'all' | 'month' | 'year'
type Sort = 'newest' | 'oldest'
type IconName = 'mic' | 'stop' | 'play' | 'pause' | 'save' | 'redo' | 'file' | 'trash' | 'search' | 'close' | 'check' | 'logout' | 'google'

const Icon = ({ name, size = 20 }: { name: IconName; size?: number }) => {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<IconName, ReactElement> = {
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
    play: <path d="m8 5 11 7-11 7Z"/>,
    pause: <><path d="M9 5v14M15 5v14"/></>,
    save: <><path d="M5 21h14a2 2 0 0 0 2-2V7l-4-4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"/><path d="M7 3v6h10V3M8 21v-8h8v8"/></>,
    redo: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    close: <path d="M18 6 6 18M6 6l12 12"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></>,
    google: <><circle cx="12" cy="12" r="9"/><path d="M21 12h-9M12 12v4"/></>
  }
  return <svg {...common}>{paths[name]}</svg>
}

const AudioPlayer = ({ blob, url, compact = false }: { blob?: Blob; url?: string; compact?: boolean }) => {
  const [source, setSource] = useState(url ?? '')
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!blob) { setSource(url ?? ''); return }
    const nextUrl = URL.createObjectURL(blob)
    setSource(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [blob, url])

  useEffect(() => {
    const pauseOther = (event: Event) => {
      const other = (event as CustomEvent<HTMLAudioElement>).detail
      if (ref.current && other !== ref.current && !ref.current.paused) ref.current.pause()
    }
    window.addEventListener('researchflow:audio-play', pauseOther)
    return () => window.removeEventListener('researchflow:audio-play', pauseOther)
  }, [])

  if (!source) return <span className="muted">Áudio indisponível</span>
  const toggle = () => {
    const audio = ref.current
    if (!audio) return
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent('researchflow:audio-play', { detail: audio }))
      void audio.play()
    } else audio.pause()
  }
  const progress = duration ? (current / duration) * 100 : 0
  return <div className={`audio-player ${compact ? 'compact' : ''}`}>
    <audio ref={ref} src={source} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onEnded={() => setPlaying(false)} />
    <button className="icon-button" onClick={toggle} aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}><Icon name={playing ? 'pause' : 'play'} size={18}/></button>
    <span className="timecode">{formatDuration(current)} / {formatDuration(duration)}</span>
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
      <button className="google-button" onClick={onLogin} disabled={!supabaseConfigured}><Icon name="google"/> Entrar com Google</button>
      {!supabaseConfigured && <div className="config-warning"><strong>Configuração do Supabase pendente.</strong><span>O aplicativo já está preparado. Adicione as variáveis do Supabase no GitHub para habilitar o login.</span></div>}
      {error && <div className="error-banner">{error}</div>}
      <small>Seus relatos ficam associados à conta autenticada e protegidos por políticas de acesso.</small>
    </section>
  </main>
  <footer><span>ResearchFlow · Instituto Foton</span><span>Pesquisa • Ciência • Tecnologia</span></footer>
</div>

function App() {
  const recorder = useAudioRecorder()
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [selected, setSelected] = useState<ResearchReport | null>(null)
  const [draftTranscriptOpen, setDraftTranscriptOpen] = useState(false)
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
    try { setReports(await reportRepository.list(user.id)) }
    catch { setMessage('Não foi possível carregar sua biblioteca. Verifique a configuração do Supabase.') }
    finally { setLoading(false) }
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

  const saveDraft = async () => {
    if (!recorder.audioBlob || !user) return
    const identity = createReportIdentity(), now = new Date(identity.createdAt)
    const report: ResearchReport = {
      ...identity, researcherId: user.id, researcherName, recordingDate: identity.createdAt, recordingTime: identity.createdAt,
      durationSeconds: recorder.elapsed, audioBlob: recorder.audioBlob, audioMimeType: recorder.audioBlob.type,
      transcript: recorder.transcript, transcriptStatus: recorder.transcript.trim() ? 'generated' : 'pending', status: 'saved', periodType: 'weekly',
      periodStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1).toISOString(),
      periodEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 7).toISOString(), tag: identity.tag
    }
    try {
      await reportRepository.create(report)
      await reload()
      setMessage(`Relato ${report.tag} salvo na sua biblioteca.`)
      recorder.reset(); setDraftTranscriptOpen(false)
    } catch { setMessage('Não foi possível salvar o relato no Supabase. Confira tabela, Storage e políticas RLS.') }
    window.setTimeout(() => setMessage(''), 4500)
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
      <section className="hero compact-hero" id="novo">
        <span className="eyebrow">Relato da semana</span><h2>O que aconteceu na sua pesquisa?</h2>
        <div className="questions"><div><span>01</span><h3>O que você fez durante esta semana?</h3></div><div><span>02</span><h3>O que você pretende fazer na próxima semana?</h3></div></div>
      </section>

      <section className={`recorder-card ${recorder.state}`} aria-live="polite">
        <div className="recorder-main"><button className="record-button" onClick={recorder.state === 'recording' ? recorder.stop : recorder.start} disabled={recorder.state === 'recorded'}><Icon name={recorder.state === 'recording' ? 'stop' : 'mic'} size={34}/></button><div><p className="recorder-label">{recorder.state === 'recording' ? 'Gravando' : recorder.state === 'recorded' ? 'Gravação concluída' : 'Pronto para gravar'}</p><h3>{recorder.state === 'recording' ? 'Finalizar gravação' : recorder.state === 'recorded' ? 'Revise antes de salvar' : 'Gravar relato'}</h3><p className="muted">{recorder.state === 'recording' ? 'Fale naturalmente. O cronômetro continua enquanto você grava.' : 'Toque no microfone e faça seu relato semanal.'}</p></div></div>
        <div className="recording-visual"><div className={`waveform ${recorder.state === 'recording' ? 'active' : ''}`}>{Array.from({length:19}).map((_,i)=><i key={i} style={{animationDelay:`${i*60}ms`}}/>)}</div><strong>{formatDuration(recorder.elapsed)}</strong></div>
        {recorder.error && <div className="error-banner">{recorder.error}</div>}
        {recorder.state === 'recorded' && <div className="review-panel"><AudioPlayer blob={recorder.audioBlob ?? undefined}/><div className="review-actions"><button className="secondary-button" onClick={() => setDraftTranscriptOpen(v=>!v)}><Icon name="file" size={18}/> Ver transcrição</button><button className="secondary-button" onClick={() => { if(window.confirm('Descartar esta gravação e começar novamente?')) { recorder.reset(); setDraftTranscriptOpen(false) } }}><Icon name="redo" size={18}/> Refazer áudio</button><button className="primary-button" onClick={() => void saveDraft()}><Icon name="save" size={18}/> Salvar relato</button></div>{draftTranscriptOpen && <div className="draft-transcript"><div className="section-title-row"><div><span className="eyebrow">Transcrição</span><h4>Revise o texto antes de salvar</h4></div><button className="icon-button" onClick={()=>setDraftTranscriptOpen(false)}><Icon name="close"/></button></div>{!recorder.transcriptionSupported && <p className="support-note">A transcrição automática do navegador não está disponível. Você pode escrever ou corrigir manualmente.</p>}<textarea value={recorder.transcript} onChange={e=>recorder.setTranscript(e.target.value)} rows={8} placeholder="A transcrição aparecerá aqui quando disponível."/></div>}</div>}
        <div className="recorder-guidance"><p>Grave um relato informal incluindo atividades, testes, resultados, dificuldades, decisões, reuniões, leituras, experimentos, códigos, documentos, próximos passos e bloqueios importantes.</p><strong>Tempo sugerido: 3 a 10 minutos.</strong></div>
      </section>

      {message && <div className="toast"><Icon name="check" size={18}/>{message}</div>}
      <section className="library" id="relatos"><div className="library-heading"><div><span className="eyebrow">Biblioteca pessoal</span><h2>Meus Relatos</h2><p>Áudios e transcrições vinculados à sua conta.</p></div><div className="library-count">{reports.length} {reports.length===1?'relato':'relatos'}</div></div>
        <div className="toolbar"><label className="search-box"><Icon name="search" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar relatos"/></label><select value={filter} onChange={e=>setFilter(e.target.value as Filter)}><option value="all">Todos</option><option value="month">Este mês</option><option value="year">Este ano</option></select><select value={sort} onChange={e=>setSort(e.target.value as Sort)}><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option></select></div>
        {loading ? <div className="empty-state">Carregando sua biblioteca…</div> : visibleReports.length===0 ? <div className="empty-state"><div className="empty-icon"><Icon name="file" size={30}/></div><h3>{reports.length?'Nenhum relato encontrado.':'Nenhum relato registrado ainda.'}</h3><p>{reports.length?'Ajuste a busca ou os filtros.':'Seu primeiro relato aparecerá aqui depois que você salvar uma gravação.'}</p></div> : <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Relato</th><th>Data</th><th>Horário</th><th>Duração</th><th>Status</th><th>Áudio</th><th>Ações</th></tr></thead><tbody>{visibleReports.map(report=><tr key={report.id}><td data-label="Relato"><button className="report-link" onClick={()=>setSelected(report)}>{report.tag}</button></td><td data-label="Data">{formatDate(report.createdAt)}</td><td data-label="Horário">{formatTime(report.createdAt)}</td><td data-label="Duração">{formatDuration(report.durationSeconds)}</td><td data-label="Status"><span className="status-pill">Salvo</span></td><td data-label="Áudio"><AudioPlayer url={report.audioUrl} compact/></td><td data-label="Ações"><div className="row-actions"><button className="secondary-button mini" onClick={()=>setSelected(report)}>Abrir</button><button className="icon-button danger" onClick={()=>void deleteReport(report)}><Icon name="trash" size={16}/></button></div></td></tr>)}</tbody></table></div>}
      </section>
    </main>

    <footer><span>ResearchFlow · Instituto Foton</span><span>Biblioteca protegida por conta</span></footer>
    {selected && <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="drawer"><div className="drawer-header"><div><span className="eyebrow">Relato</span><h2>{selected.tag}</h2></div><button className="icon-button" onClick={()=>setSelected(null)}><Icon name="close"/></button></div><div className="detail-grid"><div><span>Pesquisador</span><strong>{selected.researcherName}</strong></div><div><span>Data</span><strong>{formatDate(selected.createdAt)} · {formatTime(selected.createdAt)}</strong></div><div><span>Duração</span><strong>{formatDuration(selected.durationSeconds)}</strong></div><div><span>Status</span><strong>Salvo</strong></div></div><section className="detail-section"><span className="eyebrow">Áudio</span><AudioPlayer url={selected.audioUrl}/></section><section className="detail-section transcript-section"><span className="eyebrow">Transcrição</span><textarea value={selected.transcript} onChange={e=>setSelected({...selected, transcript:e.target.value})} rows={12}/><button className="primary-button" onClick={()=>void updateSelected()}><Icon name="save" size={18}/> Salvar alterações</button></section></aside></div>}
  </div>
}

export default App
