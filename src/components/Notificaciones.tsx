import { useEffect, useRef, useState } from 'react'
import { useStore } from '../domain/hooks'
import { formatHora } from '../domain/timers'
import type { Area, Notificacion } from '../domain/types'
import { Tarjeta } from './ui'

const COLOR_SEVERIDAD = {
  info: 'var(--text-muted)',
  alerta: 'var(--st-warning)',
  critica: 'var(--st-critical)',
} as const

const GLIFO_SEVERIDAD = { info: '●', alerta: '▲', critica: '■' } as const

/**
 * Campana por área. Cada pantalla filtra lo suyo: Almacén ve los paros de
 * Preparación, Preparación ve cuándo le surtieron o cuándo se pospuso.
 */
export function Notificaciones({ area }: { area: Area }) {
  const { estado, dispatch } = useStore()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  const mias = estado.notificaciones.filter((n) => n.para === area)
  const sinLeer = mias.filter((n) => !n.leida)
  const criticas = sinLeer.some((n) => n.severidad === 'critica')

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => {
          setAbierto(!abierto)
          if (!abierto) dispatch({ tipo: 'MARCAR_LEIDAS', area })
        }}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
        style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
        }}
        aria-label={`Notificaciones: ${sinLeer.length} sin leer`}
      >
        <span aria-hidden>🔔</span>
        {sinLeer.length > 0 && (
          <span
            className={`tabular rounded-full px-1.5 text-xs font-semibold ${criticas ? 'pulso' : ''}`}
            style={{
              background: criticas ? 'var(--st-critical)' : 'var(--st-warning)',
              color: criticas ? '#fff' : '#0b0b0b',
            }}
          >
            {sinLeer.length}
          </span>
        )}
      </button>

      {abierto && (
        <Tarjeta className="absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto p-2 text-left shadow-lg">
          {mias.length === 0 && (
            <p className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              Sin avisos.
            </p>
          )}
          {mias.map((n) => (
            <Fila key={n.id} n={n} />
          ))}
        </Tarjeta>
      )}
    </div>
  )
}

function Fila({ n }: { n: Notificacion }) {
  return (
    <div className="border-b px-2 py-2 last:border-0" style={{ borderColor: 'var(--grid)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-xs font-semibold"
          style={{ color: n.severidad === 'info' ? 'var(--text-primary)' : COLOR_SEVERIDAD[n.severidad] }}
        >
          <span aria-hidden className="mr-1">
            {GLIFO_SEVERIDAD[n.severidad]}
          </span>
          {n.titulo}
        </span>
        <span className="tabular text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {formatHora(n.t)}
        </span>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        {n.detalle}
      </p>
    </div>
  )
}
