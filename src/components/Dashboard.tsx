import { useMemo, type ReactNode } from 'react'
import { useAhora, useStore } from '../domain/hooks'
import {
  UMBRALES,
  avanceOC,
  avanceOD,
  formatHora,
  promedio,
  relojOD,
  relojSolicitud,
  semaforo,
} from '../domain/timers'
import type { OC, OD, Solicitud } from '../domain/types'
import { Chip, Medidor, Reloj, StatTile, Tarjeta } from './ui'
import { COLOR_AREA } from './tokens'

export function Dashboard() {
  const { estado } = useStore()
  const ahora = useAhora()

  const abiertas = estado.ods.filter((o) => o.estado !== 'COMPLETADA')
  const cerradas = estado.ods.filter((o) => o.estado === 'COMPLETADA')
  const parosAbiertos = abiertas.flatMap((o) => o.ocs.filter((oc) => oc.estado === 'PARADA'))

  const kpis = useMemo(() => {
    const ciclos = cerradas.map((o) => relojOD(o, estado.solicitudes, ahora).ciclo)
    const cerradasSol = estado.solicitudes.filter((s) => s.estado === 'SURTIDA')
    const netos = cerradasSol.map((s) => relojSolicitud(s, ahora).neto)
    const brutos = cerradasSol.map((s) => relojSolicitud(s, ahora).bruto)
    const arranques = estado.ods
      .filter((o) => o.iniciadaEn !== undefined)
      .map((o) => (o.iniciadaEn as number) - o.liberadaEn)
    return {
      ciclo: promedio(ciclos),
      surtidoNeto: promedio(netos),
      surtidoBruto: promedio(brutos),
      arranque: promedio(arranques),
      surtidas: cerradasSol.length,
    }
  }, [cerradas, estado.ods, estado.solicitudes, ahora])

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          titulo="OD en piso"
          valor={String(abiertas.length)}
          pie={`${cerradas.length} cerradas en el turno`}
        />
        <StatTile
          titulo="Paros activos"
          valor={String(parosAbiertos.length)}
          pie="OC detenidas en Preparación"
          color={parosAbiertos.length > 0 ? 'var(--st-critical)' : 'var(--text-primary)'}
        />
        <StatTile
          titulo="Espera de arranque"
          valor={fmt(kpis.arranque)}
          pie="Facturación → Preparación"
        />
        <StatTile
          titulo="Surtido neto prom."
          valor={fmt(kpis.surtidoNeto)}
          pie={`${kpis.surtidas} solicitudes cerradas`}
          color="var(--area-alm)"
        />
        <StatTile
          titulo="Surtido total prom."
          valor={fmt(kpis.surtidoBruto)}
          pie="Incluye espera sin material"
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <ColumnaFacturacion ods={estado.ods} />
        <ColumnaPreparacion ods={abiertas} solicitudes={estado.solicitudes} ahora={ahora} />
        <ColumnaSurtidor
          area="ALMACEN"
          solicitudes={estado.solicitudes}
          ods={estado.ods}
          ahora={ahora}
        />
        <ColumnaSurtidor
          area="CUBO"
          solicitudes={estado.solicitudes}
          ods={estado.ods}
          ahora={ahora}
        />
      </section>
    </div>
  )
}

/** Promedios en formato corto; los cronómetros vivos usan `formatDuracion`. */
function fmt(ms: number): string {
  if (ms <= 0) return '—'
  const min = Math.floor(ms / 60000)
  const seg = Math.floor((ms % 60000) / 1000)
  return min > 0 ? `${min}m ${String(seg).padStart(2, '0')}s` : `${seg}s`
}

function Columna({
  titulo,
  subtitulo,
  color,
  conteo,
  children,
}: {
  titulo: string
  subtitulo: string
  color: string
  conteo: number
  children: ReactNode
}) {
  return (
    <Tarjeta className="flex flex-col overflow-hidden">
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
          <div className="text-left">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {titulo}
            </h2>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {subtitulo}
            </p>
          </div>
        </div>
        <span className="tabular text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {conteo}
        </span>
      </header>
      <div className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto p-3">{children}</div>
    </Tarjeta>
  )
}

