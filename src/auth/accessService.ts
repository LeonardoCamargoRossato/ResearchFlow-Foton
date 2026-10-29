import type { User } from '@supabase/supabase-js'
import type { AccessRequest, ResearchFlowRole, ResearchFlowUser } from '../models/ResearchFlowUser'
import { supabase } from '../services/supabase'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

const avatarFrom = (user: User) => String(user.user_metadata?.avatar_url || user.user_metadata?.picture || '') || undefined
const nameFrom = (user: User) => String(user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Usuário')

export const accessService = {
  async loadCurrentUser(user: User): Promise<ResearchFlowUser | null> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_claim_membership')
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row || row.status !== 'active') return null
    if (!['researcher','lab_coordinator','director'].includes(String(row.role))) return null
    return {
      authUserId: user.id,
      membershipId: row.membership_id,
      email: String(user.email || row.email || '').toLowerCase(),
      fullName: row.full_name || nameFrom(user),
      avatarUrl: avatarFrom(user),
      role: row.role as ResearchFlowRole,
      laboratoryId: row.laboratory_id || undefined,
      laboratoryName: row.laboratory_name || undefined,
      verticalId: row.vertical_id || undefined,
      verticalName: row.vertical_name || undefined,
      status: 'active'
    }
  },

  async getPendingRequest(userId: string): Promise<AccessRequest | null> {
    const client = requireClient()
    const { data, error } = await client.from('access_requests').select('*').eq('auth_user_id', userId).eq('status', 'pending').maybeSingle()
    if (error) throw error
    return data as AccessRequest | null
  },

  async requestAccess(user: User, message: string): Promise<AccessRequest> {
    const client = requireClient()
    const existing = await accessService.getPendingRequest(user.id)
    if (existing) return existing
    const payload = {
      auth_user_id: user.id,
      email: String(user.email || '').trim().toLowerCase(),
      full_name: nameFrom(user),
      message: message.trim() || null
    }
    const { data, error } = await client.from('access_requests').insert(payload).select('*').single()
    if (error) throw error
    try {
      await client.functions.invoke('notify-access-request', { body: { requestId: data.id } })
    } catch {
      // Notification is best-effort; the stored request remains valid.
    }
    return data as AccessRequest
  },

  async listAccessRequests(): Promise<AccessRequest[]> {
    const client = requireClient()
    const { data, error } = await client.from('access_requests').select('*').order('requested_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as AccessRequest[]
  },

  async approveAccessRequest(requestId: string, role: ResearchFlowRole, laboratoryId?: string) {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_review_access_request', {
      p_request_id: requestId,
      p_decision: 'approved',
      p_role: role,
      p_laboratory_id: laboratoryId || null,
      p_vertical_id: null,
      p_notes: null
    })
    if (error) throw error
  },

  async rejectAccessRequest(requestId: string, notes?: string) {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_review_access_request', {
      p_request_id: requestId,
      p_decision: 'rejected',
      p_role: null,
      p_laboratory_id: null,
      p_vertical_id: null,
      p_notes: notes || null
    })
    if (error) throw error
  }
}
