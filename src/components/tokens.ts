/** Color por área. Vive fuera de ui.tsx para no romper el fast refresh. */
export const COLOR_AREA = {
  FACTURACION: 'var(--area-fact)',
  PREPARACION: 'var(--area-prep)',
  ALMACEN: 'var(--area-alm)',
  CUBO: 'var(--area-cubo)',
} as const
