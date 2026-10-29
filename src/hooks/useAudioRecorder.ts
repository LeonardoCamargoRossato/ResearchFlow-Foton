import { useEffect, useRef, useState } from 'react'
import { createLiveTranscription } from '../services/transcriptionService'

export type RecorderState = 'idle' | 'recording' | 'recorded' | 'error'

export const useAudioRecorder = () => {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [transcript, setTranscript] = useState('')
  const [transcriptionSupported, setTranscriptionSupported] = useState(true)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const transcriptionRef = useRef<ReturnType<typeof createLiveTranscription> | null>(null)

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const clearTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador não oferece suporte à gravação de áudio necessária para o ResearchFlow.')
      setState('error')
      return
    }

    try {
      setError('')
      setTranscript('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      setElapsed(0)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous)
          return URL.createObjectURL(blob)
        })
        stopTracks()
        clearTimer()
        setState('recorded')
      }

      const transcription = createLiveTranscription(setTranscript)
      transcriptionRef.current = transcription
      setTranscriptionSupported(transcription.supported)
      transcription.start()

      recorder.start(500)
      setState('recording')
      timerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    } catch (caught) {
      const message = caught instanceof DOMException && caught.name === 'NotAllowedError'
        ? 'Não foi possível acessar o microfone. Verifique a permissão do navegador e tente novamente.'
        : 'Ocorreu um erro ao iniciar a gravação. Verifique o microfone e tente novamente.'
      setError(message)
      setState('error')
      stopTracks()
    }
  }

  const stop = () => {
    transcriptionRef.current?.stop()
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  const reset = () => {
    transcriptionRef.current?.stop()
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    stopTracks()
    clearTimer()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setElapsed(0)
    setTranscript('')
    setError('')
    setState('idle')
  }

  useEffect(() => () => {
    stopTracks()
    clearTimer()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  return {
    state, elapsed, audioBlob, audioUrl, error, transcript, setTranscript,
    transcriptionSupported, start, stop, reset
  }
}
