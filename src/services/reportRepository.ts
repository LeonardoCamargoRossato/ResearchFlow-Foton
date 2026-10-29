import type { ResearchReport } from '../models/ResearchReport'
import { supabase } from './supabase'

const BUCKET = 'research-audio'

type DbReport = {
  id: string
  user_id: string
  researcher_name: string
  created_at: string
  recording_date: string
  duration_seconds: number
  audio_path: string | null
  audio_mime_type: string | null
  transcript: string
  transcript_status: ResearchReport['transcriptStatus']
  status: ResearchReport['status']
  period_type: 'weekly'
  period_start: string | null
  period_end: string | null
  tag: string
  deleted_by_researcher: boolean
}

const requireClient = () => {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

const extensionFor = (mime = '') => mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'

const toModel = async (row: DbReport): Promise<ResearchReport> => {
  const client = requireClient()
  let audioUrl: string | undefined
  if (row.audio_path) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(row.audio_path, 3600)
    if (error) throw error
    audioUrl = data?.signedUrl
  }
  return {
    id: row.id,
    researcherId: row.user_id,
    researcherName: row.researcher_name,
    createdAt: row.created_at,
    recordingDate: row.recording_date,
    recordingTime: row.recording_date,
    durationSeconds: row.duration_seconds,
    audioPath: row.audio_path ?? undefined,
    audioUrl,
    audioMimeType: row.audio_mime_type ?? undefined,
    transcript: row.transcript,
    transcriptStatus: row.transcript_status,
    status: row.status,
    periodType: row.period_type,
    periodStart: row.period_start ?? undefined,
    periodEnd: row.period_end ?? undefined,
    tag: row.tag,
    deletedByResearcher: row.deleted_by_researcher
  }
}

export const reportRepository = {
  async list(userId: string): Promise<ResearchReport[]> {
    const client = requireClient()
    if (!userId) return []

    const { data, error } = await client.rpc('researchflow_list_my_reports')
    if (error) throw error
    return Promise.all(((data ?? []) as DbReport[]).map(toModel))
  },

  async create(report: ResearchReport): Promise<void> {
    const client = requireClient()
    if (!report.audioBlob) throw new Error('Áudio não encontrado.')

    const audioPath = `${report.researcherId}/${report.id}.${extensionFor(report.audioMimeType)}`
    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(audioPath, report.audioBlob, { contentType: report.audioMimeType, upsert: false })
    if (uploadError) throw uploadError

    const { error } = await client.rpc('researchflow_create_my_report', {
      p_id: report.id,
      p_researcher_name: report.researcherName,
      p_created_at: report.createdAt,
      p_recording_date: report.recordingDate,
      p_duration_seconds: Math.round(report.durationSeconds),
      p_audio_path: audioPath,
      p_audio_mime_type: report.audioMimeType ?? null,
      p_transcript: report.transcript,
      p_transcript_status: report.transcriptStatus,
      p_period_start: report.periodStart ?? null,
      p_period_end: report.periodEnd ?? null,
      p_tag: report.tag
    })

    if (error) {
      await client.storage.from(BUCKET).remove([audioPath])
      throw error
    }
  },

  async updateTranscript(report: ResearchReport): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_update_my_transcript', {
      p_report_id: report.id,
      p_transcript: report.transcript
    })
    if (error) throw error
  },

  async softDelete(report: ResearchReport): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_soft_delete_my_report', {
      p_report_id: report.id
    })
    if (error) throw error
  }
}
