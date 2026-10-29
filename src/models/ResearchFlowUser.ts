export type ResearchFlowRole = 'researcher' | 'lab_coordinator' | 'director'

export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked'

export interface ResearchFlowUser {
  authUserId: string
  membershipId: string
  email: string
  fullName: string
  avatarUrl?: string
  role: ResearchFlowRole
  laboratoryId?: string
  laboratoryName?: string
  verticalId?: string
  verticalName?: string
  status: 'active'
}

export interface AccessRequest {
  id: string
  auth_user_id: string
  email: string
  full_name: string | null
  requested_at: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  message: string | null
  reviewed_at: string | null
  review_notes: string | null
}

export interface GovernanceMembership {
  id: string
  auth_user_id: string | null
  email: string
  full_name: string | null
  role: ResearchFlowRole
  laboratory_id: string | null
  vertical_id: string | null
  status: MembershipStatus
  created_at: string
  updated_at: string
}

export interface GovernanceLaboratory {
  id: string
  name: string
  slug: string
  description: string | null
  active: boolean
  created_at: string
  vertical_id: string
}

export interface GovernanceReport {
  id: string
  user_id: string
  researcher_name: string
  created_at: string
  recording_date: string
  duration_seconds: number
  transcript: string
  transcript_status: 'pending' | 'generated' | 'edited'
  status: 'saved' | 'archived' | 'deleted'
  tag: string
  audio_path: string | null
  deleted_by_researcher: boolean
}
