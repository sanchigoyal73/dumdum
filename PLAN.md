# Onyx — CLAUDE.md

> This file is the authoritative reference for the Onyx MVP codebase.
> Read this fully before writing any code, modifying any file, or suggesting architectural changes.

---

## Product Summary

Onyx is a security remediation SaaS platform where a developer can:

1. Add a domain they own
2. Verify ownership using a DNS TXT record
3. Run a deep one-time security scan
4. Receive an AI-generated vulnerability report with severity rankings
5. Request AI-generated code fixes delivered as a GitHub Pull Request via the Onyx GitHub App

**MVP scope: one-time scans only. Continuous monitoring is excluded.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend API | FastAPI (Python 3.11+) |
| Worker Queue | Celery + Redis |
| Database | PostgreSQL via SQLAlchemy (async) |
| Security Tools | Subfinder, Nmap, ffuf, Nuclei |
| AI Layer | Claude (Anthropic) or GPT-4 via LLM abstraction |
| Auth | JWT (python-jose) |
| GitHub Integration | GitHub App (not OAuth App) |
| Containerization | Docker + Docker Compose |

---

## Repository Structure

```
/
├── backend/                  # FastAPI application
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── config.py         # Settings via pydantic-settings
│   │   ├── database.py       # Async SQLAlchemy engine + session
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response schemas
│   │   ├── routers/          # FastAPI route handlers
│   │   ├── services/         # Business logic layer
│   │   ├── workers/          # Celery task definitions
│   │   └── security/         # Auth helpers, encryption utilities
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 # Next.js application
│   ├── app/                  # App Router pages
│   ├── components/
│   ├── lib/                  # API client, utilities
│   └── Dockerfile
├── docker-compose.yml        # Local development stack
├── .env.example              # Required environment variables
└── CLAUDE.md                 # This file
```

---

## Environment Variables

All environment variables must be defined in `.env` and never hardcoded.

```env
# Database
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/aisecfixer

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_SECRET_KEY=<random 64-char hex string>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# GitHub App (not OAuth App)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY_PATH=/secrets/github_app.pem   # RSA private key file
GITHUB_APP_WEBHOOK_SECRET=<random string>              # validates incoming webhooks
GITHUB_APP_NAME=ai-security-fixer

# Encryption key for any secrets at rest (AES-256-GCM)
ENCRYPTION_SECRET_KEY=<random 32-byte hex string>

# Scan limits
MAX_SCANS_PER_USER_PER_DAY=3
MAX_ACTIVE_SCANS_PER_DOMAIN=1
SCAN_TIMEOUT_MINUTES=45

# Per-tool timeouts (seconds)
SUBFINDER_TIMEOUT=300
NMAP_TIMEOUT=600
FFUF_TIMEOUT=600
NUCLEI_TIMEOUT=1200

# ffuf safe rate limit
FFUF_RATE=50

# LLM retry policy
LLM_MAX_RETRIES=3
LLM_RETRY_BACKOFF_BASE=2

# Tool paths
SUBFINDER_PATH=/usr/local/bin/subfinder
NMAP_PATH=/usr/bin/nmap
FFUF_PATH=/usr/local/bin/ffuf
NUCLEI_PATH=/usr/local/bin/nuclei
WORDLIST_PATH=/wordlists/SecLists/Discovery/Web-Content/common.txt
```

---

## Database Schema

### users
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
email         TEXT UNIQUE NOT NULL
password_hash TEXT NOT NULL
created_at    TIMESTAMPTZ DEFAULT now()
```

### targets
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id    UUID REFERENCES users(id) ON DELETE CASCADE
domain     TEXT NOT NULL
verified   BOOLEAN DEFAULT false
created_at TIMESTAMPTZ DEFAULT now()
UNIQUE(user_id, domain)
```

