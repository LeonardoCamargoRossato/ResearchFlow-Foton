import type { WeeklyReportDraft } from '../components/WeeklyReportRecorder'
import type {
  AccessStatus,
  GovernanceLaboratory,
  GovernanceMembership,
  GovernanceReport,
  InstitutionalPerson,
  InstitutionalRole,
  LaboratoryCoordinatorRelation,
  MembershipStatus
} from '../models/ResearchFlowUser'
import { supabase } from '../services/supabase'

const BUCKET = 'research-audio'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

const extensionFor = (mime = '') => mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'

export const governanceService = {
  async listLaboratories(): Promise<GovernanceLaboratory[]> {
    const client = requireClient()
    const { data, error } = await client
      .from('laboratories')
      .select('id,name,slug,subtitle,description,active,institutional,created_at,vertical_id')
      .order('name')
    if (error) throw error
    return (data ?? []) as GovernanceLaboratory[]
  },

  async listMemberships(): Promise<GovernanceMembership[]> {
    const client = requireClient()
    const { data, error } = await client
      .from('memberships')
      .select('id,auth_user_id,person_id,email,full_name,role,laboratory_id,vertical_id,status,created_at,updated_at')
      .order('full_name', { ascending: true })
    if (error) throw error
    return (data ?? []) as GovernanceMembership[]
  },

  async listReports(): Promise<GovernanceReport[]> {
    const client = requireClient()
    const { data, error } = await client
      .from('research_reports')
      .select('id,user_id,researcher_name,created_at,recording_date,duration_seconds,transcript,transcript_status,status,tag,audio_path,deleted_by_researcher,report_type')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw error
    return (data ?? []) as GovernanceReport[]
  },

  async listDirectorLaboratories(): Promise<GovernanceLaboratory[]> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_director_laboratories')
    if (error) throw new Error(`Laboratórios: ${error.message}`)
    return (data ?? []) as GovernanceLaboratory[]
  },

  async listDirectorInstitutionalLaboratories(): Promise<GovernanceLaboratory[]> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_director_institutional_laboratories')
    if (error) throw new Error(`Laboratórios institucionais: ${error.message}`)
    return (data ?? []) as GovernanceLaboratory[]
  },

  async listDirectorMemberships(): Promise<GovernanceMembership[]> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_director_memberships')
    if (error) throw new Error(`Memberships: ${error.message}`)
    return (data ?? []) as GovernanceMembership[]
  },

  async listDirectorReports(): Promise<GovernanceReport[]> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_director_reports')
    if (error) throw new Error(`Relatos: ${error.message}`)
    return (data ?? []) as GovernanceReport[]
  },

  async listDirectorPeople(): Promise<InstitutionalPerson[]> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_director_people')
    if (error) throw new Error(`Pessoas: ${error.message}`)
    return (data ?? []) as InstitutionalPerson[]
  },

  async listDirectorLaboratoryCoordinators(): Promise<LaboratoryCoordinatorRelation[]> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_director_laboratory_coordinators')
    if (error) throw new Error(`Coordenadores institucionais: ${error.message}`)
    return (data ?? []) as LaboratoryCoordinatorRelation[]
  },

  async updateInstitutionalPerson(input: {
    personId: string
    displayName: string
    titlePrefix?: string
    institutionalRole: InstitutionalRole
    email?: string
    accessStatus: AccessStatus
  }): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_director_update_person', {
      p_person_id: input.personId,
      p_display_name: input.displayName,
      p_title_prefix: input.titlePrefix || null,
      p_institutional_role: input.institutionalRole,
      p_email: input.email?.trim() || null,
      p_access_status: input.accessStatus
    })
    if (error) throw error
  },

  async getCoordinatorLaboratory(): Promise<GovernanceLaboratory | null> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_coordinator_laboratory')
    if (error) throw new Error(`Laboratório: ${error.message}`)
    return ((data ?? [])[0] ?? null) as GovernanceLaboratory | null
  },

  async listCoordinatorMembers(): Promise<GovernanceMembership[]> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_coordinator_members')
    if (error) throw new Error(`Pesquisadores: ${error.message}`)
    return (data ?? []) as GovernanceMembership[]
  },

  async listCoordinatorReports(): Promise<GovernanceReport[]> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_coordinator_reports')
    if (error) throw new Error(`Relatos: ${error.message}`)
    return (data ?? []) as GovernanceReport[]
  },

  async createSignedAudioUrl(audioPath: string): Promise<string | null> {
    const client = requireClient()
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(audioPath, 3600)
    if (error) throw error
    return data?.signedUrl ?? null
  },

  async createCoordinatorReport(userId: string, authorName: string, draft: WeeklyReportDraft): Promise<void> {
    const client = requireClient()
    const audioPath = `${userId}/${draft.id}.${extensionFor(draft.audioMimeType)}`
    const { error: uploadError } = await client.storage.from(BUCKET).upload(audioPath, draft.audioBlob, {
      contentType: draft.audioMimeType,
      upsert: false
    })
    if (uploadError) throw new Error(`Áudio: ${uploadError.message}`)

    const { error } = await client.rpc('researchflow_create_coordinator_report', {
      p_id: draft.id,
      p_author_name: authorName,
      p_created_at: draft.createdAt,
      p_recording_date: draft.recordingDate,
      p_duration_seconds: Math.round(draft.durationSeconds),
      p_audio_path: audioPath,
      p_audio_mime_type: draft.audioMimeType,
      p_transcript: draft.transcript,
      p_transcript_status: draft.transcriptStatus,
      p_period_start: draft.periodStart,
      p_period_end: draft.periodEnd,
      p_tag: draft.tag
    })

    if (error) {
      await client.storage.from(BUCKET).remove([audioPath])
      throw new Error(`Relato: ${error.message}`)
    }
  },

  async updateCoordinatorTranscript(reportId: string, transcript: string): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_update_coordinator_transcript', {
      p_report_id: reportId,
      p_transcript: transcript
    })
    if (error) throw error
  },

  async createLaboratory(input: {
    name: string
    description?: string
    coordinatorMembershipId?: string
    active: boolean
  }): Promise<string> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_create_laboratory', {
      p_name: input.name,
      p_description: input.description || null,
      p_coordinator_membership_id: input.coordinatorMembershipId || null,
      p_active: input.active
    })
    if (error) throw error
    return String(data)
  },

  async updateLaboratory(input: {
    id: string
    name: string
    description?: string
    active: boolean
  }): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_update_laboratory', {
      p_laboratory_id: input.id,
      p_name: input.name,
      p_description: input.description || null,
      p_active: input.active
    })
    if (error) throw error
  },

  async assignCoordinator(laboratoryId: string, coordinatorMembershipId: string): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_assign_coordinator', {
      p_laboratory_id: laboratoryId,
      p_coordinator_membership_id: coordinatorMembershipId
    })
    if (error) throw error
  },

  async addResearcher(input: { fullName: string; email: string; status: 'active' | 'invited' }): Promise<string> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_add_researcher', {
      p_full_name: input.fullName,
      p_email: input.email,
      p_status: input.status
    })
    if (error) throw error
    return String(data)
  },

  async updateResearcher(input: { membershipId: string; fullName: string; status: MembershipStatus }): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_update_researcher', {
      p_membership_id: input.membershipId,
      p_full_name: input.fullName,
      p_status: input.status
    })
    if (error) throw error
  },

  async removeResearcher(membershipId: string): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_remove_researcher', {
      p_membership_id: membershipId
    })
    if (error) throw error
  },

  async updateMembershipStatus(membershipId: string, status: MembershipStatus): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_update_membership_status', {
      p_membership_id: membershipId,
      p_status: status
    })
    if (error) throw error
  }
}
