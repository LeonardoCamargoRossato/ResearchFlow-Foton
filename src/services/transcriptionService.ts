export type LiveTranscription = {
  supported: boolean
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export const createLiveTranscription = (onText: (text: string) => void): LiveTranscription => {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
  if (!Recognition) return { supported: false, start: () => undefined, stop: () => undefined }

  const recognition = new Recognition()
  recognition.lang = 'pt-BR'
  recognition.continuous = true
  recognition.interimResults = true
  let finalText = ''

  recognition.onresult = (event) => {
    let interim = ''
    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i]
      if (result.isFinal) finalText += `${result[0].transcript.trim()} `
      else interim += result[0].transcript
    }
    onText(`${finalText}${interim}`.trim())
  }

  recognition.onerror = () => undefined
  return {
    supported: true,
    start: () => {
      try { recognition.start() } catch { /* already running */ }
    },
    stop: () => {
      try { recognition.stop() } catch { /* already stopped */ }
    }
  }
}
