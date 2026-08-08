# Technical Deployment Guide - CalPOP Command Center

## 1. System Architecture
*   **Frontend**: React (Vite) + TailwindCSS.
*   **Backend**: Python FastAPI.
*   **Database**: PostgreSQL 15.
*   **Proxy**: Traefik (handles SSL termination and routing).
*   **Security**: Air-gapped logic; Azure AD for Auth; AES-256 for local encryption.

## 2. Prerequisites
*   **Docker & Docker Compose**: Must be installed on the host machine.
*   **Azure AD Tenant**: Registered App Credential for authentication.
*   **OneDrive Account (Optional)**: For "Sponsor Sync" features if enabled.

## 3. Environment Variables
Create a `.env` file in the root directory. See `.env.example` for a template.

### Critical Variables
| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | DB credentials. |
| `AZURE_CLIENT_ID` | From Azure Portal App Registration. |
| `AZURE_TENANT_ID` | Your Organization ID. |
| `AZURE_CLIENT_SECRET` | Client Secret Value. |
| `FILE_ENCRYPTION_KEY` | 32-byte Fernet key for securing files at rest. |
| `COOKIE_SECRET` | Random string for session signature. |

## 4. Deployment (Docker)
The system is designed to run as a multi-container application.

### Start the Service
```bash
# Build and run in detached mode
docker-compose up -d --build
```

### Access Points
*   **Frontend**: `https://<your-domain>` (or `http://localhost:8090` locally)
*   **Backend API**: `https://<your-domain>/api`
*   **Traefik Dashboard**: `http://localhost:8080` (requires secure config in prod)

## 5. Maintenance
### Database Backup
Postgres data is stored in the Docker volume `postgres_data`.
To backup:
```bash
docker exec -t <db_container_id> pg_dumpall -c -U calpop > dump_`date +%d-%m-%Y"_"%H_%M_%S`.sql
```

### Viewing Logs
```bash
# Follow backend logs
docker-compose logs -f backend

# Follow frontend build logs
docker-compose logs -f frontend
```

### Applying Updates
1. `git pull`
2. `docker-compose up -d --build` (Rebuilds containers with new code)
3. `docker-compose exec backend alembic upgrade head` (Applies DB schema migrations)

## 6. Troubleshooting
*   **"Database not ready"**: The backend waits for Postgres. Check `docker-compose logs db`.
*   **"Auth Error"**: Check `AZURE_REDIRECT_URI` matches your domain strictly in Azure Portal.