/**
 * Las OC que cuelgan de una OD. Es la liga que el piso necesita ver: una OD
 * puede traer varias OC y cada una la surte un área distinta.
 */
function ListaOC({
  od,
  solicitudes,
}: {
  od: OD
  solicitudes: Solicitud[]
}) {
  return (
    <ul className="mt-2 flex flex-col gap-1 border-t pt-2" style={{ borderColor: 'var(--grid)' }}>
      {od.ocs.map((oc) => (
        <FilaOC key={oc.id} oc={oc} solicitudes={solicitudes} />
      ))}
    </ul>
  )
}

function FilaOC({ oc, solicitudes }: { oc: OC; solicitudes: Solicitud[] }) {
  const av = avanceOC(oc)
  const abiertas = solicitudes.filter(
    (s) => s.ocId === oc.id && s.estado !== 'SURTIDA',
  )
  const parada = oc.estado === 'PARADA'
  const enEspera = abiertas.some((s) => s.estado === 'PAUSADA')
  const color = oc.surtidor === 'ALMACEN' ? 'var(--area-alm)' : 'var(--area-cubo)'

  return (
    <li className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
      <span
        className="tabular shrink-0 text-[11px] font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        {oc.folio}
      </span>
      <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {oc.surtidor === 'ALMACEN' ? 'Almacén' : 'Cubo'}
      </span>
      <span className="flex-1" />
      {parada && (
        <span className="shrink-0 text-[11px] font-medium" style={{ color: 'var(--st-critical)' }}>
          ■ paro
        </span>
      )}
      {!parada && enEspera && (
        <span className="shrink-0 text-[11px] font-medium" style={{ color: 'var(--st-warning)' }}>
          ▲ espera
        </span>
      )}
      {abiertas.length === 0 && (oc.estado === 'COMPLETADA' || av.surtidas === av.total) && (
        <span className="shrink-0 text-[11px] font-medium" style={{ color: 'var(--st-good)' }}>
          ● completa
        </span>
      )}
      <span
        className="tabular shrink-0 text-[11px]"
        style={{ color: 'var(--text-secondary)' }}
      >
        {av.surtidas}/{av.total}
      </span>
    </li>
  )
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="px-2 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
      {texto}
    </p>
  )
}

function ColumnaFacturacion({ ods }: { ods: OD[] }) {
  const sinTomar = ods.filter((o) => o.iniciadaEn === undefined)
  return (
    <Columna
      titulo="Facturación"
      subtitulo="Libera la OD · fuera de medición"
      color={COLOR_AREA.FACTURACION}
      conteo={sinTomar.length}
    >
      {sinTomar.length === 0 && <Vacio texto="Sin OD por tomar" />}
      {sinTomar.map((od) => (
        <div
          key={od.id}
          className="rounded-lg border px-3 py-2 text-left"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {od.folio}
            </span>
            <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatHora(od.liberadaEn)}
            </span>
          </div>
          <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
            {od.cliente}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip>{od.ocs.length} OC</Chip>
            {od.prioridad === 'URGENTE' && (
              <Chip color="var(--st-critical)" solido>
                URGENTE
              </Chip>
            )}
          </div>
          <ListaOC od={od} solicitudes={[]} />
        </div>
      ))}
    </Columna>
  )
}

