import { nuevaOD } from './seed'
import type {
  Area,
  Estado,
  MotivoParo,
  Notificacion,
  OC,
  OD,
  Solicitud,
  Surtidor,
} from './types'
import { ETIQUETA_AREA, ETIQUETA_MOTIVO_PARO } from './types'

export type Accion =
  | { tipo: 'LIBERAR_OD' }
  | { tipo: 'INICIAR_PREPARACION'; odId: string; personasPorOc: Record<string, number> }
  | {
      tipo: 'SOLICITAR_MATERIAL'
      odId: string
      ocId: string
      paqueteId: string
      piezaIds: string[]
      esParo: boolean
    }
  | {
      tipo: 'PARAR_OC'
      odId: string
      ocId: string
      motivo: MotivoParo
      nota?: string
    }
  | { tipo: 'REANUDAR_OC'; odId: string; ocId: string }
  | { tipo: 'TERMINAR_OC'; odId: string; ocId: string }
  | { tipo: 'ACTUALIZAR_PERSONAL_OC'; odId: string; ocId: string; personas: number }
  | {
      tipo: 'MARCAR_PIEZA'
      odId: string
      ocId: string
      paqueteId: string
      piezaId: string
      real: number
    }
  | { tipo: 'INICIAR_SURTIDO'; solicitudId: string }
  | { tipo: 'PAUSAR_SURTIDO'; solicitudId: string; nota: string }
  | { tipo: 'REANUDAR_SURTIDO'; solicitudId: string }
  | { tipo: 'CONFIRMAR_SURTIDO'; solicitudId: string }
  | { tipo: 'CONFIRMAR_EMBARQUE'; odId: string }
  | { tipo: 'MARCAR_LEIDAS'; area: Area }
  | { tipo: 'REINICIAR' }
  | { tipo: 'REEMPLAZAR'; estado: Estado }

/** El tablero arranca vacío: los datos entran cuando alguien libera una OD. */
export function estadoInicial(): Estado {
  return { ods: [], solicitudes: [], notificaciones: [] }
}

/**
 * Completa campos nuevos sobre un estado persistido (localStorage / otra pestaña)
 * y traduce los nombres viejos (`CUBO`, `PARO_MATERIAL`, `COMPLETADA`).
 * Sin esto, OCs viejas no tienen `paros` y `relojOD` truena al hacer `.map`.
 */
export function hidratarEstado(estado: Estado): Estado {
  return {
    ods: (estado.ods ?? []).map(hidratarOD),
    solicitudes: (estado.solicitudes ?? []).map(hidratarSolicitud),
    notificaciones: (estado.notificaciones ?? []).map((n) => ({
      ...n,
      para: migrarArea(n.para),
    })),
  }
}

/** El área CUBO se renombró a MATERIAL_EMPAQUE. */
function migrarArea(area: Area | 'CUBO'): Area {
  return area === 'CUBO' ? 'MATERIAL_EMPAQUE' : area
}

function migrarSurtidor(s: Surtidor | 'CUBO'): Surtidor {
  return s === 'CUBO' ? 'MATERIAL_EMPAQUE' : s
}

function hidratarSolicitud(s: Solicitud): Solicitud {
  return { ...s, surtidor: migrarSurtidor(s.surtidor) }
}

function hidratarOD(od: OD): OD {
  const crudo = od.estado as string
  let estado = od.estado
  if (crudo === 'PARO_MATERIAL') estado = 'PARADA'
  // Antes `COMPLETADA` era el final del flujo; ahora falta pasar por Embarques.
  if (crudo === 'COMPLETADA') estado = 'EN_EMBARQUE'
  const cliente = od.cliente || (od.ocs ?? [])[0]?.cliente || ''
  const ocs = (od.ocs ?? []).map((oc) => hidratarOC(oc, { ...od, estado, cliente }))
  return {
    ...od,
    tipo: od.tipo ?? 'MEXICO',
    estado,
    cliente,
    ocs,
  }
}

function hidratarOC(oc: OC, od: OD): OC {
  let estado = oc.estado
  if (!estado) {
    if (od.estado === 'EN_EMBARQUE' || od.estado === 'EMBARCADA') estado = 'COMPLETADA'
    else if (od.estado === 'PARADA') estado = 'PARADA'
    else if (od.iniciadaEn !== undefined) estado = 'EN_PREPARACION'
    else estado = 'PENDIENTE'
  }
  return {
    ...oc,
    cliente: od.cliente,
    kg: oc.kg ?? 0,
    estado,
    surtidor: migrarSurtidor(oc.surtidor),
    paros: oc.paros ?? [],
    paquetes: (oc.paquetes ?? []).map((p) => ({
      ...p,
      piezas: (p.piezas ?? []).map(hidratarPieza),
    })),
  }
}

