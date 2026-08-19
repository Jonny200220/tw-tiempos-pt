import { useState } from 'react'
import { useAhora, useStore } from '../domain/hooks'
import { UMBRALES, formatHora, relojSolicitud, semaforo } from '../domain/timers'
import type { OD, Solicitud, Surtidor } from '../domain/types'
import { Boton, Chip, Reloj, Tarjeta } from './ui'

const MOTIVOS_PAUSA = [
  'Sin existencia en rack',
  'Material en tránsito',
  'Falta ubicación / no localizado',
  'Se adelanta otro pedido',
]

/**
 * Pantalla de Almacén/Cubo. La cola se ordena por paro primero: una OC que
 * detuvo a Preparación pesa más que un pedido anticipado.
 */
export function PanelAlmacen({ area }: { area: Surtidor }) {
  const { estado, dispatch } = useStore()
  const ahora = useAhora()
  const [pausando, setPausando] = useState<string | null>(null)

  const cola = estado.solicitudes
    .filter((s) => s.surtidor === area && s.estado !== 'SURTIDA')
    .sort((a, b) => Number(b.esParo) - Number(a.esParo) || a.creadaEn - b.creadaEn)

  const cerradas = estado.solicitudes
    .filter((s) => s.surtidor === area && s.estado === 'SURTIDA')
    .sort((a, b) => (b.cerradaEn ?? 0) - (a.cerradaEn ?? 0))
    .slice(0, 8)

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="p-4 text-left">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Cola de surtido · {area === 'ALMACEN' ? 'Almacén' : 'Cubo'}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              Al pausar, el reloj del área se congela y sigue corriendo el total del pedido.
            </p>
          </div>
          <Chip color={area === 'ALMACEN' ? 'var(--area-alm)' : 'var(--area-cubo)'} solido>
            {cola.length} pendientes
          </Chip>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {cola.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Cola limpia. No hay material pendiente.
            </p>
          )}
          {cola.map((s) => (
            <Renglon
              key={s.id}
              solicitud={s}
              ods={estado.ods}
              ahora={ahora}
              pausando={pausando === s.id}
              onPausando={(v) => setPausando(v ? s.id : null)}
              onIniciar={() => dispatch({ tipo: 'INICIAR_SURTIDO', solicitudId: s.id })}
              onReanudar={() => dispatch({ tipo: 'REANUDAR_SURTIDO', solicitudId: s.id })}
              onPausar={(nota) => {
                dispatch({ tipo: 'PAUSAR_SURTIDO', solicitudId: s.id, nota })
                setPausando(null)
              }}
              onConfirmar={() => dispatch({ tipo: 'CONFIRMAR_SURTIDO', solicitudId: s.id })}
            />
          ))}
        </div>
      </Tarjeta>

      <Tarjeta className="p-4 text-left">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Últimos surtidos
        </h2>
        <table className="mt-2 w-full text-left text-xs">
          <thead style={{ color: 'var(--text-muted)' }}>
            <tr>
              <th className="py-1 font-medium">OC</th>
              <th className="py-1 font-medium">OD</th>
              <th className="py-1 font-medium">Cerrado</th>
              <th className="tabular py-1 text-right font-medium">Neto</th>
              <th className="tabular py-1 text-right font-medium">Total</th>
              <th className="tabular py-1 text-right font-medium">Espera</th>
            </tr>
          </thead>
          <tbody>
            {cerradas.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3" style={{ color: 'var(--text-muted)' }}>
                  Todavía no se cierra ningún surtido.
                </td>
              </tr>
            )}
            {cerradas.map((s) => {
              const od = ods(s, estado.ods)
              const r = relojSolicitud(s, ahora)
              return (
                <tr key={s.id} className="border-t" style={{ borderColor: 'var(--grid)' }}>
                  <td className="py-1.5" style={{ color: 'var(--text-primary)' }}>
                    {od.oc?.folio}
                  </td>
                  <td className="py-1.5">{od.od?.folio}</td>
                  <td className="tabular py-1.5">{formatHora(s.cerradaEn ?? 0)}</td>
                  <td className="tabular py-1.5 text-right">{min(r.neto)}</td>
                  <td className="tabular py-1.5 text-right">{min(r.bruto)}</td>
                  <td
                    className="tabular py-1.5 text-right"
                    style={{ color: r.espera > 0 ? 'var(--st-serious)' : 'var(--text-secondary)' }}
                  >
                    {min(r.espera)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Tarjeta>
    </div>
  )
}

function min(ms: number): string {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

function ods(s: Solicitud, todas: OD[]) {
  const od = todas.find((o) => o.id === s.odId)
  return { od, oc: od?.ocs.find((x) => x.id === s.ocId) }
}

function Renglon({
  solicitud,
  ods: todas,
  ahora,
  pausando,
  onPausando,
  onIniciar,
  onReanudar,
  onPausar,
  onConfirmar,
}: {
  solicitud: Solicitud
  ods: OD[]
  ahora: number
  pausando: boolean
  onPausando: (v: boolean) => void
  onIniciar: () => void
  onReanudar: () => void
  onPausar: (nota: string) => void
  onConfirmar: () => void
}) {
  const { od, oc } = ods(solicitud, todas)
  const paquete = oc?.paquetes.find((p) => p.id === solicitud.paqueteId)
  const piezas = (paquete?.piezas ?? []).filter((p) => solicitud.piezaIds.includes(p.id))
  const r = relojSolicitud(solicitud, ahora)
  const ultimaNota = [...solicitud.eventos].reverse().find((e) => e.tipo === 'PAUSA')?.nota

  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{
        borderColor: solicitud.esParo ? 'var(--st-critical)' : 'var(--border)',
        background: 'var(--surface-2)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-52 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {oc?.folio}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {od?.folio} · {od?.cliente}
            </span>
            {solicitud.esParo && (
              <Chip color="var(--st-critical)" solido>
                ■ Preparación detenida
              </Chip>
            )}
            {solicitud.estado === 'PAUSADA' && (
              <Chip color="var(--st-warning)">▲ En espera</Chip>
            )}
            {solicitud.estado === 'EN_SURTIDO' && <Chip color="var(--st-good)">● Surtiendo</Chip>}
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {paquete?.clave} · bajar: {piezas.map((p) => `${p.color} (${p.cantidad})`).join(', ')}
          </p>
          {ultimaNota && solicitud.estado === 'PAUSADA' && (
            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--st-serious)' }}>
              Motivo: {ultimaNota}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <Reloj
            etiqueta="Neto área"
            ms={r.neto}
            corriendo={r.corriendo}
            estado={semaforo(r.neto, UMBRALES.surtido)}
          />
          <Reloj
            etiqueta="Total pedido"
            ms={r.bruto}
            estado={semaforo(r.bruto, UMBRALES.surtidoTotal)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {solicitud.estado === 'SOLICITADA' && (
            <Boton tono="primario" onClick={onIniciar}>
              Empezar surtido
            </Boton>
          )}
          {solicitud.estado === 'PAUSADA' && (
            <Boton tono="primario" onClick={onReanudar}>
              Reanudar
            </Boton>
          )}
          {solicitud.estado === 'EN_SURTIDO' && (
            <>
              <Boton onClick={() => onPausando(!pausando)}>Dejar para después</Boton>
              <Boton tono="exito" onClick={onConfirmar}>
                Material entregado
              </Boton>
            </>
          )}
        </div>
      </div>

      {pausando && (
        <div
          className="mt-2 flex flex-wrap gap-2 rounded-md p-2"
          style={{ background: 'var(--surface-3)' }}
        >
          <span className="self-center text-xs" style={{ color: 'var(--text-secondary)' }}>
            Motivo:
          </span>
          {MOTIVOS_PAUSA.map((m) => (
            <Boton key={m} onClick={() => onPausar(m)}>
              {m}
            </Boton>
          ))}
        </div>
      )}
    </div>
  )
}
