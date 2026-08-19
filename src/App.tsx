import { useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { Notificaciones } from './components/Notificaciones'
import { PanelAlmacen } from './components/PanelAlmacen'
import { PanelEmbarques } from './components/PanelEmbarques'
import { PanelPreparacion } from './components/PanelPreparacion'
import { Boton } from './components/ui'
import { COLOR_AREA } from './components/tokens'
import { StoreProvider } from './domain/store'
import { useAhora, useStore } from './domain/hooks'
import type { Area } from './domain/types'

type Vista =
  | 'TABLERO'
  | 'PREPARACION'
  | 'ALMACEN'
  | 'MATERIAL_EMPAQUE'
  | 'EMBARQUES'
  | 'FACTURACION'

const VISTAS: { id: Vista; etiqueta: string; color: string; area?: Area }[] = [
  { id: 'TABLERO', etiqueta: 'Tablero', color: 'var(--text-muted)' },
  {
    id: 'PREPARACION',
    etiqueta: 'Preparación',
    color: COLOR_AREA.PREPARACION,
    area: 'PREPARACION',
  },
  { id: 'ALMACEN', etiqueta: 'Almacén', color: COLOR_AREA.ALMACEN, area: 'ALMACEN' },
  {
    id: 'MATERIAL_EMPAQUE',
    etiqueta: 'Material de Empaque',
    color: COLOR_AREA.MATERIAL_EMPAQUE,
    area: 'MATERIAL_EMPAQUE',
  },
  { id: 'EMBARQUES', etiqueta: 'Embarques', color: COLOR_AREA.EMBARQUES, area: 'EMBARQUES' },
  {
    id: 'FACTURACION',
    etiqueta: 'Facturación',
    color: COLOR_AREA.FACTURACION,
    area: 'FACTURACION',
  },
]

export default function App() {
  return (
    <StoreProvider>
      <Tablero />
    </StoreProvider>
  )
}

function Tablero() {
  const [vista, setVista] = useState<Vista>('TABLERO')
  const { dispatch } = useStore()
  const ahora = useAhora()
  const areaActual = VISTAS.find((v) => v.id === vista)?.area

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-2)' }}>
      <header
        className="sticky top-0 z-10 border-b px-4 py-3"
        style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="text-left">
            <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              Tiempos PT
            </h1>
            <p className="tabular text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(ahora).toLocaleTimeString('es-MX', { hour12: false })}
            </p>
          </div>

          <nav className="flex flex-wrap gap-1">
            {VISTAS.map((v) => {
              const activa = v.id === vista
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVista(v.id)}
                  className="rounded-lg px-3 py-2 text-sm font-medium"
                  style={{
                    background: activa ? 'var(--surface-3)' : 'transparent',
                    color: 'var(--text-primary)',
                    borderBottom: `2px solid ${activa ? v.color : 'transparent'}`,
                  }}
                >
                  {v.etiqueta}
                </button>
              )
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <Boton tono="primario" onClick={() => dispatch({ tipo: 'LIBERAR_OD' })}>
              + Liberar OD
            </Boton>
            <Boton onClick={() => dispatch({ tipo: 'REINICIAR' })}>Limpiar tablero</Boton>
            {areaActual && <Notificaciones area={areaActual} />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-4">
        {vista === 'TABLERO' && <Dashboard />}
        {vista === 'PREPARACION' && <PanelPreparacion />}
        {vista === 'ALMACEN' && <PanelAlmacen area="ALMACEN" />}
        {vista === 'MATERIAL_EMPAQUE' && <PanelAlmacen area="MATERIAL_EMPAQUE" />}
        {vista === 'EMBARQUES' && <PanelEmbarques />}
        {/* Facturación no captura tiempos: ve el mismo tablero que el resto. */}
        {vista === 'FACTURACION' && <Dashboard />}
      </main>

      <footer
        className="mx-auto max-w-[1600px] px-4 pb-6 text-left text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        <p>
          Reloj <strong>neto</strong> = tiempo trabajando por el área. Reloj <strong>total</strong> =
          desde que se pidió hasta que se entregó, esperas incluidas. Abre esta misma dirección en
          otra pestaña o equipo del mismo navegador para ver cada área en su propia pantalla.
        </p>
      </footer>
    </div>
  )
}