function hidratarPieza(pz: { id: string; color: string; cantidad: number; real?: number; disponible?: boolean }) {
  const cantidad = pz.cantidad ?? 0
  const real = Math.max(0, Math.min(cantidad, Math.floor(pz.real ?? (pz.disponible ? cantidad : 0))))
  return { ...pz, cantidad, real, disponible: real >= cantidad }
}

function aplicarReal<T extends { cantidad: number }>(pieza: T, real: number): T & { real: number; disponible: boolean } {
  const r = Math.max(0, Math.min(pieza.cantidad, Math.floor(Number.isFinite(real) ? real : 0)))
  return { ...pieza, real: r, disponible: r >= pieza.cantidad }
}

let seq = 0
function uid(prefijo: string): string {
  seq += 1
  return `${prefijo}-${Date.now().toString(36)}-${seq}`
}

function notificar(
  estado: Estado,
  n: Omit<Notificacion, 'id' | 't' | 'leida'> & { t?: number },
): Notificacion[] {
  const nueva: Notificacion = {
    id: uid('nt'),
    t: n.t ?? Date.now(),
    leida: false,
    para: n.para,
    titulo: n.titulo,
    detalle: n.detalle,
    severidad: n.severidad,
    refId: n.refId,
  }
  // Tope de 60: el tablero de piso sólo necesita lo reciente.
  return [nueva, ...estado.notificaciones].slice(0, 60)
}

function buscarOC(od: OD, ocId: string) {
  return od.ocs.find((oc) => oc.id === ocId)
}

/** Una OD sigue en manos de Preparación mientras no pase a Embarques. */
export function enPreparacion(od: OD): boolean {
  return od.estado === 'EN_PREPARACION' || od.estado === 'PARADA'
}

/** El estado de la OD se deriva de sus OC. */
function recalcularEstadoOD(od: OD, ahora: number): OD {
  if (od.iniciadaEn === undefined) return od
  if (od.estado === 'EMBARCADA') return od
  if (od.ocs.every((oc) => oc.estado === 'COMPLETADA')) {
    // Preparación terminó: la OD se forma en la cola de Embarques.
    return {
      ...od,
      estado: 'EN_EMBARQUE',
      terminadaEn: od.terminadaEn ?? ahora,
    }
  }
  const siguiente = od.ocs.some((oc) => oc.estado === 'PARADA') ? 'PARADA' : 'EN_PREPARACION'
  if (od.estado === siguiente && od.terminadaEn === undefined) return od
  return { ...od, estado: siguiente, terminadaEn: undefined }
}

function reemplazarOC(od: OD, ocId: string, ahora: number, fn: (oc: OC) => OC): OD {
  return recalcularEstadoOD(
    {
      ...od,
      ocs: od.ocs.map((oc) => (oc.id === ocId ? fn(oc) : oc)),
    },
    ahora,
  )
}

function ocCompleta(oc: OC): boolean {
  return oc.paquetes.every((p) => p.piezas.every((pz) => pz.disponible))
}

function cerrarParoAbierto(oc: OC, ahora: number): OC {
  const paros = oc.paros ?? []
  let idx = -1
  for (let i = paros.length - 1; i >= 0; i--) {
    if (paros[i].cerradoEn === undefined) {
      idx = i
      break
    }
  }
  if (idx < 0) return oc
  return {
    ...oc,
    paros: paros.map((p, i) => (i === idx ? { ...p, cerradoEn: ahora } : p)),
  }
}

