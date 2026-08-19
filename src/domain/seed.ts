import {
  CLIENTES,
  type Cliente,
  type OC,
  type OD,
  type Paquete,
  type Pieza,
  type Surtidor,
  type TipoDestino,
} from './types'

/**
 * Alta provisional de OD.
 *
 * Es el único punto del proyecto que inventa datos, y existe sólo porque
 * todavía no hay captura real de Facturación: el botón «+ Liberar OD» arma
 * una OD con folios y cantidades verosímiles para poder cronometrar el piso.
 * Se reemplaza completo cuando exista el formato de captura / la conexión
 * con el sistema de Facturación. No hay motor de simulación: nada se mueve
 * solo, cada evento lo registra una persona desde su pantalla.
 */

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

/** Una OD nace sin nada en piso: Preparación captura el real conforme avanza. */
function nuevaPieza(color: string): Pieza {
  return {
    id: id('pz'),
    color,
    cantidad: entre(4, 60),
    real: 0,
    disponible: false,
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

function nuevaOC(surtidor: Surtidor, cliente: Cliente): OC {
  return {
    id: id('oc'),
    folio: `OC-${String(entre(10000, 99999))}`,
    cliente,
    surtidor,
    paquetes: Array.from({ length: entre(1, 3) }, nuevoPaquete),
    kg: entre(20, 350),
    estado: 'PENDIENTE',
    paros: [],
  }
}

/** Crea una OD liberada por Facturación en `liberadaEn` (default: ahora). */
export function nuevaOD(liberadaEn = Date.now()): OD {
  const cuantasOC = entre(1, 4)
  const cliente = elige(CLIENTES)
  const ocs = Array.from({ length: cuantasOC }, () =>
    nuevaOC(Math.random() > 0.5 ? 'ALMACEN' : 'MATERIAL_EMPAQUE', cliente),
  )
  return {
    id: id('od'),
    folio: `OD-${String(24000 + contador++)}`,
    cliente,
    tipo: siguienteTipo(),
    prioridad: Math.random() > 0.8 ? 'URGENTE' : 'NORMAL',
    estado: 'LIBERADA',
    ocs,
    liberadaEn,
  }
}
