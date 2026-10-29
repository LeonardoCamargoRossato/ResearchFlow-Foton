export type TranscriptStatus = 'pending' | 'generated' | 'edited'
export type ReportStatus = 'saved' | 'archived' | 'deleted'

export interface ResearchReport {
  id: string
  researcherId?: string
  researcherName: string
  createdAt: string
  recordingDate: string
  recordingTime: string
  durationSeconds: number
  audioBlob?: Blob
  audioMimeType?: string
  transcript: string
  transcriptStatus: TranscriptStatus
  status: ReportStatus
  periodType: 'weekly'
  periodStart?: string
  periodEnd?: string
  tag: string
  deletedByResearcher?: boolean
}
