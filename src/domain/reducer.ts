import { nuevaOD, semilla } from './seed'
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
import { ETIQUETA_MOTIVO_PARO } from './types'

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
  | { tipo: 'TERMINAR_OD'; odId: string }
  | { tipo: 'MARCAR_LEIDAS'; area: Area }
  | { tipo: 'TOGGLE_SIMULACION' }
  | { tipo: 'SIM_TICK'; t: number }
  | { tipo: 'REINICIAR' }
  | { tipo: 'REEMPLAZAR'; estado: Estado }

export function estadoInicial(): Estado {
  return { ods: semilla(), solicitudes: [], notificaciones: [], simulando: false }
}

/**
 * Completa campos nuevos sobre un estado persistido (localStorage / otra pestaña).
 * Sin esto, OCs viejas no tienen `paros` y `relojOD` truena al hacer `.map`.
 */
export function hidratarEstado(estado: Estado): Estado {
  return {
    ...estado,
    ods: (estado.ods ?? []).map(hidratarOD),
    solicitudes: estado.solicitudes ?? [],
    notificaciones: estado.notificaciones ?? [],
  }
}

function hidratarOD(od: OD): OD {
  const crudo = od.estado as string
  const estado = crudo === 'PARO_MATERIAL' ? 'PARADA' : od.estado
  return {
    ...od,
    tipo: od.tipo ?? 'MEXICO',
    estado,
    ocs: (od.ocs ?? []).map((oc) => hidratarOC(oc, { ...od, estado })),
  }
}

function hidratarOC(oc: OC, od: OD): OC {
  let estado = oc.estado
  if (!estado) {
    if (od.estado === 'COMPLETADA') estado = 'COMPLETADA'
    else if (od.estado === 'PARADA') estado = 'PARADA'
    else if (od.iniciadaEn !== undefined) estado = 'EN_PREPARACION'
    else estado = 'PENDIENTE'
  }
  return {
    ...oc,
    kg: oc.kg ?? 0,
    estado,
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

/** El estado de la OD se deriva de sus OC. */
function recalcularEstadoOD(od: OD, ahora: number): OD {
  if (od.iniciadaEn === undefined) return od
  if (od.ocs.every((oc) => oc.estado === 'COMPLETADA')) {
    return {
      ...od,
      estado: 'COMPLETADA',
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

    case 'TOGGLE_SIMULACION':
      return { ...estado, simulando: !estado.simulando }

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
      return {
        ...estado,
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
          para: oc.surtidor as Area,
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
          detalle: `${s.surtidor === 'CUBO' ? 'Cubo' : 'Almacén'} entregó ${s.piezaIds.length} pieza(s)`,
          severidad: 'info',
          refId: s.odId,
        }),
      }
    }

    case 'TERMINAR_OD': {
      const od = estado.ods.find((o) => o.id === accion.odId)
      if (!od || od.estado === 'COMPLETADA') return estado
      return {
        ...estado,
        ods: estado.ods.map((o) =>
          o.id === od.id ? { ...o, estado: 'COMPLETADA', terminadaEn: ahora } : o,
        ),
      }
    }

    case 'MARCAR_LEIDAS':
      return {
        ...estado,
        notificaciones: estado.notificaciones.map((n) =>
          n.para === accion.area ? { ...n, leida: true } : n,
        ),
      }

    case 'SIM_TICK':
      return simular(estado, accion.t)

    default:
      return estado
  }
}

// -------------------------------------------------------- motor de simulación

/**
 * Avanza el flujo solo para la demo: Facturación libera OD, Preparación arranca
 * y levanta paros, y Almacén/Cubo surte, pausa lo que no tiene y adelanta otro
 * pedido. Se apaga desde la barra superior.
 */
function simular(estado: Estado, t: number): Estado {
  let siguiente = estado
  const dado = () => Math.random()

  // Facturación libera de vez en cuando.
  if (dado() < 0.15) siguiente = reducer(siguiente, { tipo: 'LIBERAR_OD' })

  // Preparación arranca la OD más antigua sin iniciar.
  const pendiente = siguiente.ods.find((o) => o.iniciadaEn === undefined)
  if (pendiente && dado() < 0.5) {
    const personasPorOc = Object.fromEntries(pendiente.ocs.map((oc) => [oc.id, 1 + Math.floor(dado() * 3)]))
    siguiente = reducer(siguiente, {
      tipo: 'INICIAR_PREPARACION',
      odId: pendiente.id,
      personasPorOc,
    })
  }

  // Preparación detiene una OC (material o descanso) y luego la reanuda.
  const ocsActivas = siguiente.ods.flatMap((od) =>
    od.ocs
      .filter((oc) => oc.estado === 'EN_PREPARACION' || oc.estado === 'PARADA')
      .map((oc) => ({ od, oc })),
  )
  for (const { od, oc } of ocsActivas) {
    if (oc.estado === 'EN_PREPARACION' && dado() < 0.2) {
      siguiente = reducer(siguiente, {
        tipo: 'PARAR_OC',
        odId: od.id,
        ocId: oc.id,
        motivo: dado() < 0.7 ? 'FALTA_MATERIAL' : 'DESCANSO',
      })
      break
    }
    if (oc.estado === 'PARADA' && dado() < 0.25) {
      siguiente = reducer(siguiente, { tipo: 'REANUDAR_OC', odId: od.id, ocId: oc.id })
      break
    }
  }

  // Almacén/Cubo trabaja la cola.
  for (const s of siguiente.solicitudes) {
    if (s.estado === 'SURTIDA') continue
    if (s.estado === 'SOLICITADA' && dado() < 0.45) {
      siguiente = reducer(siguiente, { tipo: 'INICIAR_SURTIDO', solicitudId: s.id })
      continue
    }
    if (s.estado === 'EN_SURTIDO') {
      // Sin material: deja este surtido para después y adelanta otro.
      if (dado() < 0.2) {
        siguiente = reducer(siguiente, {
          tipo: 'PAUSAR_SURTIDO',
          solicitudId: s.id,
          nota: 'Sin existencia en rack, se adelanta otro pedido',
        })
      } else if (dado() < 0.4) {
        siguiente = reducer(siguiente, { tipo: 'CONFIRMAR_SURTIDO', solicitudId: s.id })
      }
      continue
    }
    if (s.estado === 'PAUSADA' && dado() < 0.15) {
      siguiente = reducer(siguiente, { tipo: 'REANUDAR_SURTIDO', solicitudId: s.id })
    }
  }

  // Preparación cierra cada OC cuando ya tiene todo.
  for (const od of siguiente.ods) {
    if (od.estado === 'COMPLETADA' || od.iniciadaEn === undefined) continue
    for (const oc of od.ocs) {
      if (oc.estado === 'COMPLETADA' || !ocCompleta(oc)) continue
      if (dado() < 0.6) {
        siguiente = reducer(siguiente, { tipo: 'TERMINAR_OC', odId: od.id, ocId: oc.id })
      }
    }
  }

  void t
  return siguiente
}

export type { Surtidor }
