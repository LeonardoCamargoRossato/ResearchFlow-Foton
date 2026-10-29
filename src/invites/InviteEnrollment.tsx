import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { InviteAcceptance, InvitePreview, ResearchFlowRole } from '../models/ResearchFlowUser'
import { authService } from '../services/supabase'
import { inviteService } from './inviteService'
import '../invite-v6.css'

const roleLabel = (role: ResearchFlowRole | null) => role === 'director'
  ? 'Diretor'
  : role === 'lab_coordinator'
    ? 'Coordenador'
    : role === 'researcher'
      ? 'Pesquisador'
      : 'Perfil institucional'

export function InviteEnrollment({ token, session }: { token: string; session: Session | null }) {
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [result, setResult] = useState<InviteAcceptance | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void inviteService.preview(token)
      .then((next) => { if (active) setPreview(next) })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Não foi possível validar este convite.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [token])

  const invalidMessage = useMemo(() => {
    if (!preview) return ''
    if (preview.invite_status === 'accepted') return 'Este convite já foi utilizado.'
    if (preview.invite_status === 'revoked') return 'Este convite foi revogado pela Diretoria.'
    if (preview.invite_status === 'expired') return 'Este convite expirou. Solicite um novo link à Diretoria.'
    if (preview.invite_status === 'invalid') return 'Este link de convite não é válido.'
    return ''
  }, [preview])

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      const accepted = await inviteService.accept(token)
      setResult(accepted)
      authService.clearPendingInviteToken()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ativar seu acesso.')
    } finally {
      setBusy(false)
    }
  }

  const enterResearchFlow = () => {
    authService.clearPendingInviteToken()
    window.location.hash = ''
    window.location.reload()
  }

  if (loading) return <div className="invite-page"><div className="invite-card"><div className="brand-mark">RF</div><h1>Validando convite…</h1></div></div>

  if (result) return <div className="invite-page"><div className="invite-card invite-success">
    <div className="brand-mark">RF</div>
    <span className="eyebrow">Instituto Foton · ResearchFlow</span>
    <h1>Acesso configurado com sucesso</h1>
    <p>Parabéns, {result.display_name}. Seu acesso ao ResearchFlow foi configurado.</p>
    <dl className="invite-summary">
      <div><dt>Perfil</dt><dd>{roleLabel(result.role)}</dd></div>
      {result.laboratory_name && <div><dt>Laboratório</dt><dd>{result.laboratory_name}</dd></div>}
      <div><dt>Conta de acesso</dt><dd>{result.verified_email}</dd></div>
    </dl>
    <button className="primary-button invite-primary" onClick={enterResearchFlow}>Entrar no ResearchFlow</button>
  </div></div>

  if (!preview?.valid) return <div className="invite-page"><div className="invite-card">
    <div className="brand-mark">RF</div>
    <span className="eyebrow">Instituto Foton · ResearchFlow</span>
    <h1>Convite indisponível</h1>
    <p>{invalidMessage || error || 'Não foi possível validar este convite.'}</p>
  </div></div>

  return <div className="invite-page"><div className="invite-card">
    <div className="brand-mark">RF</div>
    <span className="eyebrow">Instituto Foton · ResearchFlow</span>
    <h1>{session ? 'Confirme seu acesso' : `Olá, ${preview.display_name}`}</h1>
    {!session ? <>
      <p>Você foi convidado para participar do ResearchFlow.</p>
      <dl className="invite-summary">
        <div><dt>Cargo</dt><dd>{roleLabel(preview.intended_role)}</dd></div>
        {preview.laboratory_name && <div><dt>Laboratório</dt><dd>{preview.laboratory_name}</dd></div>}
        <div><dt>Validade</dt><dd>{preview.expires_at ? new Date(preview.expires_at).toLocaleString('pt-BR') : '—'}</dd></div>
      </dl>
      <button className="primary-button invite-primary" onClick={() => void authService.signInWithGoogle(token)}>Entrar com Google</button>
      <p className="invite-footnote">O Google confirmará qual conta será vinculada. O link sozinho não concede acesso aos dados institucionais.</p>
    </> : <>
      <p>Confira os dados abaixo antes de associar sua conta Google ao perfil institucional.</p>
      <dl className="invite-summary">
        <div><dt>Nome</dt><dd>{preview.display_name}</dd></div>
        <div><dt>Cargo</dt><dd>{roleLabel(preview.intended_role)}</dd></div>
        {preview.laboratory_name && <div><dt>Laboratório</dt><dd>{preview.laboratory_name}</dd></div>}
        <div><dt>Conta Google</dt><dd>{session.user.email || 'Conta autenticada'}</dd></div>
      </dl>
      {error && <div className="error-banner">{error}</div>}
      <button className="primary-button invite-primary" disabled={busy} onClick={() => void confirm()}>{busy ? 'Configurando…' : 'Confirmar meu acesso'}</button>
      <button className="secondary-button invite-secondary" onClick={() => void authService.signOut()}>Usar outra conta Google</button>
    </>}
  </div></div>
}
