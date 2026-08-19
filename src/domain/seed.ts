import type { OC, OD, Paquete, Pieza, Surtidor, TipoDestino } from './types'

/** Datos simulados. Se reemplazan cuando se conecte la fuente real de Facturación. */

const CLIENTES = [
  'Comercial del Norte',
  'Distribuidora Bajío',
  'Grupo Peninsular',
  'Autoservicio Centro',
  'Mayoreo Pacífico',
  'Cadena Sureste',
  'Abarrotera Regional',
]

const COLORES = [
  'Blanco',
  'Negro',
  'Azul rey',
  'Rojo',
  'Verde bandera',
  'Amarillo',
  'Gris jaspe',
  'Vino',
  'Beige',
]

const CLAVES = ['PT-1020', 'PT-2045', 'PT-3310', 'PT-4180', 'PT-5502', 'PT-6714']

let contador = 1
/** 1 Foráneo por cada 3 México, intercalados. */
let contadorTipo = 0

function siguienteTipo(): TipoDestino {
  const i = contadorTipo
  contadorTipo += 1
  return i % 4 === 0 ? 'FORANEO' : 'MEXICO'
}

function elige<T>(xs: readonly T[]): T {
  return xs[Math.floor(Math.random() * xs.length)]
}

function entre(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function id(prefijo: string): string {
  return `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function nuevaPieza(color: string): Pieza {
  const cantidad = entre(4, 60)
  const disponible = Math.random() > 0.35
  return {
    id: id('pz'),
    color,
    cantidad,
    real: disponible ? cantidad : 0,
    disponible,
  }
}

function nuevoPaquete(): Paquete {
  const usados = new Set<string>()
  const piezas: Pieza[] = []
  const cuantos = entre(1, 4)
  while (piezas.length < cuantos) {
    const color = elige(COLORES)
    if (usados.has(color)) continue
    usados.add(color)
    piezas.push(nuevaPieza(color))
  }
  return { id: id('pq'), clave: elige(CLAVES), piezas }
}

function nuevaOC(surtidor: Surtidor): OC {
  return {
    id: id('oc'),
    folio: `OC-${String(entre(10000, 99999))}`,
    surtidor,
    paquetes: Array.from({ length: entre(1, 3) }, nuevoPaquete),
    kg: entre(20, 350),
    estado: 'PENDIENTE',
    paros: [],
  }
}

/** Crea una Distribución Liberada en `liberadaEn` (default: ahora). */
export function nuevaOD(liberadaEn = Date.now()): OD {
  const cuantasOC = entre(1, 4)
  return {
    id: id('od'),
    folio: `OD-${String(24000 + contador++)}`,
    cliente: elige(CLIENTES),
    tipo: siguienteTipo(),
    prioridad: Math.random() > 0.8 ? 'URGENTE' : 'NORMAL',
    estado: 'LIBERADA',
    ocs: Array.from({ length: cuantasOC }, () =>
      nuevaOC(Math.random() > 0.5 ? 'ALMACEN' : 'CUBO'),
    ),
    liberadaEn,
  }
}

/** Carga inicial: unas cuantas OD escalonadas hacia atrás en el tiempo. */
export function semilla(): OD[] {
  const ahora = Date.now()
  return [
    nuevaOD(ahora - 26 * 60_000),
    nuevaOD(ahora - 18 * 60_000),
    nuevaOD(ahora - 9 * 60_000),
    nuevaOD(ahora - 3 * 60_000),
  ]
}
