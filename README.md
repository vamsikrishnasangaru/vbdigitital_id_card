# VB Digital ID Cards

Enterprise-grade SaaS platform for managing school ID card operations.

## Architecture

- **Frontend**: Next.js 16 (TailwindCSS v4, Zustand, React Query)
- **Backend**: NestJS 11 (JWT Auth, RBAC, Swagger)
- **Database**: PostgreSQL + Prisma ORM
- **Monorepo**: Turborepo + pnpm workspaces

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Setup database
cd packages/db
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts

# 3. Start development
pnpm dev        # runs both API (port 3001) + Web (port 3000)
```

## Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@vbdigital.com | Admin@123 |
| School Admin | schooladmin@demopublic.edu | Admin@123 |
| Teacher | teacher@demopublic.edu | Admin@123 |

## Project Structure

```
apps/
  api/          → NestJS REST API (port 3001)
  web/          → Next.js Frontend (port 3000)
packages/
  db/           → Prisma schema & migrations
  ui/           → Shared UI components
  eslint-config/
  typescript-config/
```

## API Documentation

Swagger docs available at: `http://localhost:3001/api/docs`

## Services

| Service | Description |
|---------|-------------|
| Schools | Multi-tenant school management |
| Students | Student lifecycle (Draft → Submitted → Approved) |
| ID Cards | Template design & card generation |
| Orders | Order workflow management |
| Print Queue | Batch printing management |
| Deliveries | Physical delivery tracking |
| Analytics | Business dashboards & insights |

## Files Preserved

- `VB_Digital_ID_Cards_Proposal.pdf` — Business proposal
- `VB_Digital_ID_Cards_Proposal.docx` — Business proposal (editable)
