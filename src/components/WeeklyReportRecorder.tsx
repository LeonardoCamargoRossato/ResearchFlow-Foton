import { useRef, useState } from 'react'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import type { TranscriptStatus } from '../models/ResearchReport'
import { createReportIdentity, formatDuration } from '../utils/report'

export type WeeklyReportDraft = {
  id: string
  tag: string
  createdAt: string
  recordingDate: string
  durationSeconds: number
  audioBlob: Blob
  audioMimeType: string
  transcript: string
  transcriptStatus: TranscriptStatus
  periodStart: string
  periodEnd: string
}

type Props = {
  heading?: string
  eyebrow?: string
  contextText: string
  onSave: (draft: WeeklyReportDraft) => Promise<void>
  successText?: string
}

function RecorderIcon({ name }: { name: 'mic' | 'stop' | 'file' | 'redo' | 'save' | 'play' }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths = {
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2"/>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>,
    redo: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></>,
    save: <><path d="M5 21h14a2 2 0 0 0 2-2V7l-4-4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"/><path d="M7 3v6h10V3M8 21v-8h8v8"/></>,
    play: <path d="m8 5 11 7-11 7Z"/>
  }
  return <svg {...common}>{paths[name]}</svg>
}

function PreviewAudio({ blob, duration }: { blob: Blob; duration: number }) {
  const [url] = useState(() => URL.createObjectURL(blob))
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  return <div className="weekly-preview-audio">
    <audio ref={audioRef} src={url} onEnded={()=>setPlaying(false)} onPause={()=>setPlaying(false)} onPlay={()=>setPlaying(true)}/>
    <button className="secondary-button" onClick={()=>{
      const audio=audioRef.current
      if(!audio) return
      if(audio.paused) void audio.play(); else audio.pause()
    }}><RecorderIcon name="play"/>{playing?'Pausar áudio':'Reescutar áudio'}</button>
    <span>{formatDuration(duration)}</span>
  </div>
}

export function WeeklyReportRecorder({
  heading='O que aconteceu na sua pesquisa?',
  eyebrow='Relato da semana',
  contextText,
  onSave,
  successText='Relato salvo com sucesso.'
}: Props) {
  const recorder=useAudioRecorder()
  const [transcriptOpen,setTranscriptOpen]=useState(false)
  const [manualTranscript,setManualTranscript]=useState(false)
  const [busy,setBusy]=useState(false)
  const [feedback,setFeedback]=useState('')
  const [saveError,setSaveError]=useState('')

  const save=async()=>{
    if(!recorder.audioBlob||busy) return
    const identity=createReportIdentity()
    const now=new Date(identity.createdAt)
    const draft:WeeklyReportDraft={
      ...identity,
      recordingDate:identity.createdAt,
      durationSeconds:recorder.elapsed,
      audioBlob:recorder.audioBlob,
      audioMimeType:recorder.audioBlob.type,
      transcript:recorder.transcript,
      transcriptStatus:manualTranscript?'edited':recorder.transcript.trim()?'generated':'pending',
      periodStart:new Date(now.getFullYear(),now.getMonth(),now.getDate()-now.getDay()+1).toISOString(),
      periodEnd:new Date(now.getFullYear(),now.getMonth(),now.getDate()-now.getDay()+7).toISOString()
    }
    setBusy(true);setSaveError('');setFeedback('')
    try{
      await onSave(draft)
      recorder.reset()
      setTranscriptOpen(false)
      setManualTranscript(false)
      setFeedback(successText)
      window.setTimeout(()=>setFeedback(''),3500)
    }catch(e){
      setSaveError(e instanceof Error?e.message:'Não foi possível salvar o relato.')
    }finally{setBusy(false)}
  }

  const automaticUnavailable=!recorder.transcriptionSupported || (recorder.state==='recorded' && !recorder.transcript.trim())

  return <>
    <section className="hero compact-hero weekly-recorder-hero">
      <span className="eyebrow">{eyebrow}</span><h2>{heading}</h2>
      <div className="questions"><div><span>01</span><h3>O que você fez durante esta semana?</h3></div><div><span>02</span><h3>O que você pretende fazer na próxima semana?</h3></div></div>
    </section>

    <section className={`recorder-card ${recorder.state} weekly-report-recorder`} aria-live="polite">
      <div className="recorder-main">
        <button className="record-button" onClick={recorder.state==='recording'?recorder.stop:recorder.start} disabled={recorder.state==='recorded'} aria-label={recorder.state==='recording'?'Finalizar gravação':'Gravar relato'}>
          <RecorderIcon name={recorder.state==='recording'?'stop':'mic'}/>
        </button>
        <div><p className="recorder-label">{recorder.state==='recording'?'Gravando':recorder.state==='recorded'?'Gravação concluída':'Pronto para gravar'}</p><h3>{recorder.state==='recording'?'Finalizar gravação':recorder.state==='recorded'?'Revise antes de salvar':'Gravar relato'}</h3><p className="muted">{recorder.state==='recording'?'Fale naturalmente. O cronômetro continua enquanto você grava.':'Toque no microfone e faça seu relato semanal.'}</p></div>
      </div>
      <div className="recording-visual"><div className={`waveform ${recorder.state==='recording'?'active':''}`}>{Array.from({length:19}).map((_,i)=><i key={i} style={{animationDelay:`${i*60}ms`}}/>)}</div><strong>{formatDuration(recorder.elapsed)}</strong></div>
      {recorder.error&&<div className="error-banner">{recorder.error}</div>}
      {saveError&&<div className="error-banner">{saveError}</div>}
      {feedback&&<div className="success-banner">{feedback}</div>}

      {recorder.state==='recorded'&&recorder.audioBlob&&<div className="review-panel">
        <PreviewAudio blob={recorder.audioBlob} duration={recorder.elapsed}/>
        <div className="review-actions">
          <button className="secondary-button" onClick={()=>setTranscriptOpen(v=>!v)}><RecorderIcon name="file"/> Ver transcrição</button>
          <button className="secondary-button" onClick={()=>{if(window.confirm('Descartar esta gravação e começar novamente?')){recorder.reset();setTranscriptOpen(false);setManualTranscript(false)}}}><RecorderIcon name="redo"/> Refazer áudio</button>
          <button className="primary-button" disabled={busy} onClick={()=>void save()}><RecorderIcon name="save"/> {busy?'Salvando…':'Salvar relato'}</button>
        </div>
        {transcriptOpen&&<div className="draft-transcript">
          <div className="section-title-row"><div><span className="eyebrow">Transcrição</span><h4>Revise o texto antes de salvar</h4></div></div>
          {automaticUnavailable&&<p className="support-note"><strong>Transcrição automática indisponível neste dispositivo.</strong><br/>Adicione a transcrição manualmente abaixo. O texto será salvo junto com o relato.</p>}
          <textarea value={recorder.transcript} onChange={e=>{setManualTranscript(true);recorder.setTranscript(e.target.value)}} rows={8} placeholder="Adicionar transcrição manualmente…"/>
        </div>}
      </div>}
      <div className="recorder-guidance"><p>{contextText}</p><strong>Tempo sugerido: 3 a 10 minutos.</strong></div>
    </section>
  </>
}
