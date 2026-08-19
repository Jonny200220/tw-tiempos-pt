# Tiempos PT — tablero en vivo

Mide cuánto tarda cada área en el flujo
**Facturación → Preparación → Almacén / Material de Empaque → Embarques**,
con cronómetros que corren en pantalla.

```
Facturación        Preparación              Almacén /              Embarques
 libera OD ──────►  toma la OD               Material de Empaque
            (espera  arma paquetes            surte contra OC
            de       ¿falta un color? ─────► entra a la cola
            arranque)  PARO MATERIAL          ¿hay material? ─► surte
                                              ¿no hay? ──────► pausa y
                                                               adelanta otro
                     ◄──── material entregado ──────────────┘
                     cierra la última OC ─────────────────────────► carga
                                                                    y confirma
                                                                    la salida
```

Nada se mueve solo: **cada evento lo registra una persona** desde la pantalla de
su área. No hay motor de simulación.

## Los relojes

Cada medición lleva **dos relojes**, para no confundir el desempeño del área con
un problema de abasto:

| Reloj | Qué mide | Dónde |
|---|---|---|
| Espera de arranque | Facturación liberó → Preparación tomó la OD | Preparación |
| Prep neto | Preparación trabajando, **descontando** los paros por material | Preparación |
| Prep total | Preparación de punta a punta, paros incluidos | Preparación |
| Neto área | Sólo los tramos en que el surtidor estuvo surtiendo | Almacén / Mat. Empaque |
| Total pedido | Solicitud → entrega, con esperas incluidas | Almacén / Mat. Empaque |
| En andén | Preparación cerró la OD → Embarques confirmó la salida | Embarques |
| Ciclo OD | Liberación → salida de planta. El número que ve el cliente | Embarques |

Cuando el surtidor oprime **Dejar para después** (sin existencia, material en
tránsito, se adelanta otro pedido), el reloj *neto* se congela y el *total* sigue
corriendo. Así el área no carga con el tiempo que no depende de ella, y el impacto
real al pedido tampoco se pierde de vista.

Umbrales de semáforo en `src/domain/timers.ts` → `UMBRALES`. Cada color va siempre
acompañado de un glifo (● ▲ ■) y su etiqueta.

## Estructura

```
src/
  domain/
    types.ts     modelo: OD → OC → paquetes → piezas (colores)
    timers.ts    cálculo de relojes, semáforos y formato
    reducer.ts   reglas de negocio
    seed.ts      alta provisional de OD (a reemplazar por captura real)
    store.tsx    persistencia y sincronización entre pestañas
    hooks.ts     useStore / useAhora
  components/
    Dashboard.tsx        tablero: Preparación · Almacén · Mat. Empaque · Embarques
    PanelPreparacion.tsx pantalla de piso de Preparación
    PanelAlmacen.tsx     pantalla de Almacén y de Material de Empaque
    PanelEmbarques.tsx   cola de andén y confirmación de salida
    Notificaciones.tsx   campana por área
```

Facturación no captura tiempos: su pestaña muestra el mismo tablero que el resto.

## Correr

```bash
pnpm install
pnpm dev
```

Abre la misma dirección en otra pestaña o equipo para que cada área tenga su
pantalla: el estado se sincroniza por `BroadcastChannel` y se guarda en
`localStorage`. **Limpiar tablero** borra todo y deja el piso vacío.

## Estado actual y siguiente paso

El tablero arranca **vacío**. La única pieza que todavía inventa datos es
`src/domain/seed.ts`, detrás del botón **+ Liberar OD**: existe sólo porque aún no
hay captura real de Facturación. Los pendientes son sustituirla por el formato de
captura (o la conexión al sistema de Facturación) y mover el estado a un backend
con historial, para que los promedios sobrevivan al cierre del navegador y varias
terminales compartan la misma verdad.
