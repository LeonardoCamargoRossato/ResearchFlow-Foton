import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { currentResearcher } from './config/researcher'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import type { ResearchReport } from './models/ResearchReport'
import { reportRepository } from './services/reportRepository'
import { createReportIdentity, formatDate, formatDuration, formatTime } from './utils/report'

type Filter = 'all' | 'month' | 'year'
type Sort = 'newest' | 'oldest'
type IconName = 'mic' | 'stop' | 'play' | 'pause' | 'save' | 'redo' | 'file' | 'trash' | 'search' | 'edit' | 'close' | 'check'

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
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    close: <path d="M18 6 6 18M6 6l12 12"/>,
    check: <path d="m5 12 4 4L19 6"/>
  }
  return <svg {...common}>{paths[name]}</svg>
}

const AudioPlayer = ({ blob, compact = false }: { blob?: Blob; compact?: boolean }) => {
  const [url, setUrl] = useState('')
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!blob) return
    const nextUrl = URL.createObjectURL(blob)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [blob])

  useEffect(() => {
    const pauseWhenAnotherStarts = (event: Event) => {
      const detail = (event as CustomEvent<HTMLAudioElement>).detail
      if (ref.current && detail !== ref.current && !ref.current.paused) ref.current.pause()
    }
    window.addEventListener('researchflow:audio-play', pauseWhenAnotherStarts)
    return () => window.removeEventListener('researchflow:audio-play', pauseWhenAnotherStarts)
  }, [])

  if (!blob) return <span className="muted">Áudio indisponível</span>

  const toggle = () => {
    const audio = ref.current
    if (!audio) return
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent('researchflow:audio-play', { detail: audio }))
      void audio.play()
    } else audio.pause()
  }

  const progress = duration ? (current / duration) * 100 : 0

  return (
    <div className={`audio-player ${compact ? 'compact' : ''}`}>
      <audio ref={ref} src={url} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)} onEnded={() => setPlaying(false)} />
      <button className="icon-button" onClick={toggle} aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}><Icon name={playing ? 'pause' : 'play'} size={18} /></button>
      <span className="timecode">{formatDuration(current)} / {formatDuration(duration || 0)}</span>
      <div className="progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
    </div>
  )
}

