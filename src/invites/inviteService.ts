import type {
  InviteAcceptance,
  InvitePreview,
  ResearchFlowInvite
} from '../models/ResearchFlowUser'
import { supabase } from '../services/supabase'

const requireClient = () => {
  if (!supabase) throw new Error('Supabase não configurado.')
  return supabase
}

export const inviteService = {
  async preview(token: string): Promise<InvitePreview> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_invite_preview', { p_token: token })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return {
      valid: false,
      invite_id: null,
      person_id: null,
      display_name: null,
      title_prefix: null,
      intended_role: null,
      laboratory_id: null,
      laboratory_name: null,
      invite_status: 'invalid',
      expires_at: null
    }
    return row as InvitePreview
  },

  async accept(token: string): Promise<InviteAcceptance> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_accept_invite', { p_token: token })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('O convite não retornou uma identidade ativada.')
    try {
      await client.functions.invoke('notify-invite-accepted', { body: {} })
    } catch {
      // Confirmation email is best-effort and never rolls back activation.
    }
    return row as InviteAcceptance
  },

  async create(personId: string): Promise<{ inviteId: string; token: string; expiresAt: string }> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_create_invite', { p_person_id: personId })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new Error('Não foi possível gerar o convite.')
    return { inviteId: row.invite_id, token: row.token, expiresAt: row.expires_at }
  },

  async revoke(inviteId: string): Promise<void> {
    const client = requireClient()
    const { error } = await client.rpc('researchflow_revoke_invite', { p_invite_id: inviteId })
    if (error) throw error
  },

  async listDirectorInvites(): Promise<ResearchFlowInvite[]> {
    const client = requireClient()
    const { data, error } = await client.rpc('researchflow_director_invites')
    if (error) throw error
    return (data ?? []) as ResearchFlowInvite[]
  }
}
