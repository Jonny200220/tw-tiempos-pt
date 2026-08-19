import { createContext } from 'react'
import type { Accion } from './reducer'
import type { Estado } from './types'

export interface Ctx {
  estado: Estado
  dispatch: (a: Accion) => void
}

export const StoreCtx = createContext<Ctx | null>(null)