### verifications
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
target_id  UUID REFERENCES targets(id) ON DELETE CASCADE
token      TEXT NOT NULL
method     TEXT NOT NULL DEFAULT 'dns_txt'
verified   BOOLEAN DEFAULT false
created_at TIMESTAMPTZ DEFAULT now()
```

### scans
```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
target_id      UUID REFERENCES targets(id) ON DELETE CASCADE
status         TEXT NOT NULL DEFAULT 'queued'
-- status values: queued | running | completed | failed
started_at     TIMESTAMPTZ
completed_at   TIMESTAMPTZ
failure_reason TEXT
risk_score     FLOAT
```

### findings
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
scan_id     UUID REFERENCES scans(id) ON DELETE CASCADE
type        TEXT NOT NULL
severity    TEXT NOT NULL
-- severity values: critical | high | medium | low | info
endpoint    TEXT
description TEXT
template_id TEXT   -- Nuclei template ID that produced this finding
raw_output  JSONB
false_positive BOOLEAN DEFAULT false
```

### fixes
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
finding_id   UUID REFERENCES findings(id) ON DELETE CASCADE
fix_code     TEXT
branch_name  TEXT
pr_url       TEXT
status       TEXT DEFAULT 'generated'
-- status values: generated | tested | failed
tested       BOOLEAN DEFAULT false
```

### reports
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
scan_id          UUID REFERENCES scans(id) ON DELETE CASCADE
risk_score       FLOAT
summary          TEXT
critical_count   INT DEFAULT 0
high_count       INT DEFAULT 0
medium_count     INT DEFAULT 0
low_count        INT DEFAULT 0
recommendations  JSONB
created_at       TIMESTAMPTZ DEFAULT now()
```

### scan_logs
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
scan_id      UUID REFERENCES scans(id)
user_id      UUID REFERENCES users(id)
domain       TEXT NOT NULL
tool         TEXT NOT NULL
command      TEXT NOT NULL   -- exact command string (no secrets)
started_at   TIMESTAMPTZ DEFAULT now()
completed_at TIMESTAMPTZ
exit_code    INT
```

### github_connections
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id          UUID REFERENCES users(id) ON DELETE CASCADE
target_id        UUID REFERENCES targets(id)
repo_full_name   TEXT NOT NULL        -- e.g. "org/repo"
installation_id  BIGINT NOT NULL      -- GitHub App installation ID
created_at       TIMESTAMPTZ DEFAULT now()
```

No OAuth token is stored. The backend generates short-lived installation access
tokens on demand using the GitHub App private key + `installation_id`. These
tokens expire in 1 hour and are never persisted to the database.

---

## API Endpoints

### Auth
```
POST /auth/register     Body: { email, password }
POST /auth/login        Body: { email, password } → { access_token }
```

### Targets
```
POST /targets           Body: { domain } → { target_id, verification_token }
GET  /targets           → list of user's targets
GET  /targets/{id}      → single target detail
```

### Verification
```
POST /targets/{id}/verify              → checks DNS TXT record
GET  /targets/{id}/verification-status → current verification state
```

DNS record the user must add:
```
_ai_security_verify.<domain>  TXT  "<token>"
```

### Scans
```
POST /targets/{id}/scan     → creates scan, enqueues job → { scan_id }
GET  /scans/{id}            → scan status + progress
GET  /scans/{id}/findings   → list of findings
GET  /scans/{id}/report     → full security report
```

**Scan trigger validation (server-side, non-negotiable):**
- `target.user_id == authenticated_user.id`
- `target.verified == true`
- No active scan exists: `status NOT IN ('queued', 'running')`
- User has not exceeded `MAX_SCANS_PER_USER_PER_DAY`

### Auto Fix
```
POST /scans/{id}/auto-fix   → triggers fix pipeline
```

### GitHub App
```
GET  /github/app-install-url          → returns the GitHub App installation URL
POST /github/webhook                  → receives installation events from GitHub
POST /github/connect-repo             Body: { target_id, repo_full_name, installation_id }
```

**Installation flow:**
1. User clicks "Connect GitHub" → frontend redirects to `https://github.com/apps/ai-security-fixer/installations/new`
2. User selects repos to grant access to
3. GitHub sends `installation` webhook event to `POST /github/webhook`
4. Backend stores `installation_id` in `github_connections`
5. When creating a PR, backend calls GitHub API using a short-lived installation token

