# KANBAII — Project Instructions

## Stack
- **Backend:** Express + Socket.IO on single port (default 5555)
- **Frontend:** Next.js 14, static export to `dashboard/`
- **Data:** JSON files in `data/` (no DB)
- **Tests:** Vitest — `npx vitest run`
- **Build:** `npm run build` (tsc server + next build frontend)

## Regla de Tests (OBLIGATORIA)

**Toda feature nueva o bugfix DEBE incluir tests.** Sin excepciones.

### Flujo obligatorio:
1. Implementar la feature/fix
2. Agregar tests que cubran el happy path + al menos 1 edge case
3. Correr `npx vitest run` y verificar que pasan TODOS los tests (no solo los nuevos)
4. Si el test requiere API, usar el patrón de `api.test.ts` (createApp + http helper)
5. Si el test es de store/service, usar el patrón de `projectStore.test.ts` (cleanup + datos aislados)

### Dónde van los tests:
- Tests de API (routes): `src/server/__tests__/api.test.ts` o nuevo archivo `src/server/__tests__/<domain>.api.test.ts`
- Tests de services/stores: `src/server/__tests__/<service>.test.ts`
- Tests de lib/utils: `src/server/__tests__/<util>.test.ts`

### Qué testear:
- **Routes:** status codes correctos, validación de input, respuestas ok/error
- **Services:** CRUD operations, edge cases (not found, duplicates, invalid input)
- **Lib:** funciones puras, validación, sanitización
- **Security:** rechazar inputs maliciosos (traversal, injection, oversized)

### Qué NO testear:
- Engines que spawnean Claude CLI (requieren proceso externo)
- WebSocket events en aislamiento (testeados via API integration)
- Frontend React components (fuera de scope del backend test suite)

## Build Check

Antes de commitear, SIEMPRE verificar:
```bash
npx tsc -p tsconfig.server.json --noEmit  # type check
npx vitest run                              # tests
```

Si alguno falla, NO commitear. Fixear primero.

## Seguridad

- Validar TODOS los inputs de usuario con Zod schemas
- Slugs en rutas deben matchear `/^[a-z0-9][a-z0-9-]*$/`
- Nunca interpolar user input en paths sin validar (usar `safePath()` o pattern validation)
- MCP commands solo del whitelist: `node, npx, cmd, python, uvx, pip, pipx`
- Settings solo aceptan keys conocidas (schema en `routes/settings.ts`)

## Commits

- Commitear a `develop`. Nunca auto-merge a `master` sin confirmacion explicita.
- CI corre en push a develop/master y PRs a master.