export function reducer(estado: Estado, accion: Accion): Estado {
  const ahora = Date.now()

  switch (accion.tipo) {
    case 'REEMPLAZAR':
      return hidratarEstado(accion.estado)

    case 'REINICIAR':
      return estadoInicial()

    case 'LIBERAR_OD': {
      const od = nuevaOD(ahora)
      return {
        ...estado,
        ods: [...estado.ods, od],
        notificaciones: notificar(estado, {
          para: 'PREPARACION',
          titulo: `Nueva ${od.folio}`,
          detalle: `${od.cliente} · ${od.ocs.length} OC${od.prioridad === 'URGENTE' ? ' · URGENTE' : ''}`,
          severidad: od.prioridad === 'URGENTE' ? 'alerta' : 'info',
          refId: od.id,
        }),
      }
    }

    case 'INICIAR_PREPARACION': {
      const od = estado.ods.find((o) => o.id === accion.odId)
      if (!od || od.iniciadaEn !== undefined) return estado
      const ocs = od.ocs.map((oc) => ({
        ...oc,
        estado: 'EN_PREPARACION' as const,
        personas: Math.max(0, Math.floor(accion.personasPorOc[oc.id] ?? 0)),
      }))
      const total = ocs.reduce((acc, oc) => acc + (oc.personas ?? 0), 0)
      if (total < 1) return estado
      return {
        ...estado,
        ods: estado.ods.map((o) =>
          o.id === od.id
            ? { ...o, iniciadaEn: ahora, estado: 'EN_PREPARACION', ocs }
            : o,
        ),
      }
    }

    case 'PARAR_OC': {
      const od = estado.ods.find((o) => o.id === accion.odId)
      const oc = od && buscarOC(od, accion.ocId)
      if (!od || !oc || oc.estado !== 'EN_PREPARACION') return estado
      if (accion.motivo === 'OTRO' && !(accion.nota ?? '').trim()) return estado

      const ocParada: OC = {
        ...oc,
        estado: 'PARADA',
        paros: [
          ...(oc.paros ?? []),
          {
            iniciadoEn: ahora,
            motivo: accion.motivo,
            nota: accion.nota?.trim() || undefined,
          },
        ],
      }
      const odParada = reemplazarOC(od, oc.id, ahora, () => ocParada)

      let solicitudes = estado.solicitudes
      let notificaciones = estado.notificaciones
      const detalle =
        accion.motivo === 'OTRO'
          ? (accion.nota ?? '').trim()
          : ETIQUETA_MOTIVO_PARO[accion.motivo]

      if (accion.motivo === 'FALTA_MATERIAL') {
        const nuevas: Solicitud[] = []
        for (const paquete of oc.paquetes) {
          const piezaIds = paquete.piezas.filter((p) => !p.disponible).map((p) => p.id)
          if (piezaIds.length === 0) continue
          const yaAbierta = solicitudes.some(
            (s) => s.paqueteId === paquete.id && s.estado !== 'SURTIDA',
          )
          if (yaAbierta) continue
          nuevas.push({
            id: uid('sl'),
            odId: od.id,
            ocId: oc.id,
            paqueteId: paquete.id,
            piezaIds,
            surtidor: oc.surtidor,
            esParo: true,
            estado: 'SOLICITADA',
            creadaEn: ahora,
            eventos: [{ t: ahora, tipo: 'SOLICITADA' }],
          })
        }
        solicitudes = [...solicitudes, ...nuevas]
        notificaciones = notificar(
          { ...estado, notificaciones },
          {
            para: oc.surtidor,
            titulo: `PARO en ${od.folio} · ${oc.folio}`,
            detalle:
              nuevas.length > 0
                ? `${detalle} · ${nuevas.length} paquete(s) a surtir`
                : detalle,
            severidad: 'critica',
            refId: od.id,
          },
        )
      } else {
        notificaciones = notificar(estado, {
          para: 'PREPARACION',
          titulo: `Paro en ${od.folio} · ${oc.folio}`,
          detalle,
          severidad: 'alerta',
          refId: od.id,
        })
      }

      return {
        ...estado,
        solicitudes,
        notificaciones,
        ods: estado.ods.map((o) => (o.id === od.id ? odParada : o)),
      }
    }

    case 'REANUDAR_OC': {
      const od = estado.ods.find((o) => o.id === accion.odId)
      const oc = od && buscarOC(od, accion.ocId)
      if (!od || !oc || oc.estado !== 'PARADA') return estado
      const odNueva = reemplazarOC(od, oc.id, ahora, (actual) => ({
        ...cerrarParoAbierto(actual, ahora),
        estado: 'EN_PREPARACION',
      }))
      return {
        ...estado,
        ods: estado.ods.map((o) => (o.id === od.id ? odNueva : o)),
      }
    }

    case 'TERMINAR_OC': {
      const od = estado.ods.find((o) => o.id === accion.odId)
      const oc = od && buscarOC(od, accion.ocId)
      if (!od || !oc || oc.estado === 'COMPLETADA' || !ocCompleta(oc)) return estado
      const odNueva = reemplazarOC(od, oc.id, ahora, (actual) => ({
        ...cerrarParoAbierto(actual, ahora),
        estado: 'COMPLETADA',
        terminadaEn: ahora,
      }))
      // Al cerrar la última OC, la OD se forma en Embarques.
      const notificaciones =
        odNueva.estado === 'EN_EMBARQUE' && od.estado !== 'EN_EMBARQUE'
          ? notificar(estado, {
              para: 'EMBARQUES',
              titulo: `Lista para cargar · ${od.folio}`,
              detalle: `${od.cliente} · ${od.ocs.length} OC`,
              severidad: od.prioridad === 'URGENTE' ? 'alerta' : 'info',
              refId: od.id,
            })
          : estado.notificaciones
      return {
        ...estado,
        notificaciones,
        ods: estado.ods.map((o) => (o.id === od.id ? odNueva : o)),
      }
    }

    case 'ACTUALIZAR_PERSONAL_OC': {
      const od = estado.ods.find((o) => o.id === accion.odId)
      const oc = od && buscarOC(od, accion.ocId)
      if (!od || !oc || oc.estado === 'PENDIENTE' || oc.estado === 'COMPLETADA') return estado
      const personas = Math.max(0, Math.floor(accion.personas))
      return {
        ...estado,
        ods: estado.ods.map((o) =>
          o.id === od.id
            ? { ...o, ocs: o.ocs.map((x) => (x.id === oc.id ? { ...x, personas } : x)) }
            : o,
        ),
      }
    }

    case 'MARCAR_PIEZA': {
      const od = estado.ods.find((o) => o.id === accion.odId)
      const oc = od && buscarOC(od, accion.ocId)
      const paquete = oc?.paquetes.find((p) => p.id === accion.paqueteId)
      const pieza = paquete?.piezas.find((p) => p.id === accion.piezaId)
      if (!od || !oc || !paquete || !pieza || oc.estado === 'COMPLETADA') return estado
      const odNueva = {
        ...od,
        ocs: od.ocs.map((x) =>
          x.id !== oc.id
            ? x
            : {
                ...x,
                paquetes: x.paquetes.map((p) =>
                  p.id !== paquete.id
                    ? p
                    : {
                        ...p,
                        piezas: p.piezas.map((pz) =>
                          pz.id === pieza.id ? aplicarReal(pz, accion.real) : pz,
                        ),
                      },
                ),
              },
        ),
      }
      return {
        ...estado,
        ods: estado.ods.map((o) => (o.id === od.id ? odNueva : o)),
      }
    }

    case 'SOLICITAR_MATERIAL': {
      const od = estado.ods.find((o) => o.id === accion.odId)
      const oc = od && buscarOC(od, accion.ocId)
      if (!od || !oc || accion.piezaIds.length === 0) return estado

      // No se duplica una solicitud abierta del mismo paquete.
      const yaAbierta = estado.solicitudes.some(
        (s) => s.paqueteId === accion.paqueteId && s.estado !== 'SURTIDA',
      )
      if (yaAbierta) return estado

      const paquete = oc.paquetes.find((p) => p.id === accion.paqueteId)
      const colores = (paquete?.piezas ?? [])
        .filter((p) => accion.piezaIds.includes(p.id))
        .map((p) => p.color)

      const solicitud: Solicitud = {
        id: uid('sl'),
        odId: od.id,
        ocId: oc.id,
        paqueteId: accion.paqueteId,
        piezaIds: accion.piezaIds,
        surtidor: oc.surtidor,
        esParo: accion.esParo,
        estado: 'SOLICITADA',
        creadaEn: ahora,
        eventos: [{ t: ahora, tipo: 'SOLICITADA' }],
      }

      const solicitudes = [...estado.solicitudes, solicitud]
      return {
        ...estado,
        solicitudes,
        ods: estado.ods.map((o) => (o.id === od.id ? recalcularEstadoOD(o, ahora) : o)),
        notificaciones: notificar(estado, {
          para: oc.surtidor,
          titulo: accion.esParo
            ? `PARO en ${od.folio} · ${oc.folio}`
            : `Pedido de material · ${oc.folio}`,
          detalle: `${paquete?.clave ?? ''} faltan: ${colores.join(', ')}`,
          severidad: accion.esParo ? 'critica' : 'info',
          refId: solicitud.id,
        }),
      }
    }

    case 'INICIAR_SURTIDO': {
      const s = estado.solicitudes.find((x) => x.id === accion.solicitudId)
      if (!s || s.estado === 'SURTIDA' || s.estado === 'EN_SURTIDO') return estado
      const primeraVez = s.estado === 'SOLICITADA'
      return {
        ...estado,
        solicitudes: estado.solicitudes.map((x) =>
          x.id === s.id
            ? {
                ...x,
                estado: 'EN_SURTIDO',
                eventos: [
                  ...x.eventos,
                  { t: ahora, tipo: primeraVez ? 'INICIO_SURTIDO' : 'REANUDA' },
                ],
              }
            : x,
        ),
      }
    }

    case 'REANUDAR_SURTIDO': {
      const s = estado.solicitudes.find((x) => x.id === accion.solicitudId)
      if (!s || s.estado !== 'PAUSADA') return estado
      return {
        ...estado,
        solicitudes: estado.solicitudes.map((x) =>
          x.id === s.id
            ? { ...x, estado: 'EN_SURTIDO', eventos: [...x.eventos, { t: ahora, tipo: 'REANUDA' }] }
            : x,
        ),
      }
    }

    case 'PAUSAR_SURTIDO': {
      const s = estado.solicitudes.find((x) => x.id === accion.solicitudId)
      if (!s || s.estado !== 'EN_SURTIDO') return estado
      const od = estado.ods.find((o) => o.id === s.odId)
      return {
        ...estado,
        solicitudes: estado.solicitudes.map((x) =>
          x.id === s.id
            ? {
                ...x,
                estado: 'PAUSADA',
                eventos: [...x.eventos, { t: ahora, tipo: 'PAUSA', nota: accion.nota }],
              }
            : x,
        ),
        // El reloj neto se congela; el bruto sigue. Preparación se entera.
        notificaciones: notificar(estado, {
          para: 'PREPARACION',
          titulo: `Surtido en espera · ${od?.folio ?? ''}`,
          detalle: accion.nota,
          severidad: 'alerta',
          refId: s.id,
        }),
      }
    }

    case 'CONFIRMAR_SURTIDO': {
      const s = estado.solicitudes.find((x) => x.id === accion.solicitudId)
      if (!s || s.estado === 'SURTIDA') return estado

      const solicitudes = estado.solicitudes.map((x) =>
        x.id === s.id
          ? {
              ...x,
              estado: 'SURTIDA' as const,
              cerradaEn: ahora,
              eventos: [...x.eventos, { t: ahora, tipo: 'SURTIDA' as const }],
            }
          : x,
      )

      const ods = estado.ods.map((o) => {
        if (o.id !== s.odId) return o
        const conPiezas: OD = {
          ...o,
          ocs: o.ocs.map((oc) =>
            oc.id !== s.ocId
              ? oc
              : {
                  ...oc,
                  paquetes: oc.paquetes.map((p) =>
                    p.id !== s.paqueteId
                      ? p
                      : {
                          ...p,
                          piezas: p.piezas.map((pz) =>
                            s.piezaIds.includes(pz.id)
                              ? aplicarReal(pz, pz.cantidad)
                              : pz,
                          ),
                        },
                  ),
                },
          ),
        }
        return recalcularEstadoOD(conPiezas, ahora)
      })

      const od = ods.find((o) => o.id === s.odId)
      return {
        ...estado,
        solicitudes,
        ods,
        notificaciones: notificar(estado, {
          para: 'PREPARACION',
          titulo: `Material surtido · ${od?.folio ?? ''}`,
          detalle: `${ETIQUETA_AREA[s.surtidor]} entregó ${s.piezaIds.length} pieza(s)`,
          severidad: 'info',
          refId: s.odId,
        }),
      }
    }

    case 'CONFIRMAR_EMBARQUE': {
      const od = estado.ods.find((o) => o.id === accion.odId)
      if (!od || od.estado !== 'EN_EMBARQUE') return estado
      return {
        ...estado,
        ods: estado.ods.map((o) =>
          o.id === od.id ? { ...o, estado: 'EMBARCADA', embarcadaEn: ahora } : o,
        ),
        notificaciones: notificar(estado, {
          para: 'FACTURACION',
          titulo: `Embarcada · ${od.folio}`,
          detalle: `${od.cliente} · salió de planta`,
          severidad: 'info',
          refId: od.id,
        }),
      }
    }

    case 'MARCAR_LEIDAS':
      return {
        ...estado,
        notificaciones: estado.notificaciones.map((n) =>
          n.para === accion.area ? { ...n, leida: true } : n,
        ),
      }

    default:
      return estado
  }
}

export type { Surtidor }