**Generating an installation token (backend):**
```python
# Use PyGithub or githubkit
gh_app = GithubIntegration(app_id=GITHUB_APP_ID, private_key=GITHUB_APP_PRIVATE_KEY)
installation_token = gh_app.get_access_token(installation_id).token
# Token is valid for 1 hour. Never store it.
```

**Required GitHub App permissions:**
- `contents: write` — create branches and commits
- `pull_requests: write` — open PRs
- `metadata: read` — list repos

---

## Worker Scan Pipeline

Implemented in Celery. Each scan runs as a chain of tasks.

```
scan_discovery → scan_vulnerability → scan_ai_analysis → scan_report_generation
```

Every stage must:
1. Update `scans.status`
2. Log each tool run to `scan_logs`
3. Set `scans.failure_reason` and `status = 'failed'` on any unrecoverable error

All subprocess calls must use an explicit timeout from env vars:
```python
subprocess.run([...], timeout=settings.SUBFINDER_TIMEOUT, capture_output=True)
```
Never use `shell=True`. Never interpolate domain into the command string.

### Stage 1 — Discovery

**Subdomain discovery**
```bash
subfinder -d <domain> -json
```
- Parse JSON output, store discovered subdomains in the DB
- **Collected subdomains become additional scan targets for Stage 2**
- Log to scan_logs: `tool=subfinder`, `timeout=SUBFINDER_TIMEOUT`

**Port scanning**
```bash
nmap -T4 --open -oX - <domain>
```
- Parse XML output, store open ports + service names
- **For each non-standard open port (not 80/443): add `http://<domain>:<port>` as an additional Nuclei target**
- Example: port 8080 open → add `http://<domain>:8080` to scan target list
- Log to scan_logs: `tool=nmap`, `timeout=NMAP_TIMEOUT`

**Directory fuzzing**
```bash
ffuf -u https://<domain>/FUZZ -w /wordlists/SecLists/Discovery/Web-Content/common.txt \
  -rate 50 -timeout 10 -o - -of json
```
- `-rate 50` is mandatory. Never remove this. Prevents accidental DoS.
- Parse JSON output, store discovered paths
- Log to scan_logs: `tool=ffuf`, `timeout=FFUF_TIMEOUT`

### Stage 2 — Vulnerability Scanning

Build the full target list before running Nuclei:
```
targets = [https://<primary_domain>]
targets += [https://<subdomain> for subdomain in discovered_subdomains]
targets += [http://<domain>:<port> for port in non_standard_open_ports]
```

Run Nuclei against each target:
```bash
nuclei -u <target> -json -o /tmp/<scan_id>_<target_slug>_nuclei.json
```
- Parse each JSON line into a finding record
- Store: `template_id`, `severity`, `endpoint`, `description`, `raw_output`
- Log to scan_logs: `tool=nuclei`, `timeout=NUCLEI_TIMEOUT`

This ensures subdomains like `admin.example.com` and services on non-standard ports like `:8080` are fully scanned — not just the root domain.

### Stage 3 — AI Reasoning

Send all findings to LLM with this prompt (do not modify without updating this file):

```
You are a cybersecurity analyst reviewing automated scan results.

Domain: <domain>
Findings:
<JSON array of findings>

Tasks:
1. Identify and mark likely false positives (set false_positive: true)
2. Rank remaining vulnerabilities by actual severity
3. Explain the real-world risk of each in plain English (2-3 sentences max)
4. Provide a concrete, actionable fix recommendation for each

Respond ONLY with valid JSON matching this schema:
{
  "risk_score": <float 0.0–10.0>,
  "vulnerabilities": [
    {
      "finding_id": "<uuid>",
      "type": "<string>",
      "severity": "critical|high|medium|low",
      "endpoint": "<string>",
      "description": "<plain English risk explanation>",
      "recommended_fix": "<concrete fix recommendation>",
      "false_positive": <boolean>
    }
  ]
}
```