function ColumnaPreparacion({
  ods,
  solicitudes,
  ahora,
}: {
  ods: OD[]
  solicitudes: Solicitud[]
  ahora: number
}) {
  const activas = ods.filter((o) => o.iniciadaEn !== undefined)
  return (
    <Columna
      titulo="Preparación"
      subtitulo="Arma la OD y pide material"
      color={COLOR_AREA.PREPARACION}
      conteo={activas.length}
    >
      {activas.length === 0 && <Vacio texto="Ninguna OD en proceso" />}
      {activas.map((od) => {
        const r = relojOD(od, solicitudes, ahora)
        const av = avanceOD(od)
        const parada = od.estado === 'PARADA'
        return (
          <div
            key={od.id}
            className="rounded-lg border px-3 py-2 text-left"
            style={{
              borderColor: parada ? 'var(--st-critical)' : 'var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {od.folio}
              </span>
              {parada ? (
                <Chip color="var(--st-critical)" solido>
                  ■ PARO
                </Chip>
              ) : (
                <Chip color="var(--st-good)">● En proceso</Chip>
              )}
            </div>
            <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
              {od.cliente}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Reloj
                etiqueta="Prep neto"
                ms={r.prepNeto}
                tamano="sm"
                corriendo={!parada}
                estado={semaforo(r.prepNeto, UMBRALES.preparacion)}
              />
              <Reloj etiqueta="Prep total" ms={r.prepBruto} tamano="sm" />
            </div>
            {r.paroMaterial > 0 && (
              <p className="tabular mt-1 text-[11px]" style={{ color: 'var(--st-serious)' }}>
                ▲ Paro acumulado {fmt(r.paroMaterial)}
              </p>
            )}
            <div className="mt-2">
              <Medidor valor={av.surtidas} total={av.total} />
            </div>
            <ListaOC od={od} solicitudes={solicitudes} />
          </div>
        )
      })}
    </Columna>
  )
}

function ColumnaSurtidor({
  area,
  solicitudes,
  ods,
  ahora,
}: {
  area: 'ALMACEN' | 'CUBO'
  solicitudes: Solicitud[]
  ods: OD[]
  ahora: number
}) {
  // Los paros de Preparación van primero: es línea detenida.
  const cola = solicitudes
    .filter((s) => s.surtidor === area && s.estado !== 'SURTIDA')
    .sort((a, b) => Number(b.esParo) - Number(a.esParo) || a.creadaEn - b.creadaEn)

  const color = area === 'ALMACEN' ? COLOR_AREA.ALMACEN : COLOR_AREA.CUBO

  return (
    <Columna
      titulo={area === 'ALMACEN' ? 'Almacén' : 'Cubo'}
      subtitulo="Surte contra OC"
      color={color}
      conteo={cola.length}
    >
      {cola.length === 0 && <Vacio texto="Cola limpia" />}
      {cola.map((s) => {
        const od = ods.find((o) => o.id === s.odId)
        const oc = od?.ocs.find((x) => x.id === s.ocId)
        // Posición de esta OC dentro de su OD: dice si la OD queda liberada al surtirla.
        const indice = od ? od.ocs.findIndex((x) => x.id === s.ocId) + 1 : 0
        const r = relojSolicitud(s, ahora)
        return (
          <div
            key={s.id}
            className="rounded-lg border px-3 py-2 text-left"
            style={{
              borderColor: s.esParo ? 'var(--st-critical)' : 'var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {oc?.folio ?? 'OC'}
              </span>
              <span className="tabular text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {od?.folio} · OC {indice}/{od?.ocs.length}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {s.esParo && (
                <Chip color="var(--st-critical)" solido>
                  ■ Paro de Preparación
                </Chip>
              )}
              {s.estado === 'PAUSADA' && <Chip color="var(--st-warning)">▲ Sin existencia</Chip>}
              {s.estado === 'EN_SURTIDO' && <Chip color="var(--st-good)">● Surtiendo</Chip>}
              {s.estado === 'SOLICITADA' && <Chip>En cola</Chip>}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Reloj
                etiqueta="Neto área"
                ms={r.neto}
                tamano="sm"
                corriendo={r.corriendo}
                estado={semaforo(r.neto, UMBRALES.surtido)}
              />
              <Reloj
                etiqueta="Total"
                ms={r.bruto}
                tamano="sm"
                estado={semaforo(r.bruto, UMBRALES.surtidoTotal)}
              />
            </div>
          </div>
        )
      })}
    </Columna>
  )
}
