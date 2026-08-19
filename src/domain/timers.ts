import type { OC, OD, Solicitud } from './types'

/** Umbrales de semáforo, en minutos. */
export const UMBRALES = {
  /** Facturación libera → Preparación arranca. */
  esperaArranque: { alerta: 10, critico: 20 },
  /** Reloj neto de Preparación sobre una OD. */
  preparacion: { alerta: 30, critico: 60 },
  /** Reloj neto de Almacén/Cubo sobre una solicitud. */
  surtido: { alerta: 8, critico: 15 },
  /** Reloj bruto de una solicitud (incluye espera sin material). */
  surtidoTotal: { alerta: 20, critico: 45 },
} as const

export type Semaforo = 'ok' | 'alerta' | 'critico'

export function semaforo(ms: number, umbral: { alerta: number; critico: number }): Semaforo {
  const min = ms / 60_000
  if (min >= umbral.critico) return 'critico'
  if (min >= umbral.alerta) return 'alerta'
  return 'ok'
}

/** `1h 04:37` / `04:37` — pensado para leerse de un jalón en pantalla de piso. */
export function formatDuracion(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}h ${mm}:${ss}` : `${mm}:${ss}`
}

export function formatHora(t: number): string {
  return new Date(t).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Promedio en ms de una lista; 0 si está vacía. */
export function promedio(valores: number[]): number {
  if (valores.length === 0) return 0
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

type Intervalo = [number, number]

/** Une intervalos traslapados para no contar dos veces un mismo minuto de paro. */
function unir(intervalos: Intervalo[]): Intervalo[] {
  if (intervalos.length === 0) return []
  const orden = [...intervalos].sort((a, b) => a[0] - b[0])
  const salida: Intervalo[] = [orden[0]]
  for (const [ini, fin] of orden.slice(1)) {
    const ultimo = salida[salida.length - 1]
    if (ini <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], fin)
    else salida.push([ini, fin])
  }
  return salida
}

function sumar(intervalos: Intervalo[]): number {
  return intervalos.reduce((acc, [ini, fin]) => acc + (fin - ini), 0)
}

// ---------------------------------------------------------------- solicitudes

export interface RelojSolicitud {
  /** Desde que Preparación pidió hasta que recibió. Incluye esperas. */
  bruto: number
  /** Sólo los tramos en que Almacén/Cubo estuvo trabajando la solicitud. */
  neto: number
  /** Tiempo parada por no haber material (bruto − neto − tiempo previo al arranque). */
  espera: number
  /** true mientras el reloj neto sigue corriendo. */
  corriendo: boolean
}

export function relojSolicitud(s: Solicitud, ahora: number): RelojSolicitud {
  const fin = s.cerradaEn ?? ahora
  const bruto = fin - s.creadaEn

  const tramos: Intervalo[] = []
  let abierto: number | null = null
  for (const ev of s.eventos) {
    if (ev.tipo === 'INICIO_SURTIDO' || ev.tipo === 'REANUDA') {
      if (abierto === null) abierto = ev.t
    } else if (ev.tipo === 'PAUSA' || ev.tipo === 'SURTIDA') {
      if (abierto !== null) {
        tramos.push([abierto, ev.t])
        abierto = null
      }
    }
  }
  const corriendo = abierto !== null && !s.cerradaEn
  if (abierto !== null) tramos.push([abierto, fin])

  const neto = sumar(unir(tramos))
  return { bruto, neto, espera: bruto - neto, corriendo }
}

// ------------------------------------------------------------------------ OD

export interface RelojOD {
  /** Facturación liberó → Preparación arrancó. Tiempo muerto entre áreas. */
  esperaArranque: number
  /** Preparación trabajando, descontando los paros por falta de material. */
  prepNeto: number
  /** Preparación de punta a punta, con paros incluidos. */
  prepBruto: number
  /** Suma de paros por falta de material sobre esta OD (sin doble conteo). */
  paroMaterial: number
  /** Liberación → cierre. El número que ve el cliente. */
  ciclo: number
}

export function relojOD(od: OD, solicitudes: Solicitud[], ahora: number): RelojOD {
  const fin = od.terminadaEn ?? ahora
  const ciclo = fin - od.liberadaEn
  const esperaArranque = (od.iniciadaEn ?? ahora) - od.liberadaEn

  if (od.iniciadaEn === undefined) {
    return { esperaArranque, prepNeto: 0, prepBruto: 0, paroMaterial: 0, ciclo }
  }

  const prepBruto = fin - od.iniciadaEn
  const parosOC = od.ocs.flatMap((oc) =>
    (oc.paros ?? []).map<Intervalo>((p) => [p.iniciadoEn, Math.min(p.cerradoEn ?? ahora, fin)]),
  )
  const parosSolicitud = solicitudes
    .filter((s) => s.odId === od.id && s.esParo)
    .map<Intervalo>((s) => [s.creadaEn, Math.min(s.cerradaEn ?? ahora, fin)])
  const paroMaterial = sumar(
    unir(
      [...parosOC, ...parosSolicitud].filter(([ini, f]) => f > ini),
    ),
  )
  return {
    esperaArranque,
    prepNeto: Math.max(0, prepBruto - paroMaterial),
    prepBruto,
    paroMaterial,
    ciclo,
  }
}

export interface RelojOC {
  prepNeto: number
  prepBruto: number
  paro: number
}

/** Relojes de una OC desde que Preparación tomó su OD. */
export function relojOC(od: OD, oc: OC, ahora: number): RelojOC {
  if (od.iniciadaEn === undefined) {
    return { prepNeto: 0, prepBruto: 0, paro: 0 }
  }
  const fin = oc.terminadaEn ?? ahora
  const prepBruto = Math.max(0, fin - od.iniciadaEn)
  const paro = sumar(
    unir(
      (oc.paros ?? [])
        .map<Intervalo>((p) => [p.iniciadoEn, Math.min(p.cerradoEn ?? ahora, fin)])
        .filter(([ini, f]) => f > ini),
    ),
  )
  return { prepBruto, paro, prepNeto: Math.max(0, prepBruto - paro) }
}

/** Suma de cantidades (piezas físicas) de una OC. */
export function piezasDeOC(oc: OC): number {
  let n = 0
  for (const p of oc.paquetes) {
    for (const pieza of p.piezas) n += pieza.cantidad
  }
  return n
}

export function piezasDeOD(od: OD): number {
  return od.ocs.reduce((acc, oc) => acc + piezasDeOC(oc), 0)
}

export function kgDeOD(od: OD): number {
  return od.ocs.reduce((acc, oc) => acc + (oc.kg ?? 0), 0)
}

/** Piezas surtidas / totales de una sola OC. */
export function avanceOC(oc: OC): { surtidas: number; total: number } {
  let surtidas = 0
  let total = 0
  for (const p of oc.paquetes) {
    for (const pieza of p.piezas) {
      total += 1
      if (pieza.disponible) surtidas += 1
    }
  }
  return { surtidas, total }
}

/** Piezas pendientes de surtir en una OD, para el contador de avance. */
export function avanceOD(od: OD): { surtidas: number; total: number } {
  let surtidas = 0
  let total = 0
  for (const oc of od.ocs) {
    for (const p of oc.paquetes) {
      for (const pieza of p.piezas) {
        total += 1
        if (pieza.disponible) surtidas += 1
      }
    }
  }
  return { surtidas, total }
}
