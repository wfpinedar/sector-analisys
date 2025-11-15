# Sector Analysis (Matriz de Influencias Cruzadas)

Aplicación full‑stack para análisis sectorial con matriz de influencias cruzadas (MICMAC).

- API FastAPI + SQLModel para gestionar proyectos, variables, escalas y matriz.
- Frontend Next.js 14 + Tailwind para capturar datos y visualizar resultados (MICMAC, heatmap y red de influencias).

## Requisitos

- Docker y Docker Compose (recomendado)
- Alternativa local:
  - Python 3.12 (para la API)
  - Node.js 18.17+ (para el frontend)
  - SQLite (integrado) o Postgres (opcional)

## Levantar con Docker Compose

1) Variables de entorno

Copia `.env.example` a `.env` en la carpeta `sector-analisys` y ajusta según necesidad:

```
# API
DATABASE_URL=sqlite:///./sector.db
CORS_ALLOW_ORIGINS=http://localhost:3000
SECRET_KEY=dev

# WEB
NEXT_PUBLIC_API_URL=http://localhost:8000

# Postgres (opcional si cambias DATABASE_URL)
POSTGRES_DB=sector
POSTGRES_USER=sector
POSTGRES_PASSWORD=sector
```

2) Construir y arrancar

```
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:8000

3) Flujo de uso

- Paso 1 (Escala y proyecto): crea un proyecto y elige/edita una escala.
- Paso 2 (Variables): registra la lista completa de variables (reemplaza las existentes).
- Paso 3 (Matriz): carga la matriz NxN (se valida rango, step y diagonal = 0).
- Paso 4 (Resultados): calcula al vuelo y visualiza MICMAC, heatmap y grafo.

## Levantar localmente (sin Docker)

### API (FastAPI)

```
cd sector-analisys/api
python -m venv .venv && . .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Configura `DATABASE_URL` y `CORS_ALLOW_ORIGINS` en tu entorno si cambias valores por defecto.

### Web (Next.js)

```
cd sector-analisys/web
npm ci
npm run dev
```

- Requiere Node.js >= 18.17. Si tienes Node 16, usa Docker o instala una versión LTS más reciente.
- Asegúrate de que `NEXT_PUBLIC_API_URL` apunte al API (por defecto http://localhost:8000).

## Endpoints clave del API

- Escalas (ScaleSets):
  - `GET /scalesets` lista (incluye `labels`)
  - `GET /scalesets/{id}` detalle
  - `PUT /scalesets/{id}` actualiza (nombre, min/max/step, `labels`)
  - `DELETE /scalesets/{id}` elimina (si no está en uso por proyectos)

- Proyectos:
  - `POST /projects` crea
  - `GET /projects` lista
  - `GET /projects/{id}` detalle
  - `PUT /projects/{id}` actualiza
  - `DELETE /projects/{id}` elimina (borra variables y celdas)

- Variables y Matriz:
  - `POST /projects/{id}/variables` reemplaza variables del proyecto
  - `POST /projects/{id}/matrix` guarda matriz NxN validando escala
  - `GET /projects/{id}/matrix` devuelve variables y matriz si está completa
  - `GET /projects/{id}/status` resumen de persistencia (variables, celdas, completa)

- Cálculo / Exportación / Visualización:
  - `POST /projects/{id}/compute` MICMAC (al vuelo)
  - `GET /projects/{id}/heatmap`
  - `GET /projects/{id}/graph?min_weight=0&directed=true`
  - `GET /projects/{id}/export` JSON con variables + matriz
  - `GET /projects/{id}/export/variables.csv`
  - `GET /projects/{id}/export/matrix.csv`
  - `POST /projects/{id}/import/csv` importa `variables.csv` y `matrix.csv`

## Notas de diseño

- Persistencia: Proyecto, variables y matriz se almacenan en BD. Los resultados se calculan al vuelo.
- Escalas: puedes definir etiquetas semánticas por valor (`labels`) y editarlas desde la UI (modal de escala).
- CORS: configurable con `CORS_ALLOW_ORIGINS`.
- Base de datos: por defecto SQLite. Cambia `DATABASE_URL` para usar Postgres (servicio `db` incluido en compose).

## Problemas comunes

- Error Next.js por Node 16: usa Node >= 18 o Docker (la imagen usa Node 20).
- Matriz incompleta: el compute exige NxN celdas; revisa `GET /projects/{id}/status`.
- CORS desde web: ajusta `CORS_ALLOW_ORIGINS` para permitir tu host del frontend.

