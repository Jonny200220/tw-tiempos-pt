/**
 * Modelo de dominio del flujo Facturación → Preparación → Almacén/Cubo.
 *
 * Una OD (Orden de Distribución) la libera Facturación y trae una o varias
 * OC (Órdenes de Compra). Cada OC trae paquetes; un paquete puede venir en
 * varios colores. Si Preparación no encuentra todos los colores de un paquete,
 * levanta un paro por falta de material y solicita el surtido a Almacén/Cubo.
 */

export type Area = 'FACTURACION' | 'PREPARACION' | 'ALMACEN' | 'CUBO'

export type Surtidor = Extract<Area, 'ALMACEN' | 'CUBO'>

/** Un color concreto dentro de un paquete. Es la unidad mínima que se surte. */
export interface Pieza {
  id: string
  color: string
  /** Piezas pedidas (lo que sale en la OC). */
  cantidad: number
  /**
   * Piezas que Preparación ya tiene en piso (columna “Real” del formato).
   * Completo cuando `real >= cantidad`.
   */
  real: number
  /** true cuando `real >= cantidad`. */
  disponible: boolean
}

export interface Paquete {
  id: string
  clave: string
  piezas: Pieza[]
}

export type TipoDestino = 'FORANEO' | 'MEXICO'

export type EstadoOC = 'PENDIENTE' | 'EN_PREPARACION' | 'PARADA' | 'COMPLETADA'

export type MotivoParo = 'FALTA_MATERIAL' | 'DESCANSO' | 'OTRO'

export const ETIQUETA_TIPO: Record<TipoDestino, string> = {
  FORANEO: 'Foráneo',
  MEXICO: 'México',
}

export const ETIQUETA_MOTIVO_PARO: Record<MotivoParo, string> = {
  FALTA_MATERIAL: 'Falta de material',
  DESCANSO: 'Descanso / comida',
  OTRO: 'Otro',
}

export interface ParoOC {
  iniciadoEn: number
  cerradoEn?: number
  motivo: MotivoParo
  /** Texto libre cuando el motivo es OTRO. */
  nota?: string
}

export interface OC {
  id: string
  /** Folio visible de la orden de compra. */
  folio: string
  surtidor: Surtidor
  paquetes: Paquete[]
  kg: number
  estado: EstadoOC
  /** Personas asignadas al iniciar la preparación de la OD. */
  personas?: number
  paros: ParoOC[]
  terminadaEn?: number
}

export type EstadoOD =
  | 'LIBERADA'
  | 'EN_PREPARACION'
  | 'PARADA'
  | 'COMPLETADA'

export interface OD {
  id: string
  folio: string
  cliente: string
  /** Destino de la distribución: Foráneo o México. */
  tipo: TipoDestino
  prioridad: 'NORMAL' | 'URGENTE'
  estado: EstadoOD
  ocs: OC[]
  /** Momento en que Facturación bajó la OD. Arranca el reloj total. */
  liberadaEn: number
  /** Momento en que Preparación tomó la OD. Arranca el reloj de Preparación. */
  iniciadaEn?: number
  terminadaEn?: number
}

export type EstadoSolicitud = 'SOLICITADA' | 'EN_SURTIDO' | 'PAUSADA' | 'SURTIDA'

export type TipoEvento =
  | 'SOLICITADA'
  | 'INICIO_SURTIDO'
  | 'PAUSA'
  | 'REANUDA'
  | 'SURTIDA'

export interface EventoSolicitud {
  t: number
  tipo: TipoEvento
  nota?: string
}

/**
 * Petición de material de Preparación a Almacén/Cubo.
 *
 * Lleva dos relojes: el bruto corre desde `SOLICITADA` hasta `SURTIDA` sin
 * importar la causa (impacto real al pedido), y el neto sólo acumula los
 * tramos en `EN_SURTIDO` (desempeño del área, sin castigarla por falta de
 * inventario). Ver `timers.ts`.
 */
export interface Solicitud {
  id: string
  odId: string
  ocId: string
  paqueteId: string
  piezaIds: string[]
  surtidor: Surtidor
  /** true si nació de un paro de Preparación (no de una petición anticipada). */
  esParo: boolean
  estado: EstadoSolicitud
  creadaEn: number
  cerradaEn?: number
  eventos: EventoSolicitud[]
}

export interface Notificacion {
  id: string
  t: number
  para: Area
  titulo: string
  detalle: string
  severidad: 'info' | 'alerta' | 'critica'
  leida: boolean
  /** Solicitud u OD relacionada, para saltar al renglón. */
  refId?: string
}

export interface Estado {
  ods: OD[]
  solicitudes: Solicitud[]
  notificaciones: Notificacion[]
  /** Motor de simulación encendido/apagado. */
  simulando: boolean
}
