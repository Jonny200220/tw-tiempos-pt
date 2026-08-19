import { useMemo, useState } from 'react'
import { useAhora, useStore } from '../domain/hooks'
import { enPreparacion } from '../domain/reducer'
import {
  UMBRALES,
  avanceOC,
  formatHora,
  kgDeOD,
  piezasDeOC,
  piezasDeOD,
  relojOC,
  semaforo,
} from '../domain/timers'
import { ETIQUETA_MOTIVO_PARO, ETIQUETA_TIPO, type MotivoParo, type OC, type OD, type Paquete } from '../domain/types'
import { Boton, Chip, Medidor, Modal, Reloj, Tarjeta } from './ui'

const MOTIVOS: MotivoParo[] = ['FALTA_MATERIAL', 'DESCANSO', 'OTRO']

function piezasDeOCs(ocs: OC[]): number {
  return ocs.reduce((acc, oc) => acc + piezasDeOC(oc), 0)
}

function kgDeOCs(ocs: OC[]): number {
  return ocs.reduce((acc, oc) => acc + (oc.kg ?? 0), 0)
}

/** Pantalla de piso de Preparación: tomar OD, parar/reanudar OC, cerrar. */
export function PanelPreparacion() {
  const { estado, dispatch } = useStore()
  const ahora = useAhora()
  const [abiertoGrupo, setAbiertoGrupo] = useState<string | null>(null)
  const [abiertaOc, setAbiertaOc] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState<string | null>(null)
  const [parando, setParando] = useState<{ odId: string; ocId: string } | null>(null)
  const [editando, setEditando] = useState<{ odId: string; ocId: string; paqueteId: string } | null>(
    null,
  )

  const pendientes = estado.ods.filter((o) => o.iniciadaEn === undefined)
  // Al cerrar la última OC la OD sale de Preparación y se forma en Embarques.
  const enProceso = estado.ods.filter(enPreparacion)
  const odIniciando = pendientes.find((o) => o.id === iniciando)

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="p-4 text-left">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Distribuciones Liberadas
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          El cronómetro de espera corre desde que se libera hasta que alguien la toma.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {pendientes.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Sin OD por tomar.
            </p>
          )}
          {pendientes.map((od) => {
            const espera = ahora - od.liberadaEn
            return (
              <div
                key={od.id}
                className="flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {od.prioridad === 'URGENTE' && (
                      <Chip color="var(--st-critical)" solido>
                        URGENTE
                      </Chip>
                    )}
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Liberada {formatHora(od.liberadaEn)}
                    </span>
                  </div>
                  <CamposDatos
                    folio={od.folio}
                    tipo={ETIQUETA_TIPO[od.tipo] ?? 'México'}
                    oc={od.ocs.map((oc) => oc.folio).join(' · ')}
                    cliente={od.cliente}
                    piezas={piezasDeOD(od)}
                    kg={kgDeOD(od)}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Reloj
                    etiqueta="Esperando"
                    ms={espera}
                    corriendo
                    estado={semaforo(espera, UMBRALES.esperaArranque)}
                  />
                  <Boton tono="primario" onClick={() => setIniciando(od.id)}>
                    Iniciar preparación
                  </Boton>
                </div>
              </div>
            )
          })}
        </div>
      </Tarjeta>

      <div className="flex flex-col gap-3">
        {enProceso.map((od) => {
          const ocsActivas = od.ocs.filter(
            (oc) => oc.estado !== 'PENDIENTE' && oc.estado !== 'COMPLETADA',
          )
          if (ocsActivas.length === 0) return null
          return (
            <FichaGrupo
              key={od.id}
              od={od}
              ocs={ocsActivas}
              ahora={ahora}
              abierto={abiertoGrupo === od.id}
              ocAbierta={abiertaOc}
              onToggleGrupo={() => setAbiertoGrupo(abiertoGrupo === od.id ? null : od.id)}
              onToggleOc={(ocId) => setAbiertaOc(abiertaOc === ocId ? null : ocId)}
              onParar={(ocId) => setParando({ odId: od.id, ocId })}
              onReanudar={(ocId) => dispatch({ tipo: 'REANUDAR_OC', odId: od.id, ocId })}
              onFinalizar={(ocId) => dispatch({ tipo: 'TERMINAR_OC', odId: od.id, ocId })}
              onEditarPaquete={(ocId, paqueteId) =>
                setEditando({ odId: od.id, ocId, paqueteId })
              }
            />
          )
        })}
      </div>

      {odIniciando && (
        <ModalInicio
          od={odIniciando}
          onCerrar={() => setIniciando(null)}
          onConfirmar={(personasPorOc) => {
            dispatch({ tipo: 'INICIAR_PREPARACION', odId: odIniciando.id, personasPorOc })
            setIniciando(null)
            setAbiertoGrupo(odIniciando.id)
          }}
        />
      )}

      {parando && (
        <ModalParo
          oc={enProceso.find((o) => o.id === parando.odId)?.ocs.find((c) => c.id === parando.ocId)}
          onCerrar={() => setParando(null)}
          onConfirmar={(motivo, nota) => {
            dispatch({
              tipo: 'PARAR_OC',
              odId: parando.odId,
              ocId: parando.ocId,
              motivo,
              nota,
            })
            setParando(null)
          }}
        />
      )}

      {editando && (
        <ModalPaquete
          od={enProceso.find((o) => o.id === editando.odId)}
          oc={enProceso
            .find((o) => o.id === editando.odId)
            ?.ocs.find((c) => c.id === editando.ocId)}
          paquete={enProceso
            .find((o) => o.id === editando.odId)
            ?.ocs.find((c) => c.id === editando.ocId)
            ?.paquetes.find((p) => p.id === editando.paqueteId)}
          onCerrar={() => setEditando(null)}
          onPersonas={(personas) =>
            dispatch({
              tipo: 'ACTUALIZAR_PERSONAL_OC',
              odId: editando.odId,
              ocId: editando.ocId,
              personas,
            })
          }
          onMarcar={(piezaId, real) =>
            dispatch({
              tipo: 'MARCAR_PIEZA',
              odId: editando.odId,
              ocId: editando.ocId,
              paqueteId: editando.paqueteId,
              piezaId,
              real,
            })
          }
        />
      )}
    </div>
  )
}

