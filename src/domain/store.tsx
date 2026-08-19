import { useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { StoreCtx } from './contexto'
import { estadoInicial, hidratarEstado, reducer } from './reducer'
import type { Estado } from './types'

const LLAVE = 'tiempos_pt.estado.v3'
const CANAL = 'tiempos_pt'

function cargar(): Estado {
  try {
    const crudo = localStorage.getItem(LLAVE)
    if (!crudo) return estadoInicial()
    const guardado = JSON.parse(crudo) as Estado
    if (!Array.isArray(guardado.ods)) return estadoInicial()
    return hidratarEstado({ ...estadoInicial(), ...guardado })
  } catch {
    return estadoInicial()
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [estado, dispatch] = useReducer(reducer, undefined, cargar)
  const desdeRemoto = useRef(false)
  const canal = useRef<BroadcastChannel | null>(null)

  // Las otras pestañas (Preparación en una, Almacén en otra) reciben el estado
  // ya reducido: así no se re-ejecutan acciones no deterministas por duplicado.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(CANAL)
    canal.current = bc
    const alRecibir = (ev: MessageEvent<Estado>) => {
      desdeRemoto.current = true
      dispatch({ tipo: 'REEMPLAZAR', estado: ev.data })
    }
    bc.addEventListener('message', alRecibir)
    return () => {
      bc.removeEventListener('message', alRecibir)
      bc.close()
      canal.current = null
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(LLAVE, JSON.stringify(estado))
    if (desdeRemoto.current) {
      desdeRemoto.current = false
      return
    }
    canal.current?.postMessage(estado)
  }, [estado])

  const valor = useMemo(() => ({ estado, dispatch }), [estado])
  return <StoreCtx.Provider value={valor}>{children}</StoreCtx.Provider>
}