**LLM Retry Policy — enforce on every AI call:**
```python
for attempt in range(settings.LLM_MAX_RETRIES):  # default: 3
    try:
        response = call_llm(prompt)
        validated = validate_json_schema(response)
        break
    except (InvalidJSONError, LLMTimeoutError, LLMRateLimitError) as e:
        if attempt == settings.LLM_MAX_RETRIES - 1:
            raise
        sleep(settings.LLM_RETRY_BACKOFF_BASE ** attempt)  # 1s, 2s, 4s
```
Retry on: invalid JSON, API timeout, rate limit error. Max 3 attempts.

### Stage 4 — Report Generation

Aggregate findings into a report record:
- `risk_score` from AI output (preferred)
- **Fallback risk score if AI fails** — compute from severity weights:
  ```python
  SEVERITY_WEIGHTS = {"critical": 10, "high": 7, "medium": 4, "low": 1}
  raw_score = sum(SEVERITY_WEIGHTS[f.severity] for f in confirmed_findings)
  risk_score = min(10.0, raw_score / max(1, len(confirmed_findings)) * 1.5)
  ```
- Count findings by severity (excluding false positives)
- `recommendations`: top 3 most critical fixes
- Store in `reports` table

---

## Auto Fix Pipeline

Triggered via `POST /scans/{id}/auto-fix`. Requires a GitHub App installation
linked to the target's repository (`github_connections` record must exist).

### Fix Generation Prompt (per finding)

```
You are a security engineer generating a code patch.

Vulnerability:
Type: <type>
Endpoint: <endpoint>
Description: <description>
Recommended Fix: <recommended_fix>

Repository: <repo_full_name>

Generate a fix recommendation. Since you may not have access to the exact file,
provide:
1. A clear description of what code pattern to find
2. The before code (insecure pattern)
3. The after code (fixed pattern)
4. A plain English explanation of the change

Respond with valid JSON:
{
  "before_code": "<insecure code snippet>",
  "after_code": "<fixed code snippet>",
  "explanation": "<what changed and why>",
  "file_hint": "<likely filename or path pattern>"
}
```

### Fix Application

Authenticate using an installation token (never stored — generated fresh each time):
```python
token = gh_app.get_access_token(installation_id).token
repo = Github(token).get_repo(repo_full_name)
```

For each fix:
1. Create branch: `security-fix/<scan_id>/<finding_id_short>`
2. Commit using the GitHub App identity — PRs will appear as:
   > **ai-security-fixer** bot wants to merge 1 commit into `main`
3. Update `fixes.branch_name`

### Fix Verification

Re-run the specific Nuclei template that produced the finding:
```bash
nuclei -t <template_id> -u https://<domain>
```
- If finding disappears: `fix.tested = true`, `fix.status = 'tested'`
- If finding persists: `fix.status = 'failed'`, do not retry automatically

### Pull Request

After all fixes attempted:
```
Title: [AI Security Fixer] Security vulnerability fixes for <domain>

Body:
Automated security fixes generated by AI Security Fixer.

## Resolved Vulnerabilities
- <type> at <endpoint>
- ...

## Review Required
Each fix should be reviewed before merging. These patches are AI-generated
and require human validation.

⚠️ DO NOT merge without reviewing each changed file.
```

**CRITICAL: PRs must never auto-merge. This is non-negotiable.**

---

## Security Rules (Never Violate)

### Input Sanitization

Domain input must be validated before any shell command:
```python
import re
DOMAIN_REGEX = re.compile(r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$')
```

All tool commands must use `subprocess` with argument lists — **never string interpolation**:
```python
# CORRECT
subprocess.run([NUCLEI_PATH, "-u", f"https://{domain}", "-json"], ...)

# WRONG — command injection risk
subprocess.run(f"nuclei -u https://{domain} -json", shell=True)
```

### GitHub App Credential Security

- The GitHub App **private key** (`.pem`) is never stored in the DB. It lives on
  disk (or a secret manager like AWS Secrets Manager) and is loaded at startup.
- Installation access tokens are **generated on demand** and **never persisted**.
- The `github_connections` table stores only `installation_id` (a public integer) — no secrets.
- Validate every incoming GitHub webhook using `GITHUB_APP_WEBHOOK_SECRET`:
  ```python
  import hmac, hashlib
  def verify_webhook(payload: bytes, signature: str, secret: str) -> bool:
      expected = "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
      return hmac.compare_digest(expected, signature)
  ```

