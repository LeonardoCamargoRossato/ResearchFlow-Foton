export type ResearchFlowRole = 'researcher' | 'lab_coordinator' | 'vertical_coordinator' | 'director'

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