function CamposDatos({
  folio,
  tipo,
  oc,
  cliente,
  piezas,
  kg,
}: {
  folio: string
  tipo: string
  oc: string
  cliente: string
  piezas: number
  kg: number
}) {
  const campos = [
    { etiqueta: 'Folio de Distribución', valor: folio },
    { etiqueta: 'Tipo', valor: tipo },
    { etiqueta: 'Orden de compra', valor: oc },
    { etiqueta: 'Cliente', valor: cliente },
    { etiqueta: 'Piezas', valor: piezas.toLocaleString('es-MX') },
    { etiqueta: 'Kg', valor: kg.toLocaleString('es-MX') },
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
      {campos.map((c) => (
        <div key={c.etiqueta} className="min-w-0">
          <dt
            className="text-[10px] font-medium uppercase tracking-wide"
            style={{ color: 'var(--text-muted)' }}
          >
            {c.etiqueta}
          </dt>
          <dd
            className={`truncate font-semibold ${c.etiqueta === 'Folio de Distribución' ? 'text-base' : 'text-sm'}`}
            style={{ color: 'var(--text-primary)' }}
            title={c.valor}
          >
            {c.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function FichaGrupo({
  od,
  ocs,
  ahora,
  abierto,
  ocAbierta,
  onToggleGrupo,
  onToggleOc,
  onParar,
  onReanudar,
  onFinalizar,
  onEditarPaquete,
}: {
  od: OD
  ocs: OC[]
  ahora: number
  abierto: boolean
  ocAbierta: string | null
  onToggleGrupo: () => void
  onToggleOc: (ocId: string) => void
  onParar: (ocId: string) => void
  onReanudar: (ocId: string) => void
  onFinalizar: (ocId: string) => void
  onEditarPaquete: (ocId: string, paqueteId: string) => void
}) {
  const hayParo = ocs.some((oc) => oc.estado === 'PARADA')
  const paroAbierto = ocs
    .flatMap((oc) => (oc.paros ?? []).map((p) => ({ oc, p })))
    .reverse()
    .find(({ p }) => p.cerradoEn === undefined)
  const motivoParo = paroAbierto
    ? paroAbierto.p.motivo === 'OTRO'
      ? (paroAbierto.p.nota ?? ETIQUETA_MOTIVO_PARO.OTRO)
      : ETIQUETA_MOTIVO_PARO[paroAbierto.p.motivo]
    : undefined

  return (
    <Tarjeta className="text-left">
      <header
        className="flex items-start justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          type="button"
          onClick={onToggleGrupo}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={abierto}
        >
          <span aria-hidden className="mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {abierto ? '▾' : '▸'}
          </span>
          <div className="min-w-0 flex-1">
            <CamposDatos
              folio={od.folio}
              tipo={ETIQUETA_TIPO[od.tipo] ?? 'México'}
              oc={ocs.map((oc) => oc.folio).join(' · ')}
              cliente={od.cliente}
              piezas={piezasDeOCs(ocs)}
              kg={kgDeOCs(ocs)}
            />
          </div>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {hayParo ? (
            <Chip color="var(--st-critical)" solido>
              ■ Paro
            </Chip>
          ) : (
            <Chip color="var(--st-good)">● En proceso</Chip>
          )}
          {motivoParo && (
            <span
              className="max-w-40 truncate text-[11px]"
              style={{ color: 'var(--st-critical)' }}
              title={motivoParo}
            >
              {motivoParo}
            </span>
          )}
        </div>
      </header>

      {abierto && (
        <div className="flex flex-col">
          {ocs.map((oc) => (
            <FichaOC
              key={oc.id}
              od={od}
              oc={oc}
              ahora={ahora}
              abierta={ocAbierta === oc.id}
              onToggle={() => onToggleOc(oc.id)}
              onParar={() => onParar(oc.id)}
              onReanudar={() => onReanudar(oc.id)}
              onFinalizar={() => onFinalizar(oc.id)}
              onEditarPaquete={(paqueteId) => onEditarPaquete(oc.id, paqueteId)}
            />
          ))}
        </div>
      )}
    </Tarjeta>
  )
}

function FichaOC({
  od,
  oc,
  ahora,
  abierta,
  onToggle,
  onParar,
  onReanudar,
  onFinalizar,
  onEditarPaquete,
}: {
  od: OD
  oc: OC
  ahora: number
  abierta: boolean
  onToggle: () => void
  onParar: () => void
  onReanudar: () => void
  onFinalizar: () => void
  onEditarPaquete: (paqueteId: string) => void
}) {
  const r = relojOC(od, oc, ahora)
  const av = avanceOC(oc)
  const parada = oc.estado === 'PARADA'
  const completa = av.surtidas === av.total
  const paroAbierto = [...(oc.paros ?? [])].reverse().find((p) => p.cerradoEn === undefined)
  const motivoParo = paroAbierto
    ? paroAbierto.motivo === 'OTRO'
      ? (paroAbierto.nota ?? ETIQUETA_MOTIVO_PARO.OTRO)
      : ETIQUETA_MOTIVO_PARO[paroAbierto.motivo]
    : undefined

  return (
    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={abierta}
        >
          <span aria-hidden style={{ color: 'var(--text-muted)' }}>
            {abierta ? '▾' : '▸'}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {oc.folio}
            </p>
            {motivoParo && (
              <p className="truncate text-[11px]" style={{ color: 'var(--st-critical)' }} title={motivoParo}>
                {motivoParo}
              </p>
            )}
          </div>
          <Reloj
            etiqueta="Prep neto"
            ms={r.prepNeto}
            tamano="sm"
            corriendo={!parada}
            estado={semaforo(r.prepNeto, UMBRALES.preparacion)}
          />
          <div className="min-w-32 flex-1">
            <Medidor valor={av.surtidas} total={av.total} />
          </div>
        </button>
        <div className="flex items-center gap-2">
          {parada ? (
            <Chip color="var(--st-critical)" solido>
              ■ Paro
            </Chip>
          ) : (
            <Chip color="var(--st-good)">● En proceso</Chip>
          )}
          {parada ? (
            <Boton tono="primario" onClick={onReanudar}>
              Reanudar
            </Boton>
          ) : (
            <Boton tono="peligro" onClick={onParar}>
              Paro
            </Boton>
          )}
          <Boton tono={completa ? 'exito' : 'neutro'} disabled={!completa} onClick={onFinalizar}>
            Finalizar
          </Boton>
        </div>
      </div>

      {abierta && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          {oc.personas !== undefined && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Personal asignado: {oc.personas} · clic en un modelo para registrar avance
            </p>
          )}
          {oc.paquetes.map((p) => (
            <FichaPaquete key={p.id} paquete={p} onEditar={() => onEditarPaquete(p.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function FichaPaquete({ paquete, onEditar }: { paquete: Paquete; onEditar: () => void }) {
  const faltantes = paquete.piezas.filter((p) => !p.disponible)

  return (
    <button
      type="button"
      onClick={onEditar}
      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-opacity hover:opacity-80"
      style={{ background: 'var(--surface-2)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          {paquete.clave}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {paquete.piezas.length - faltantes.length}/{paquete.piezas.length} colores
        </span>
        {paquete.piezas.map((pz) => (
          <span
            key={pz.id}
            className="rounded px-1.5 py-0.5 text-[11px]"
            style={{
              color: pz.disponible ? 'var(--text-secondary)' : 'var(--st-critical)',
              border: `1px solid ${pz.disponible ? 'var(--grid)' : 'var(--st-critical)'}`,
            }}
          >
            {pz.disponible ? '✓' : '✗'} {pz.color} ({pz.real ?? 0}/{pz.cantidad})
          </span>
        ))}
      </div>
      {faltantes.length === 0 ? (
        <Chip color="var(--st-good)">● Completo</Chip>
      ) : (
        <Chip color="var(--st-warning)">▲ Faltan {faltantes.length}</Chip>
      )}
    </button>
  )
}

function ModalInicio({
  od,
  onCerrar,
  onConfirmar,
}: {
  od: OD
  onCerrar: () => void
  onConfirmar: (personasPorOc: Record<string, number>) => void
}) {
  const [personas, setPersonas] = useState<Record<string, number>>(() =>
    Object.fromEntries(od.ocs.map((oc) => [oc.id, 1])),
  )
  const [grupoAbierto, setGrupoAbierto] = useState(true)
  const totalPersonas = useMemo(
    () => Object.values(personas).reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0),
    [personas],
  )
  const totalPzas = piezasDeOD(od)
  const totalKg = kgDeOD(od)
  const etiquetaGrupo = od.cliente || 'Órdenes de compra'

  return (
    <Modal
      titulo={`Iniciar preparación · ${od.folio}`}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton tono="primario" disabled={totalPersonas < 1} onClick={() => onConfirmar(personas)}>
            Confirmar e iniciar
          </Boton>
        </>
      }
    >
      <p className="mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        Indica cuántas personas van a cada orden de compra. Los totales se calculan solos.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead style={{ color: 'var(--text-muted)' }}>
            <tr>
              <th className="pb-2 font-medium">OC</th>
              <th className="pb-2 font-medium">Pzas</th>
              <th className="pb-2 font-medium">Kg</th>
              <th className="pb-2 font-medium">Personas</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t" style={{ borderColor: 'var(--grid)' }}>
              <td className="py-2" colSpan={4}>
                <button
                  type="button"
                  onClick={() => setGrupoAbierto((prev) => !prev)}
                  className="flex items-center gap-1.5 font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                  aria-expanded={grupoAbierto}
                >
                  <span aria-hidden>{grupoAbierto ? '▾' : '▸'}</span>
                  {etiquetaGrupo}
                </button>
              </td>
            </tr>
            {grupoAbierto &&
              od.ocs.map((oc) => (
                <tr key={oc.id} className="border-t" style={{ borderColor: 'var(--grid)' }}>
                  <td className="py-2 pl-6 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {oc.folio}
                  </td>
                  <td className="tabular py-2">{piezasDeOC(oc).toLocaleString('es-MX')}</td>
                  <td className="tabular py-2">{(oc.kg ?? 0).toLocaleString('es-MX')}</td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="w-20 rounded-md border px-2 py-1 text-sm"
                      style={{
                        background: 'var(--surface-2)',
                        borderColor: 'var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      value={personas[oc.id] ?? 0}
                      onChange={(e) => {
                        const n = Math.max(0, Math.floor(Number(e.target.value) || 0))
                        setPersonas((prev) => ({ ...prev, [oc.id]: n }))
                      }}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
              <td className="pt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                Totales
              </td>
              <td className="tabular pt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                {totalPzas.toLocaleString('es-MX')}
              </td>
              <td className="tabular pt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                {totalKg.toLocaleString('es-MX')}
              </td>
              <td className="tabular pt-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                {totalPersonas}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  )
}

function ModalParo({
  oc,
  onCerrar,
  onConfirmar,
}: {
  oc?: OC
  onCerrar: () => void
  onConfirmar: (motivo: MotivoParo, nota?: string) => void
}) {
  const [motivo, setMotivo] = useState<MotivoParo | null>(null)
  const [nota, setNota] = useState('')
  const listo = motivo !== null && (motivo !== 'OTRO' || nota.trim().length > 0)

  if (!oc) return null

  return (
    <Modal
      titulo={`Motivo de paro · ${oc.folio}`}
      onCerrar={onCerrar}
      pie={
        <>
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton
            tono="peligro"
            disabled={!listo}
            onClick={() => {
              if (!motivo) return
              onConfirmar(motivo, motivo === 'OTRO' ? nota.trim() : undefined)
            }}
          >
            Confirmar paro
          </Boton>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Motivo</legend>
        {MOTIVOS.map((m) => (
          <label
            key={m}
            className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
            style={{
              borderColor: motivo === m ? 'var(--st-critical)' : 'var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
            }}
          >
            <input
              type="radio"
              name="motivo-paro"
              checked={motivo === m}
              onChange={() => setMotivo(m)}
            />
            {ETIQUETA_MOTIVO_PARO[m]}
          </label>
        ))}
      </fieldset>
      {motivo === 'OTRO' && (
        <textarea
          className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
          rows={3}
          placeholder="Describe el motivo…"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          style={{
            background: 'var(--surface-2)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        />
      )}
    </Modal>
  )
}

const estiloInput = {
  background: 'var(--surface-2)',
  borderColor: 'var(--border)',
  color: 'var(--text-primary)',
}

function ModalPaquete({
  od,
  oc,
  paquete,
  onCerrar,
  onPersonas,
  onMarcar,
}: {
  od?: OD
  oc?: OC
  paquete?: Paquete
  onCerrar: () => void
  onPersonas: (n: number) => void
  onMarcar: (piezaId: string, real: number) => void
}) {
  if (!od || !oc || !paquete) return null

  const pedidas = paquete.piezas.reduce((acc, pz) => acc + pz.cantidad, 0)
  const reales = paquete.piezas.reduce((acc, pz) => acc + (pz.real ?? 0), 0)
  const faltanColores = paquete.piezas.filter((pz) => !pz.disponible).length

  return (
    <Modal
      titulo={`${paquete.clave} · ${oc.folio}`}
      onCerrar={onCerrar}
      ancho="xl"
      pie={<Boton onClick={onCerrar}>Cerrar</Boton>}
    >
      <p className="mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {od.folio} · {ETIQUETA_TIPO[od.tipo] ?? 'México'} · {od.cliente}
      </p>

      <label className="mb-4 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
        <span>Personal de la OC</span>
        <input
          type="number"
          min={0}
          step={1}
          className="tabular w-20 rounded-md border px-2 py-1 text-sm"
          style={estiloInput}
          value={oc.personas ?? 0}
          onChange={(e) => onPersonas(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          personas en {oc.folio}
        </span>
      </label>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead style={{ color: 'var(--text-muted)' }}>
            <tr>
              <th className="pb-2 pr-2 font-medium">Listo</th>
              <th className="pb-2 pr-2 font-medium">Modelo</th>
              <th className="pb-2 pr-2 font-medium">Color</th>
              <th className="pb-2 pr-2 font-medium">Pedidas</th>
              <th className="pb-2 pr-2 font-medium">Real</th>
              <th className="pb-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {paquete.piezas.map((pz) => {
              const real = pz.real ?? 0
              return (
                <tr key={pz.id} className="border-t" style={{ borderColor: 'var(--grid)' }}>
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={pz.disponible}
                      onChange={(e) => onMarcar(pz.id, e.target.checked ? pz.cantidad : 0)}
                      aria-label={`${pz.color} listo`}
                    />
                  </td>
                  <td className="py-2 pr-2 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {paquete.clave}
                  </td>
                  <td className="py-2 pr-2" style={{ color: 'var(--text-primary)' }}>
                    {pz.color}
                  </td>
                  <td className="tabular py-2 pr-2">{pz.cantidad.toLocaleString('es-MX')}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      max={pz.cantidad}
                      step={1}
                      className="tabular w-20 rounded-md border px-2 py-1 text-sm"
                      style={estiloInput}
                      value={real}
                      onChange={(e) =>
                        onMarcar(pz.id, Math.max(0, Math.floor(Number(e.target.value) || 0)))
                      }
                    />
                  </td>
                  <td className="py-2">
                    {pz.disponible ? (
                      <span style={{ color: 'var(--st-good)' }}>● Completo</span>
                    ) : (
                      <span style={{ color: 'var(--st-critical)' }}>
                        ▲ Faltan {pz.cantidad - real}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm" style={{ color: 'var(--text-primary)' }}>
        Avance: {reales.toLocaleString('es-MX')} / {pedidas.toLocaleString('es-MX')} pzas
        {faltanColores > 0 ? ` · ${faltanColores} color(es) pendientes` : ' · modelo completo'}
      </p>
    </Modal>
  )
}
