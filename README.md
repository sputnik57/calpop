# CalPOP — Prisoner Correspondence Management System

A secure, self-hostable case-management system for volunteer-run prisoner correspondence programs (e.g. 12-step sponsorship outreach). Built as a ground-up rebuild of an earlier Streamlit prototype, with an explicit design goal: handle real personal data for real people while minimizing what leaves the machine it runs on.

## Why this exists

Programs that pair outside sponsors with incarcerated sponsees generate a steady stream of physical mail — scanned envelopes and letters, prisoner identifying information, mailing addresses, correspondence history — that needs to be tracked, matched to the right person, and turned into replies, without depending on third-party cloud services to process personal data that doesn't need to leave a volunteer's own machine.

## Features

- **Role-based access control** — Azure AD single sign-on with server-enforced admin/sponsor/auditor roles on every route, not just a UI-level gate.
- **Local, offline OCR intake** — scanned envelopes/letters are transcribed by a self-hosted vision-language model (via [Ollama](https://ollama.com)) rather than a cloud OCR API. Nothing leaves the machine by default; a cloud OCR fallback exists for deployments without a GPU, but is off unless explicitly enabled.
- **Fuzzy identity matching with mandatory human approval** — OCR'd text is matched against known records with a ranked-candidate algorithm (`rapidfuzz`), but the system never auto-assigns a match. A person always confirms the right record against the source scan before anything is filed.
- **Letter authoring workspace** — markdown editor with autosave, revision-request workflow, and DOCX/PDF conversion for physical mailing.
- **Envelope batch printing** — safety-aware address templates for mass mailing runs.
- **Postgres-backed data layer** — SQLAlchemy models with Alembic migrations, replacing the prototype's flat-file storage.
- **Fully containerized** — Docker Compose stack (Traefik reverse proxy, FastAPI backend, React/Vite frontend, Postgres), designed to run on a single machine with no cloud infrastructure required beyond login.

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐      ┌────────────┐
│   Browser   │─────▶│   Traefik    │─────▶│   FastAPI     │─────▶│  Postgres  │
└─────────────┘      │ (reverse     │      │   backend     │      └────────────┘
                      │  proxy)      │      │  (server/)    │
                      └──────┬───────┘      └───────┬──────┘
                             │                       │
                      ┌──────▼───────┐        ┌──────▼───────┐
                      │  React/Vite  │        │    Ollama    │
                      │  (client/)   │        │ (local OCR,  │
                      └──────────────┘        │  vision LLM) │
                                               └──────────────┘
```

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** FastAPI, SQLAlchemy, Alembic
- **Database:** PostgreSQL
- **Auth:** Azure AD (MSAL), server-side RBAC
- **OCR:** Ollama-hosted vision-language model (local), Google Cloud Vision (optional fallback)
- **Matching:** rapidfuzz
- **Infra:** Docker Compose, Traefik

## Getting started

### Docker (recommended)

```bash
docker compose up --build -d
docker compose exec backend alembic upgrade head
```

- Frontend: `http://localhost:4000` (direct) or `http://localhost:8090` (via Traefik)
- Backend: `http://localhost:8000`

Requires a local Ollama instance for OCR (`ollama pull qwen2.5vl:7b`), reachable from the backend container — see `OLLAMA_BASE_URL` in `.env`.

### Local development (without Docker)

```bash
# Backend
mamba env create -f environment.yml
mamba activate calpop
cd server && uvicorn main:app --reload

# Frontend
cd client
npm install
npm run dev
```

## Project structure

- `client/` — React frontend
- `server/` — FastAPI backend
- `server/migrations/` — Alembic schema migrations
- `docker-compose.yml` — container orchestration
- `implementation_plan.md` — living roadmap and current project status
- `docs/pii_sanitization_checklist.md` — run before pushing after a session
  that touched real data, before making anything public, or before handing
  this project to another user

## Status

Actively developed. `implementation_plan.md` tracks what's verified-working versus what's in progress in detail, and is kept honest on purpose — including open items — rather than treated as a marketing document.
