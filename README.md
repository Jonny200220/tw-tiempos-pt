# Tiempos PT — tablero en vivo

Mide cuánto tarda cada área en el flujo **Facturación → Preparación → Almacén/Cubo**,
con cronómetros que corren en pantalla.

```
Facturación          Preparación                 Almacén / Cubo
  libera OD  ──────►  toma la OD                   surte contra OC
              (espera   arma paquetes
              de        ¿falta un color? ─────►  entra a la cola
              arranque)   PARO MATERIAL            ¿hay material? ─► surte
                                                   ¿no hay? ──────► pausa y
                                                                    adelanta otro
                        ◄──── material entregado ──────────────────┘
                        cierra la OD
```

## Los relojes

Cada medición lleva **dos relojes**, para no confundir el desempeño del área con
un problema de abasto:

| Reloj | Qué mide | Dónde |
|---|---|---|
| Espera de arranque | Facturación liberó → Preparación tomó la OD | tarjeta de OD |
| Prep neto | Preparación trabajando, **descontando** los paros por material | Preparación |
| Prep total | Preparación de punta a punta, paros incluidos | Preparación |
| Neto área | Sólo los tramos en que Almacén/Cubo estuvo surtiendo | Almacén/Cubo |
| Total pedido | Solicitud → entrega, con esperas incluidas | Almacén/Cubo |
| Ciclo OD | Liberación → cierre. El número que ve el cliente | Preparación |

Cuando Almacén oprime **Dejar para después** (sin existencia, material en tránsito,
se adelanta otro pedido), el reloj *neto* se congela y el *total* sigue corriendo.
Así el área no carga con el tiempo que no depende de ella, y el impacto real al
pedido tampoco se pierde de vista.

Umbrales de semáforo en `src/domain/timers.ts` → `UMBRALES`. Cada color va siempre
acompañado de un glifo (● ▲ ■) y su etiqueta.

## Estructura

```
src/
  domain/
    types.ts     modelo: OD → OC → paquetes → piezas (colores)
    timers.ts    cálculo de relojes, semáforos y formato
    reducer.ts   reglas de negocio + motor de simulación
    store.tsx    persistencia y sincronización entre pestañas
    hooks.ts     useStore / useAhora
  components/
    Dashboard.tsx        tablero de 4 áreas + KPIs
    PanelPreparacion.tsx pantalla de piso de Preparación
    PanelAlmacen.tsx     pantalla de Almacén y de Cubo
    Notificaciones.tsx   campana por área
```

## Correr

```bash
pnpm install
pnpm dev
```

Abre la misma dirección en otra pestaña o equipo para que cada área tenga su
pantalla: el estado se sincroniza por `BroadcastChannel` y se guarda en
`localStorage`.

**▶ Simular flujo** enciende un motor que genera OD, levanta paros y surte solo,
para ver el tablero con movimiento. **Reiniciar** limpia todo.

## Estado actual y siguiente paso

Los datos son **simulados** (`src/domain/seed.ts`) y viven en el navegador. Para
producción hay que sustituir la semilla por la fuente real de Facturación y mover
el estado a un backend con historial, para que los promedios sobrevivan al cierre
del navegador y varias terminales compartan la misma verdad.
