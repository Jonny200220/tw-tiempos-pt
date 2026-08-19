import { useEffect, type ReactNode } from 'react'
import { formatDuracion, type Semaforo } from '../domain/timers'

const COLOR_SEMAFORO: Record<Semaforo, string> = {
  ok: 'var(--st-good)',
  alerta: 'var(--st-warning)',
  critico: 'var(--st-critical)',
}

/** El semáforo nunca va solo por color: siempre lleva glifo + texto al lado. */
const GLIFO_SEMAFORO: Record<Semaforo, string> = {
  ok: '●',
  alerta: '▲',
  critico: '■',
}

export function Tarjeta({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
    >
      {children}
    </div>
  )
}

export function Boton({
  children,
  onClick,
  tono = 'neutro',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  tono?: 'neutro' | 'primario' | 'peligro' | 'exito'
  disabled?: boolean
  className?: string
}) {
  const fondo = {
    neutro: 'var(--surface-3)',
    primario: 'var(--area-prep)',
    peligro: 'var(--st-critical)',
    exito: 'var(--st-good)',
  }[tono]
  const texto = tono === 'neutro' ? 'var(--text-primary)' : '#fff'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={{ background: fondo, color: texto, border: '1px solid var(--border)' }}
    >
      {children}
    </button>
  )
}

export function Chip({
  children,
  color = 'var(--text-muted)',
  solido = false,
}: {
  children: ReactNode
  color?: string
  solido?: boolean
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={
        solido
          ? { background: color, color: '#fff' }
          : { color: 'var(--text-primary)', border: `1px solid ${color}` }
      }
    >
      {children}
    </span>
  )
}

/** Cronómetro. `estado` pinta el semáforo y el glifo lo acompaña siempre. */
export function Reloj({
  ms,
  estado = 'ok',
  corriendo = false,
  tamano = 'md',
  etiqueta,
}: {
  ms: number
  estado?: Semaforo
  corriendo?: boolean
  tamano?: 'sm' | 'md' | 'lg'
  etiqueta?: string
}) {
  const clase = { sm: 'text-sm', md: 'text-lg', lg: 'text-3xl' }[tamano]
  return (
    <div className="flex flex-col">
      {etiqueta && (
        <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          {etiqueta}
        </span>
      )}
      <span
        className={`tabular font-semibold ${clase} ${corriendo && estado === 'critico' ? 'pulso' : ''}`}
        style={{ color: estado === 'ok' ? 'var(--text-primary)' : COLOR_SEMAFORO[estado] }}
      >
        <span aria-hidden className="mr-1 text-[0.7em]">
          {GLIFO_SEMAFORO[estado]}
        </span>
        {formatDuracion(ms)}
      </span>
    </div>
  )
}

/** Un número de encabezado. Sin sparkline: el dato vive en la tabla de abajo. */
export function StatTile({
  titulo,
  valor,
  pie,
  color = 'var(--text-primary)',
}: {
  titulo: string
  valor: string
  pie?: string
  color?: string
}) {
  return (
    <Tarjeta className="px-4 py-3">
      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {titulo}
      </p>
      <p className="tabular mt-1 text-2xl font-semibold" style={{ color }}>
        {valor}
      </p>
      {pie && (
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {pie}
        </p>
      )}
    </Tarjeta>
  )
}

/** Barra de avance de una sola serie: track del mismo tono, más claro. */
export function Medidor({
  valor,
  total,
  color = 'var(--area-prep)',
}: {
  valor: number
  total: number
  color?: string
}) {
  const pct = total === 0 ? 0 : Math.round((valor / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full"
        style={{ background: 'var(--grid)' }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="tabular text-xs" style={{ color: 'var(--text-secondary)' }}>
        {valor}/{total}
      </span>
    </div>
  )
}

export function Modal({
  titulo,
  children,
  pie,
  onCerrar,
  ancho = 'md',
}: {
  titulo: string
  children: ReactNode
  pie?: ReactNode
  onCerrar: () => void
  ancho?: 'md' | 'xl'
}) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(11, 11, 11, 0.45)' }}
      onClick={onCerrar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="modal-titulo"
        className={`flex max-h-[90vh] w-full flex-col rounded-xl border shadow-lg ${ancho === 'xl' ? 'max-w-2xl' : 'max-w-lg'}`}
        style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-start justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3 id="modal-titulo" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {titulo}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded px-1.5 text-lg leading-none"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-3 text-left">{children}</div>
        {pie && (
          <footer
            className="flex justify-end gap-2 border-t px-4 py-3"
            style={{ borderColor: 'var(--border)' }}
          >
            {pie}
          </footer>
        )}
      </div>
    </div>
  )
}
