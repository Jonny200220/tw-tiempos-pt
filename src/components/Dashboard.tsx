import { useMemo, type ReactNode } from 'react'
import { useAhora, useStore } from '../domain/hooks'
import {
  UMBRALES,
  avanceOC,
  avanceOD,
  formatHora,
  kgDeOD,
  piezasDeOD,
  promedio,
  relojOD,
  relojSolicitud,
  semaforo,
} from '../domain/timers'
import type { OC, OD, Solicitud, Surtidor } from '../domain/types'
import { ETIQUETA_AREA, ETIQUETA_TIPO } from '../domain/types'
import { Chip, Medidor, Reloj, StatTile, Tarjeta } from './ui'
import { COLOR_AREA } from './tokens'

export function Dashboard() {
  const { estado } = useStore()
  const ahora = useAhora()

  const abiertas = estado.ods.filter((o) => o.estado !== 'EMBARCADA')
  const embarcadas = estado.ods.filter((o) => o.estado === 'EMBARCADA')
  const parosAbiertos = abiertas.flatMap((o) => o.ocs.filter((oc) => oc.estado === 'PARADA'))

  const kpis = useMemo(() => {
    const ciclos = embarcadas.map((o) => relojOD(o, estado.solicitudes, ahora).ciclo)
    const cerradasSol = estado.solicitudes.filter((s) => s.estado === 'SURTIDA')
    const netos = cerradasSol.map((s) => relojSolicitud(s, ahora).neto)
    const arranques = estado.ods
      .filter((o) => o.iniciadaEn !== undefined)
      .map((o) => (o.iniciadaEn as number) - o.liberadaEn)
    const embarques = embarcadas.map((o) => relojOD(o, estado.solicitudes, ahora).embarque)
    return {
      ciclo: promedio(ciclos),
      surtidoNeto: promedio(netos),
      arranque: promedio(arranques),
      embarque: promedio(embarques),
      surtidas: cerradasSol.length,
    }
  }, [embarcadas, estado.ods, estado.solicitudes, ahora])

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          titulo="OD en piso"
          valor={String(abiertas.length)}
          pie={`${embarcadas.length} embarcadas en el turno`}
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
          titulo="Ciclo OD prom."
          valor={fmt(kpis.ciclo)}
          pie={`Embarque prom. ${fmt(kpis.embarque)}`}
        />
      </section>

      <section className="grid gap-3 lg:grid-cols-4">
        <ColumnaPreparacion ods={estado.ods} solicitudes={estado.solicitudes} ahora={ahora} />
        <ColumnaSurtidor
          area="ALMACEN"
          solicitudes={estado.solicitudes}
          ods={estado.ods}
          ahora={ahora}
        />
        <ColumnaSurtidor
          area="MATERIAL_EMPAQUE"
          solicitudes={estado.solicitudes}
          ods={estado.ods}
          ahora={ahora}
        />
        <ColumnaEmbarques ods={estado.ods} solicitudes={estado.solicitudes} ahora={ahora} />
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
function ListaOC({ od, solicitudes }: { od: OD; solicitudes: Solicitud[] }) {
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
  const abiertas = solicitudes.filter((s) => s.ocId === oc.id && s.estado !== 'SURTIDA')
  const parada = oc.estado === 'PARADA'
  const enEspera = abiertas.some((s) => s.estado === 'PAUSADA')

  return (
    <li className="flex items-center gap-2">
      <span
        className="h-2 w-2 shrink-0 rounded-sm"
        style={{ background: COLOR_AREA[oc.surtidor] }}
        aria-hidden
      />
      <span
        className="tabular shrink-0 text-[11px] font-medium"
        style={{ color: 'var(--text-primary)' }}
      >
        {oc.folio}
      </span>
      <span className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {ETIQUETA_AREA[oc.surtidor]}
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
      <span className="tabular shrink-0 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
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

/** Encabezado común de las tarjetas de OD: folio, tipo, cliente, piezas y kg. */
function CabezaOD({ od, derecha }: { od: OD; derecha: ReactNode }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {od.folio}
        </span>
        {derecha}
      </div>
      <p className="truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
        {od.cliente}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        <Chip>{ETIQUETA_TIPO[od.tipo]}</Chip>
        <Chip>{od.ocs.length} OC</Chip>
        <Chip>{piezasDeOD(od)} pz</Chip>
        <Chip>{kgDeOD(od)} kg</Chip>
        {od.prioridad === 'URGENTE' && (
          <Chip color="var(--st-critical)" solido>
            URGENTE
          </Chip>
        )}
      </div>
    </>
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
  // Primero lo que todavía no arranca (ahí corre la espera), luego lo activo.
  const porTomar = ods.filter((o) => o.iniciadaEn === undefined)
  const activas = ods.filter((o) => o.estado === 'EN_PREPARACION' || o.estado === 'PARADA')

  return (
    <Columna
      titulo="Preparación"
      subtitulo="Arma la OD y pide material"
      color={COLOR_AREA.PREPARACION}
      conteo={porTomar.length + activas.length}
    >
      {porTomar.length + activas.length === 0 && <Vacio texto="Sin OD en piso" />}

      {porTomar.map((od) => {
        const espera = ahora - od.liberadaEn
        return (
          <div
            key={od.id}
            className="rounded-lg border border-dashed px-3 py-2 text-left"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <CabezaOD
              od={od}
              derecha={
                <span className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatHora(od.liberadaEn)}
                </span>
              }
            />
            <div className="mt-2">
              <Reloj
                etiqueta="Esperando arranque"
                ms={espera}
                tamano="sm"
                corriendo
                estado={semaforo(espera, UMBRALES.esperaArranque)}
              />
            </div>
            <ListaOC od={od} solicitudes={solicitudes} />
          </div>
        )
      })}

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
            <CabezaOD
              od={od}
              derecha={
                parada ? (
                  <Chip color="var(--st-critical)" solido>
                    ■ PARO
                  </Chip>
                ) : (
                  <Chip color="var(--st-good)">● En proceso</Chip>
                )
              }
            />
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
  area: Surtidor
  solicitudes: Solicitud[]
  ods: OD[]
  ahora: number
}) {
  // Los paros de Preparación van primero: es línea detenida.
  const cola = solicitudes
    .filter((s) => s.surtidor === area && s.estado !== 'SURTIDA')
    .sort((a, b) => Number(b.esParo) - Number(a.esParo) || a.creadaEn - b.creadaEn)

  return (
    <Columna
      titulo={ETIQUETA_AREA[area]}
      subtitulo="Surte contra OC"
      color={COLOR_AREA[area]}
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

function ColumnaEmbarques({
  ods,
  solicitudes,
  ahora,
}: {
  ods: OD[]
  solicitudes: Solicitud[]
  ahora: number
}) {
  // Preparación ya cerró todas las OC; falta cargar y confirmar la salida.
  const enCola = ods
    .filter((o) => o.estado === 'EN_EMBARQUE')
    .sort((a, b) => (a.terminadaEn ?? 0) - (b.terminadaEn ?? 0))
  const salidas = ods
    .filter((o) => o.estado === 'EMBARCADA')
    .sort((a, b) => (b.embarcadaEn ?? 0) - (a.embarcadaEn ?? 0))
    .slice(0, 5)

  return (
    <Columna
      titulo="Embarques"
      subtitulo="Carga y confirma la salida"
      color={COLOR_AREA.EMBARQUES}
      conteo={enCola.length}
    >
      {enCola.length === 0 && salidas.length === 0 && <Vacio texto="Nada por cargar" />}

      {enCola.map((od) => {
        const r = relojOD(od, solicitudes, ahora)
        return (
          <div
            key={od.id}
            className="rounded-lg border px-3 py-2 text-left"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
          >
            <CabezaOD od={od} derecha={<Chip color="var(--st-warning)">▲ Por cargar</Chip>} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Reloj
                etiqueta="En andén"
                ms={r.embarque}
                tamano="sm"
                corriendo
                estado={semaforo(r.embarque, UMBRALES.embarque)}
              />
              <Reloj etiqueta="Ciclo OD" ms={r.ciclo} tamano="sm" />
            </div>
          </div>
        )
      })}

      {salidas.map((od) => {
        const r = relojOD(od, solicitudes, ahora)
        return (
          <div
            key={od.id}
            className="rounded-lg border px-3 py-2 text-left opacity-80"
            style={{ borderColor: 'var(--grid)', background: 'var(--surface-1)' }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {od.folio}
              </span>
              <span className="text-[11px] font-medium" style={{ color: 'var(--st-good)' }}>
                ● Embarcada {formatHora(od.embarcadaEn ?? 0)}
              </span>
            </div>
            <p className="tabular text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Andén {fmt(r.embarque)} · ciclo {fmt(r.ciclo)}
            </p>
          </div>
        )
      })}
    </Columna>
  )
}