function App() {
  const recorder = useAudioRecorder()
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [selected, setSelected] = useState<ResearchReport | null>(null)
  const [draftTranscriptOpen, setDraftTranscriptOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setReports(await reportRepository.list())
    setLoading(false)
  }

  useEffect(() => { void reload() }, [])

  const visibleReports = useMemo(() => {
    const now = new Date()
    const needle = query.trim().toLowerCase()
    return [...reports].filter((report) => {
      const created = new Date(report.createdAt)
      const matchesQuery = !needle || [report.tag, report.researcherName, report.transcript].some((value) => value.toLowerCase().includes(needle))
      const matchesPeriod = filter === 'all' || (filter === 'month' && created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear()) || (filter === 'year' && created.getFullYear() === now.getFullYear())
      return matchesQuery && matchesPeriod
    }).sort((a, b) => sort === 'newest' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt))
  }, [reports, query, filter, sort])

  const saveDraft = async () => {
    if (!recorder.audioBlob) return
    const identity = createReportIdentity()
    const now = new Date(identity.createdAt)
    const report: ResearchReport = {
      ...identity,
      researcherId: currentResearcher.id,
      researcherName: currentResearcher.name,
      recordingDate: identity.createdAt,
      recordingTime: identity.createdAt,
      durationSeconds: recorder.elapsed,
      audioBlob: recorder.audioBlob,
      audioMimeType: recorder.audioBlob.type,
      transcript: recorder.transcript,
      transcriptStatus: recorder.transcript.trim() ? 'generated' : 'pending',
      status: 'saved',
      periodType: 'weekly',
      periodStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1).toISOString(),
      periodEnd: new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 7).toISOString(),
      tag: identity.tag
    }
    await reportRepository.save(report)
    await reload()
    setMessage(`Relato ${report.tag} salvo com sucesso.`)
    recorder.reset()
    setDraftTranscriptOpen(false)
    window.setTimeout(() => setMessage(''), 3500)
  }

  const discardDraft = () => {
    if (recorder.state === 'recorded' && !window.confirm('Descartar esta gravação e começar novamente?')) return
    recorder.reset()
    setDraftTranscriptOpen(false)
  }

  const updateSelected = async () => {
    if (!selected) return
    const updated = { ...selected, transcriptStatus: 'edited' as const }
    await reportRepository.save(updated)
    setSelected(updated)
    await reload()
    setMessage('Transcrição atualizada.')
    window.setTimeout(() => setMessage(''), 3000)
  }

  const deleteReport = async (report: ResearchReport) => {
    if (!window.confirm(`Excluir ${report.tag} da sua biblioteca?`)) return
    await reportRepository.softDelete(report)
    if (selected?.id === report.id) setSelected(null)
    await reload()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">RF</div>
        <div><h1>ResearchFlow</h1><p>Instituto Foton</p></div>
        <nav className="topnav" aria-label="Navegação principal"><a href="#novo">Novo relato</a><a href="#relatos">Meus relatos</a></nav>
      </header>

      <main>
        <section className="hero" id="novo">
          <span className="eyebrow">Relato da semana</span>
          <h2>Conte o que aconteceu na sua pesquisa.</h2>
          <p className="hero-copy">Relatos simples para acompanhar a evolução da pesquisa, sem transformar sua semana em mais um formulário.</p>
          <div className="questions">
            <div><span>01</span><h3>O que você fez durante esta semana?</h3></div>
            <div><span>02</span><h3>O que você pretende fazer na próxima semana?</h3></div>
          </div>
          <p className="guidance">Grave um relato informal incluindo atividades, testes, resultados, dificuldades, decisões, reuniões, leituras, experimentos, códigos, documentos, próximos passos e bloqueios importantes.</p>
          <p className="time-note">Tempo sugerido: 3 a 10 minutos. Se precisar de mais tempo, não há problema.</p>
        </section>

        <section className={`recorder-card ${recorder.state}`} aria-live="polite">
          <div className="recorder-main">
            <button className="record-button" onClick={recorder.state === 'recording' ? recorder.stop : recorder.start} disabled={recorder.state === 'recorded'} aria-label={recorder.state === 'recording' ? 'Finalizar gravação' : 'Gravar relato'}><Icon name={recorder.state === 'recording' ? 'stop' : 'mic'} size={34} /></button>
            <div>
              <p className="recorder-label">{recorder.state === 'recording' ? 'Gravando' : recorder.state === 'recorded' ? 'Gravação concluída' : 'Pronto para gravar'}</p>
              <h3>{recorder.state === 'recording' ? 'Finalizar gravação' : recorder.state === 'recorded' ? 'Revise antes de salvar' : 'Gravar relato'}</h3>
              <p className="muted">{recorder.state === 'recording' ? 'Fale naturalmente. O cronômetro continua enquanto você grava.' : 'Seu áudio permanece neste navegador na V0.'}</p>
            </div>
          </div>

          <div className="recording-visual">
            <div className={`waveform ${recorder.state === 'recording' ? 'active' : ''}`} aria-hidden="true">{Array.from({ length: 19 }).map((_, index) => <i key={index} style={{ animationDelay: `${index * 60}ms` }} />)}</div>
            <strong>{formatDuration(recorder.elapsed)}</strong>
          </div>

          {recorder.error && <div className="error-banner">{recorder.error}</div>}

          {recorder.state === 'recorded' && (
            <div className="review-panel">
              <AudioPlayer blob={recorder.audioBlob ?? undefined} />
              <div className="review-actions">
                <button className="secondary-button" onClick={() => setDraftTranscriptOpen((value) => !value)}><Icon name="file" size={18}/> Ver transcrição</button>
                <button className="secondary-button" onClick={discardDraft}><Icon name="redo" size={18}/> Refazer áudio</button>
                <button className="primary-button" onClick={() => void saveDraft()}><Icon name="save" size={18}/> Salvar relato</button>
              </div>
              {draftTranscriptOpen && (
                <div className="draft-transcript">
                  <div className="section-title-row"><div><span className="eyebrow">Transcrição do áudio</span><h4>Revise o texto antes de salvar</h4></div><button className="icon-button" onClick={() => setDraftTranscriptOpen(false)} aria-label="Fechar transcrição"><Icon name="close"/></button></div>
                  {!recorder.transcriptionSupported && <p className="support-note">A transcrição automática do navegador não está disponível aqui. Você ainda pode escrever ou corrigir manualmente o relato.</p>}
                  <textarea value={recorder.transcript} onChange={(event) => recorder.setTranscript(event.target.value)} placeholder="A transcrição aparecerá aqui quando o navegador oferecer suporte. Você também pode escrever e corrigir este texto manualmente." rows={9} />
                </div>
              )}
            </div>
          )}
        </section>

        {message && <div className="toast"><Icon name="check" size={18}/>{message}</div>}

        <section className="library" id="relatos">
          <div className="library-heading"><div><span className="eyebrow">Biblioteca pessoal</span><h2>Meus Relatos</h2><p>Áudios e transcrições salvos neste navegador.</p></div><div className="library-count">{reports.length} {reports.length === 1 ? 'relato' : 'relatos'}</div></div>

          <div className="toolbar">
            <label className="search-box"><Icon name="search" size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar relatos" /></label>
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Filtrar período"><option value="all">Todos</option><option value="month">Este mês</option><option value="year">Este ano</option></select>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar relatos"><option value="newest">Mais recentes</option><option value="oldest">Mais antigos</option></select>
          </div>

          {loading ? <div className="empty-state">Carregando biblioteca…</div> : visibleReports.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Icon name="file" size={30}/></div>
              <h3>{reports.length ? 'Nenhum relato encontrado.' : 'Nenhum relato registrado ainda.'}</h3>
              <p>{reports.length ? 'Ajuste a busca ou os filtros.' : 'Seu primeiro relato aparecerá aqui depois que você salvar uma gravação.'}</p>
              {!reports.length && <a className="primary-button link-button" href="#novo"><Icon name="mic" size={18}/> Gravar primeiro relato</a>}
            </div>
          ) : (
            <div className="report-table-wrap">
              <table className="report-table">
                <thead><tr><th>Relato</th><th>Data</th><th>Horário</th><th>Duração</th><th>Pesquisador</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody>{visibleReports.map((report) => (
                  <tr key={report.id} onDoubleClick={() => setSelected(report)}>
                    <td data-label="Relato"><button className="report-link" onClick={() => setSelected(report)}>{report.tag}</button></td>
                    <td data-label="Data">{formatDate(report.createdAt)}</td>
                    <td data-label="Horário">{formatTime(report.createdAt)}</td>
                    <td data-label="Duração">{formatDuration(report.durationSeconds)}</td>
                    <td data-label="Pesquisador">{report.researcherName}</td>
                    <td data-label="Status"><span className="status-pill">Salvo</span></td>
                    <td data-label="Ações"><div className="row-actions"><AudioPlayer blob={report.audioBlob} compact/><button className="icon-button" onClick={() => setSelected(report)} aria-label="Abrir relato"><Icon name="file" size={17}/></button><button className="icon-button danger" onClick={() => void deleteReport(report)} aria-label="Excluir relato"><Icon name="trash" size={17}/></button></div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer><span>ResearchFlow V0</span><span>Instituto Foton</span></footer>

      {selected && (
        <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <aside className="drawer" aria-modal="true" role="dialog" aria-label={`Relato ${selected.tag}`}>
            <div className="drawer-header"><div><span className="eyebrow">Relato</span><h2>{selected.tag}</h2></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Fechar"><Icon name="close"/></button></div>
            <div className="detail-grid"><div><span>Pesquisador</span><strong>{selected.researcherName}</strong></div><div><span>Data</span><strong>{formatDate(selected.createdAt)} · {formatTime(selected.createdAt)}</strong></div><div><span>Duração</span><strong>{formatDuration(selected.durationSeconds)}</strong></div><div><span>Status</span><strong>Salvo</strong></div></div>
            <div className="detail-section"><span className="eyebrow">Áudio</span><AudioPlayer blob={selected.audioBlob}/></div>
            <div className="detail-section transcript-section">
              <div className="section-title-row"><div><span className="eyebrow">Transcrição</span><h3>Leia, corrija e complemente</h3></div><Icon name="edit" size={20}/></div>
              <textarea value={selected.transcript} onChange={(e) => setSelected({ ...selected, transcript: e.target.value })} placeholder="A transcrição deste relato aparecerá aqui. Você pode corrigir nomes, termos técnicos e complementar a interpretação." rows={14}/>
              <button className="primary-button" onClick={() => void updateSelected()}><Icon name="save" size={18}/> Salvar alterações</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
