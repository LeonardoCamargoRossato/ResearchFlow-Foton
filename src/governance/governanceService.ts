import type {
  GovernanceLaboratory,
  GovernanceMembership,
  GovernanceReport,
  MembershipStatus
} from '../models/ResearchFlowUser'
import { supabase } from '../services/supabase'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export const governanceService = {
  async listLaboratories(): Promise<GovernanceLaboratory[]> {
    const client = requireClient()
    const { data, error } = await client
      .from('laboratories')
      .select('id,name,slug,description,active,created_at,vertical_id')
      .order('name')
    if (error) throw error
    return (data ?? []) as GovernanceLaboratory[]
  },

  async listMemberships(): Promise<GovernanceMembership[]> {
    const client = requireClient()
    const { data, error } = await client
      .from('memberships')
      .select('id,auth_user_id,email,full_name,role,laboratory_id,vertical_id,status,created_at,updated_at')
      .order('full_name', { ascending: true })
    if (error) throw error
    return (data ?? []) as GovernanceMembership[]
  },

  async listReports(): Promise<GovernanceReport[]> {
    const client = requireClient()
    const { data, error } = await client
      .from('research_reports')
      .select('id,user_id,researcher_name,created_at,recording_date,duration_seconds,transcript,transcript_status,status,tag,audio_path,deleted_by_researcher')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw error
    return (data ?? []) as GovernanceReport[]
  },

  async createSignedAudioUrl(audioPath: string): Promise<string | null> {
    const client = requireClient()
    const { data, error } = await client.storage.from('research-audio').createSignedUrl(audioPath, 3600)
    if (error) throw error
    return data?.signedUrl ?? null
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
