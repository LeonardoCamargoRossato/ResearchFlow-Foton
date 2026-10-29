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
    const { data } = await client.storage.from(BUCKET).createSignedUrl(row.audio_path, 3600)
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
    const { data, error } = await client
      .from('research_reports')
      .select('*')
      .eq('user_id', userId)
      .eq('deleted_by_researcher', false)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
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

    const { error } = await client.from('research_reports').insert({
      id: report.id,
      user_id: report.researcherId,
      researcher_name: report.researcherName,
      created_at: report.createdAt,
      recording_date: report.recordingDate,
      duration_seconds: Math.round(report.durationSeconds),
      audio_path: audioPath,
      audio_mime_type: report.audioMimeType,
      transcript: report.transcript,
      transcript_status: report.transcriptStatus,
      status: report.status,
      period_type: report.periodType,
      period_start: report.periodStart,
      period_end: report.periodEnd,
      tag: report.tag,
      deleted_by_researcher: false
    })
    if (error) {
      await client.storage.from(BUCKET).remove([audioPath])
      throw error
    }
  },

  async updateTranscript(report: ResearchReport): Promise<void> {
    const client = requireClient()
    const { error } = await client.from('research_reports').update({
      transcript: report.transcript,
      transcript_status: 'edited'
    }).eq('id', report.id).eq('user_id', report.researcherId)
    if (error) throw error
  },

  async softDelete(report: ResearchReport): Promise<void> {
    const client = requireClient()
    const { error } = await client.from('research_reports').update({
      status: 'deleted',
      deleted_by_researcher: true,
      deleted_at: new Date().toISOString()
    }).eq('id', report.id).eq('user_id', report.researcherId)
    if (error) throw error
  }
}
