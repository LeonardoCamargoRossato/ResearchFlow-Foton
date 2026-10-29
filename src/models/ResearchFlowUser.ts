export type ResearchFlowRole = 'researcher' | 'lab_coordinator' | 'director'

export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked'
export type GovernanceReportType = 'researcher' | 'coordinator'
export type InstitutionalRole = ResearchFlowRole | 'other'
export type AccessStatus = 'not_invited' | 'invite_created' | 'pending_acceptance' | 'active' | 'suspended' | 'revoked'

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
  person_id?: string | null
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
  subtitle?: string | null
  description: string | null
  active: boolean
  institutional?: boolean
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
  report_type: GovernanceReportType
}

export interface InstitutionalPerson {
  id: string
  slug: string
  full_name: string
  title_prefix: string | null
  display_name: string
  institutional_role: InstitutionalRole
  primary_laboratory_id: string | null
  email: string | null
  auth_user_id: string | null
  access_status: AccessStatus
  active: boolean
  created_at: string
  updated_at: string
}

export interface LaboratoryCoordinatorRelation {
  laboratory_id: string
  person_id: string
  is_primary: boolean
  active: boolean
}

export interface ResearchFlowInvite {
  id: string
  person_id: string
  intended_role: ResearchFlowRole
  laboratory_id: string | null
  status: 'active' | 'accepted' | 'revoked' | 'expired'
  created_by: string
  created_at: string
  expires_at: string
  accepted_at: string | null
  accepted_auth_user_id: string | null
  accepted_email: string | null
  revoked_at: string | null
  revoked_by: string | null
}

export interface InvitePreview {
  valid: boolean
  invite_id: string | null
  person_id: string | null
  display_name: string | null
  title_prefix: string | null
  intended_role: ResearchFlowRole | null
  laboratory_id: string | null
  laboratory_name: string | null
  invite_status: 'active' | 'accepted' | 'revoked' | 'expired' | 'invalid'
  expires_at: string | null
}

export interface InviteAcceptance {
  display_name: string
  role: ResearchFlowRole
  laboratory_name: string | null
  verified_email: string
}
