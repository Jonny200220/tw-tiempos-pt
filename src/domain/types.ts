/**
 * Modelo de dominio del flujo
 * Facturación → Preparación → Almacén / Material de Empaque → Embarques.
 *
 * Una OD (Orden de Distribución) la libera Facturación y trae una o varias
 * OC (Órdenes de Compra). Cada OC trae paquetes; un paquete puede venir en
 * varios colores. Si Preparación no encuentra todos los colores de un paquete,
 * levanta un paro por falta de material y solicita el surtido al área que le
 * corresponde. Cuando todas las OC quedan completas, la OD pasa a Embarques.
 */

export type Area =
  | 'FACTURACION'
  | 'PREPARACION'
  | 'ALMACEN'
  | 'MATERIAL_EMPAQUE'
  | 'EMBARQUES'

/** Áreas que surten material a Preparación. */
export type Surtidor = Extract<Area, 'ALMACEN' | 'MATERIAL_EMPAQUE'>

export const SURTIDORES: readonly Surtidor[] = ['ALMACEN', 'MATERIAL_EMPAQUE']

export const ETIQUETA_AREA: Record<Area, string> = {
  FACTURACION: 'Facturación',
  PREPARACION: 'Preparación',
  ALMACEN: 'Almacén',
  MATERIAL_EMPAQUE: 'Material de Empaque',
  EMBARQUES: 'Embarques',
}

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

/** Cadenas que aparecen en piso. Cada OD tiene un único cliente; sus OC lo heredan. */
export const CLIENTES = ['Walmart', 'Soriana', 'Chedraui'] as const
export type Cliente = (typeof CLIENTES)[number]

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
  /** Cliente de la OC. Coincide con `od.cliente`; una OD no mezcla clientes. */
  cliente: string
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
  /** Preparación terminó todas las OC; la OD espera carga en Embarques. */
  | 'EN_EMBARQUE'
  /** Embarques confirmó la salida. Estado terminal. */
  | 'EMBARCADA'

export interface OD {
  id: string
  folio: string
  /** Cliente de la OD. Todas las OC de esta orden llevan el mismo. */
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
  /** Momento en que Preparación cerró la última OC. Arranca el reloj de Embarques. */
  terminadaEn?: number
  /** Momento en que Embarques confirmó la salida. Cierra el ciclo. */
  embarcadaEn?: number
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
 * Petición de material de Preparación a Almacén / Material de Empaque.
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
}
