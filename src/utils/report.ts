export const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR').format(new Date(iso))

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export const createReportIdentity = () => {
  const now = new Date()
  const iso = now.toISOString()
  const date = iso.slice(0, 10)
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 4).toUpperCase()
  return {
    id: crypto.randomUUID(),
    tag: `RF-${date}-${hh}${mm}-${suffix}`,
    createdAt: iso
  }
}
