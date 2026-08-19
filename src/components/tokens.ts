import type { Area } from '../domain/types'

/** Color por área. Vive fuera de ui.tsx para no romper el fast refresh. */
export const COLOR_AREA: Record<Area, string> = {
  FACTURACION: 'var(--area-fact)',
  PREPARACION: 'var(--area-prep)',
  ALMACEN: 'var(--area-alm)',
  MATERIAL_EMPAQUE: 'var(--area-mat)',
  EMBARQUES: 'var(--area-emb)',
}