### Scan Ownership

Every scan endpoint must verify `scan.target.user_id == current_user.id` server-side.
Never trust client-provided scan IDs without this check.

### Rate Limiting

Enforce in the scan trigger handler — not just middleware:
```python
daily_scans = count_scans_today(user_id)
if daily_scans >= settings.MAX_SCANS_PER_USER_PER_DAY:
    raise HTTPException(429, "Daily scan limit reached")
```

### Scan Timeouts

Two layers of timeout enforcement:

**1. Per-tool subprocess timeout** (from env vars):
```python
subprocess.run([SUBFINDER_PATH, "-d", domain, "-json"],
    timeout=settings.SUBFINDER_TIMEOUT,  # 300s
    capture_output=True)
```
If a tool times out: log it, mark that tool stage as failed, continue to next stage.

**2. Full Celery task hard timeout:**
```python
@celery.task(time_limit=SCAN_TIMEOUT_MINUTES * 60, soft_time_limit=(SCAN_TIMEOUT_MINUTES - 5) * 60)
```
On Celery timeout: set `scan.status = 'failed'`, `failure_reason = 'scan timeout'`.

### Docker Container Security

Worker containers that run security tools must:
- Run as non-root user (`USER scanner` in Dockerfile)
- Have no write access outside `/tmp/<scan_id>/`
- Have network access restricted to the scan target only (where feasible)
- Never have access to the main database directly — communicate via API

Example Dockerfile constraint:
```dockerfile
RUN adduser --disabled-password --gecos '' scanner
USER scanner
```

---

## Frontend Pages

| Route | Page | Description |
|---|---|---|
| `/login` | Login | JWT auth |
| `/register` | Register | Account creation |
| `/dashboard` | Dashboard | Domains list, scan history, new scan button |
| `/targets/[id]/verify` | Verification | DNS TXT instructions + status |
| `/scans/[id]` | Scan Progress | Live stage progress via polling |
| `/scans/[id]/report` | Security Report | Risk score, findings, fix button |

### Polling

Scan progress page polls `GET /scans/{id}` every 5 seconds until `status` is `completed` or `failed`. Use exponential backoff after 5 failed polls.

---

## Build Order

Build in this exact sequence. Do not skip ahead.

1. **Auth + Target Management** — register, login, add domain. No security tools needed.
2. **DNS Verification** — token generation, DNS TXT check.
3. **Scan Pipeline with Nuclei only** — skip subfinder/nmap/ffuf initially. Nuclei alone produces real findings.
4. **AI Reasoning Layer** — wire LLM to Nuclei JSON output.
5. **Report Generation + Frontend** — demo-ready at this point.
6. **Full Discovery Stage** — add subfinder, nmap, ffuf.
7. **GitHub Integration + Auto Fix** — last, most complex.

---

## MVP Scope — Excluded Features

Do NOT implement or stub these:
- Continuous monitoring / scheduled scans
- Vector database / semantic search over findings
- Attack graph visualization
- Multi-agent AI orchestration
- Historical vulnerability learning / trend analysis

If asked to add any of these during MVP development, decline and reference this document.

---

## Code Style

- Python: `black` formatting, `ruff` linting, type hints required on all function signatures
- Async everywhere in FastAPI — no sync DB calls in route handlers
- All DB queries via SQLAlchemy ORM — no raw SQL strings
- Pydantic v2 for all schemas
- Frontend: TypeScript strict mode, no `any` types

---

## Testing

- Unit tests for: domain validation, token generation, LLM prompt construction, encryption/decryption
- Integration tests for: scan trigger validation (ownership, verified, rate limit)
- Do not write tests for external tool wrappers (subfinder, nmap, etc.) — mock them

---

*Last updated: 2026-03-26 (v3 — switched from GitHub OAuth App to GitHub App: installation_id storage, on-demand tokens, bot identity PRs, webhook validation)*
*This document must be kept in sync with any architectural changes.*
