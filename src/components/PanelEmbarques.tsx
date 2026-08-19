import { useAhora, useStore } from '../domain/hooks'
import {
  UMBRALES,
  formatHora,
  kgDeOD,
  piezasDeOD,
  relojOD,
  semaforo,
} from '../domain/timers'
import type { OD, Solicitud } from '../domain/types'
import { ETIQUETA_TIPO } from '../domain/types'
import { Boton, Chip, Reloj, Tarjeta } from './ui'

/**
 * Pantalla de Embarques. Una OD llega aquí cuando Preparación cerró todas sus
 * OC; el reloj de andén corre hasta que alguien confirma que salió de planta.
 */
export function PanelEmbarques() {
  const { estado, dispatch } = useStore()
  const ahora = useAhora()

  const porCargar = estado.ods
    .filter((o) => o.estado === 'EN_EMBARQUE')
    .sort((a, b) => (a.terminadaEn ?? 0) - (b.terminadaEn ?? 0))

  const salidas = estado.ods
    .filter((o) => o.estado === 'EMBARCADA')
    .sort((a, b) => (b.embarcadaEn ?? 0) - (a.embarcadaEn ?? 0))
    .slice(0, 10)

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="p-4 text-left">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              OD por cargar
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              El reloj de andén arranca cuando Preparación cierra la última OC.
            </p>
          </div>
          <Chip color="var(--area-emb)" solido>
            {porCargar.length} en andén
          </Chip>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {porCargar.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Nada por cargar.
            </p>
          )}
          {porCargar.map((od) => (
            <Renglon
              key={od.id}
              od={od}
              solicitudes={estado.solicitudes}
              ahora={ahora}
              onConfirmar={() => dispatch({ tipo: 'CONFIRMAR_EMBARQUE', odId: od.id })}
            />
          ))}
        </div>
      </Tarjeta>

      <Tarjeta className="p-4 text-left">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Últimas salidas
        </h2>
        <table className="mt-2 w-full text-left text-xs">
          <thead style={{ color: 'var(--text-muted)' }}>
            <tr>
              <th className="py-1 font-medium">Folio</th>
              <th className="py-1 font-medium">Tipo</th>
              <th className="py-1 font-medium">Cadena</th>
              <th className="tabular py-1 text-right font-medium">Piezas</th>
              <th className="tabular py-1 text-right font-medium">Kg</th>
              <th className="tabular py-1 text-right font-medium">Salida</th>
              <th className="tabular py-1 text-right font-medium">Andén</th>
              <th className="tabular py-1 text-right font-medium">Ciclo</th>
            </tr>
          </thead>
          <tbody>
            {salidas.length === 0 && (
              <tr>
                <td colSpan={8} className="py-3" style={{ color: 'var(--text-muted)' }}>
                  Todavía no sale ninguna OD.
                </td>
              </tr>
            )}
            {salidas.map((od) => {
              const r = relojOD(od, estado.solicitudes, ahora)
              return (
                <tr key={od.id} className="border-t" style={{ borderColor: 'var(--grid)' }}>
                  <td className="py-1.5" style={{ color: 'var(--text-primary)' }}>
                    {od.folio}
                  </td>
                  <td className="py-1.5">{ETIQUETA_TIPO[od.tipo]}</td>
                  <td className="py-1.5">{od.cliente}</td>
                  <td className="tabular py-1.5 text-right">{piezasDeOD(od)}</td>
                  <td className="tabular py-1.5 text-right">{kgDeOD(od)}</td>
                  <td className="tabular py-1.5 text-right">{formatHora(od.embarcadaEn ?? 0)}</td>
                  <td className="tabular py-1.5 text-right">{min(r.embarque)}</td>
                  <td className="tabular py-1.5 text-right">{min(r.ciclo)}</td>
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

function Renglon({
  od,
  solicitudes,
  ahora,
  onConfirmar,
}: {
  od: OD
  solicitudes: Solicitud[]
  ahora: number
  onConfirmar: () => void
}) {
  const r = relojOD(od, solicitudes, ahora)

  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-52 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {od.folio}
            </span>
            <Chip>{ETIQUETA_TIPO[od.tipo]}</Chip>
            {od.prioridad === 'URGENTE' && (
              <Chip color="var(--st-critical)" solido>
                URGENTE
              </Chip>
            )}
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {od.cliente} · {od.ocs.length} OC · {piezasDeOD(od)} pz · {kgDeOD(od)} kg
          </p>
          <p className="tabular mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Preparación cerró {formatHora(od.terminadaEn ?? 0)}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <Reloj
            etiqueta="En andén"
            ms={r.embarque}
            corriendo
            estado={semaforo(r.embarque, UMBRALES.embarque)}
          />
          <Reloj etiqueta="Ciclo OD" ms={r.ciclo} />
        </div>

        <Boton tono="exito" onClick={onConfirmar}>
          Confirmar salida
        </Boton>
      </div>
    </div>
  )
}
