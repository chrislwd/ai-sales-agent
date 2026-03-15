# AI Sales Agent

**English** | [中文](#中文文档)

> An AI-powered B2B sales execution platform — not just a copilot, but a full execution engine that identifies target accounts, generates personalized outreach, understands replies, books meetings, and syncs everything back to your CRM automatically.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Roadmap](#roadmap)

---

## Overview

AI Sales Agent is a **B2B SaaS outbound sales automation platform** built for SDR/BDR teams. It automates the full outbound loop:

```
Import Accounts → Score Against ICP → Enroll in Sequence
→ AI Generates Personalized Email → Send (or Approve First)
→ AI Classifies Reply Intent → Auto or Human Follow-up
→ Book Meeting → Generate Pre-Call Brief → Sync to CRM
```

The key distinction from traditional sales tools: **AI acts in the execution layer**, not just the suggestion layer. It sends emails, classifies replies, and books meetings — humans step in only at defined approval gates.

---

## Key Features

### Workspace & Access Control
- Multi-tenant workspaces with team invitations
- 6-level RBAC: `owner → admin → manager → ae → sdr → viewer`
- JWT authentication with short-lived access tokens + rotating refresh tokens

### ICP & Playbook Configuration
- Define Ideal Customer Profile: industry, country, company size, tech stack, seniority, job function
- Configurable scoring weights — ICP scores drive account and contact prioritization

### Prospect Intelligence
- Account and contact management with CSV import
- Automatic ICP-based scoring (0–100) with per-dimension breakdown: industry / country / size / tech stack
- Contact lifecycle tracking: `new → contacted → replied → meeting_scheduled → qualified`

### Sequence Builder
- Visual multi-step email sequence editor
- Per-step settings: delay (days), trigger conditions, email template, approval mode
- Conditional branches: execute step only if previous email was opened / not replied / replied with a specific intent
- Three approval modes: **Auto-send** · **Approve first email only** · **Approve every email**
- Daily send limits and configurable send time windows

### AI Message Generation (Claude API)
- Generates personalized cold emails using `claude-sonnet-4-6`
- Context inputs: contact name + title, company profile, ICP config, brand voice
- Falls back to rule-based mock when `ANTHROPIC_API_KEY` is not set — dev/test safe
- Variable interpolation: `{{contact.firstName}}`, `{{account.companyName}}`

### Reply Understanding Engine
- Classifies inbound replies into 11 intent categories:
  `interested` · `request_demo` · `not_now` · `not_relevant` · `using_competitor` · `pricing_concern` · `security_concern` · `referral` · `unsubscribe` · `out_of_office` · `unknown`
- Returns confidence score (0–1) and a suggested next action per intent
- Flags low-confidence replies (`< 0.7`) for mandatory human review
- Auto-unsubscribes and suppresses contacts on `unsubscribe` intent

### Meeting Conversion Engine
- Propose, confirm, and track meetings: `proposed → confirmed → completed`
- AI-generated pre-call brief: contact summary, company background, touch history, recommended talking points
- Automatically updates contact lifecycle status on meeting confirmation/completion

### Human Override Console (Inbox)
- Approval queue: review AI-generated messages, edit subject/body, then approve or reject
- Inbound reply viewer with intent badges and confidence scores
- Manual review and override for any AI classification decision

### CRM Integration (HubSpot)
- OAuth 2.0 connect flow + automatic token refresh
- Upserts contacts and companies, deduplicated by email / domain
- Associates contacts with their companies in HubSpot
- Logs email engagements and meetings as HubSpot activities
- CRM sync runs asynchronously via BullMQ worker — never blocks the API; failures written to audit log

### Analytics & Audit Log
- 30-day dashboard: emails sent, open rate, reply rate, meetings booked
- Immutable audit log for every action: who did what, when, AI vs human vs system
- Full sequence enrollment tracking with per-contact step progress

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Fastify 4, TypeScript, Node.js 20 |
| **ORM** | Drizzle ORM |
| **Database** | PostgreSQL 16 |
| **Cache / Queue** | Redis 7 + BullMQ 5 |
| **AI** | Anthropic Claude API (`claude-sonnet-4-6`) |
| **Email** | Gmail API (OAuth) + Resend SDK (fallback) |
| **Frontend** | Next.js 14 App Router, Tailwind CSS, SWR |
| **Monorepo** | pnpm workspaces + Turborepo |
| **Auth** | JWT (access token + refresh token rotation) |
| **CRM** | HubSpot CRM API v3 |
| **Testing** | Vitest (55 test cases) |
| **CI/CD** | GitHub Actions |
| **Deployment** | Docker (multi-stage builds), Railway |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  apps/web  (Next.js)                 │
│  /login  /dashboard  /sequences  /contacts  /inbox  │
└──────────────────────┬──────────────────────────────┘
                       │  REST  /api/v1
┌──────────────────────▼──────────────────────────────┐
│                  apps/api  (Fastify)                 │
│                                                      │
│  auth │ workspace │ icp │ accounts │ contacts        │
│  sequences │ messages │ meetings │ analytics │ crm   │
│  webhooks │ email-accounts                            │
│                                                      │
│  ┌──────────────┐   ┌───────────────────────────┐   │
│  │  AI Engine   │   │      BullMQ Workers        │   │
│  │  (Claude)    │   │  sequence · crm · notify   │   │
│  │  email-gen   │   └───────────────────────────┘   │
│  │  reply-clf   │                                    │
│  └──────────────┘                                    │
└──────────┬─────────────────┬──────────────┬─────────┘
           │                 │              │
      PostgreSQL           Redis        HubSpot API
      (Drizzle ORM)      (BullMQ)       (CRM Sync)
```

### Outbound Sequence Data Flow

```
enrollContact()
    │
    └─► BullMQ: scheduleNextStep(enrollmentId)
            │
            └─► executeStep()
                    │
                    ├─► generateEmail() ──► Claude API
                    │
                    ├─► [approval required] → status: pending → Inbox queue
                    │
                    └─► dispatchMessage() ──► Resend
                                │
                                └─► advance enrollment to next step (with delay)
```

### Reply Processing Flow

```
POST /messages/replies/inbound
    │
    └─► classifyReply() ──► Claude API
            │
            ├─► intent: unsubscribe  → suppress contact + pause enrollment
            ├─► intent: interested   → flag for human + suggest meeting
            ├─► confidence < 0.7     → requiresHumanReview = true → Inbox
            └─► logActivity()        → Audit log
```

---

## Project Structure

```
ai-sales-agent/
├── apps/
│   ├── api/                           # Fastify backend
│   │   └── src/
│   │       ├── ai/
│   │       │   ├── client.ts          # Anthropic SDK client
│   │       │   ├── email-generator.ts # Personalized email generation
│   │       │   └── reply-classifier.ts# Intent classification + pre-call briefs
│   │       ├── config/env.ts          # Zod-validated environment config
│   │       ├── db/
│   │       │   ├── schema.ts          # Drizzle schema (15 tables + relations)
│   │       │   ├── index.ts           # DB connection + exports
│   │       │   └── migrate.ts         # Migration runner
│   │       ├── email/email.service.ts # Gmail-first, Resend fallback
│   │       ├── modules/
│   │       │   ├── auth/              # JWT auth, RBAC middleware
│   │       │   ├── workspace/         # Workspace CRUD, invitations, members
│   │       │   ├── icp/               # ICP config CRUD
│   │       │   ├── accounts/          # Account CRUD, CSV import, scoring
│   │       │   ├── contacts/          # Contact CRUD, lifecycle updates
│   │       │   ├── sequences/         # Sequence builder + enrollment engine
│   │       │   ├── messages/          # Approval queue, inbound reply handler
│   │       │   ├── meetings/          # Meeting scheduling, pre-call brief
│   │       │   ├── crm/               # HubSpot OAuth + sync service
│   │       │   ├── webhooks/          # Email open/click/bounce/reply webhooks
│   │       │   ├── email-accounts/    # Google OAuth + Gmail API sending
│   │       │   └── analytics/         # Dashboard metrics, audit log
│   │       ├── queues/
│   │       │   ├── index.ts           # BullMQ queue definitions
│   │       │   └── worker.ts          # Sequence, CRM, notification workers
│   │       └── server.ts              # Fastify app entry point
│   │
│   └── web/                           # Next.js 14 frontend
│       └── src/
│           ├── app/
│           │   ├── login/             # Login page
│           │   ├── register/          # Register + create workspace
│           │   └── dashboard/
│           │       ├── page.tsx       # Metrics dashboard
│           │       ├── accounts/      # Account list + CSV import + detail view
│           │       ├── contacts/      # Contact list + enroll + detail view
│           │       ├── sequences/     # Sequence list + step editor
│           │       ├── inbox/         # Approval queue + reply viewer
│           │       ├── meetings/      # Meeting tracker
│           │       ├── analytics/     # Audit log viewer
│           │       └── settings/      # Workspace, CRM, Team, ICP config
│           ├── components/
│           │   ├── layout/Sidebar.tsx
│           │   └── ui/SequenceEditor.tsx # Visual step builder component
│           ├── context/auth.tsx       # Auth context + JWT management
│           └── lib/api.ts             # API client + auto token refresh
│
└── packages/
    └── types/src/index.ts             # Shared TypeScript types + enums
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose (for local PostgreSQL + Redis)

### 1. Clone and install

```bash
git clone https://github.com/chrislwd/ai-sales-agent.git
cd ai-sales-agent
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — see Environment Variables section below
```

### 3. Start infrastructure

```bash
docker compose up postgres redis -d
```

### 4. Run database migrations

```bash
pnpm db:migrate    # apply migrations to database
```

### 5. Seed demo data (optional)

```bash
pnpm db:seed       # creates workspace, user, accounts, contacts, sequence
                    # login: demo@example.com / demo1234
```

### 6. Start dev servers

```bash
pnpm dev           # api on :3001, web on :3000
```

Open [http://localhost:3000](http://localhost:3000) — if you ran the seed, log in with `demo@example.com` / `demo1234`.

**Bull Board**: Queue dashboard available at [http://localhost:3001/admin/queues](http://localhost:3001/admin/queues) in development mode.

### Run tests

```bash
pnpm test
```

55 Vitest test cases covering: ICP scoring, reply classification, RBAC middleware, sequence enrollment, webhook processing, email generation, JWT auth & token rotation.

---

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_SECRET` | JWT signing secret (32+ chars recommended) | Yes |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | Yes |
| `ANTHROPIC_API_KEY` | Claude API key — leave blank to use mock mode | Optional |
| `AI_MODEL` | Claude model ID, default `claude-sonnet-4-6` | Optional |
| `EMAIL_ENABLED` | Set `true` to send real emails via Resend | Optional |
| `RESEND_API_KEY` | Resend API key ([resend.com](https://resend.com)) | Prod |
| `EMAIL_FROM` | Sender address, e.g. `outreach@yourdomain.com` | Prod |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (for Gmail sending) | Email |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Email |
| `GOOGLE_REDIRECT_URI` | Google OAuth callback URL | Email |
| `RESEND_WEBHOOK_SECRET` | Resend webhook HMAC secret (optional) | Optional |
| `HUBSPOT_CLIENT_ID` | HubSpot OAuth App client ID | CRM |
| `HUBSPOT_CLIENT_SECRET` | HubSpot OAuth App secret | CRM |
| `HUBSPOT_REDIRECT_URI` | OAuth callback URL | CRM |
| `API_PUBLIC_URL` | Public URL of the API (used in OAuth callbacks) | Prod |
| `CORS_ORIGIN` | Frontend URL allowed by CORS | Yes |

> **AI Mock Mode**: When `ANTHROPIC_API_KEY` is not set, the email generator and reply classifier fall back to rule-based local implementations. You can run and test the entire application locally with zero external API dependencies.

See `.env.example` for the full list with inline comments.

---

## API Reference

All endpoints are prefixed with `/api/v1`. Authenticate via `Authorization: Bearer <token>`.

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create user + workspace |
| `POST` | `/auth/login` | Login, returns `accessToken` + `refreshToken` |
| `POST` | `/auth/refresh` | Rotate refresh token |
| `POST` | `/auth/logout` | Revoke refresh token |
| `GET` | `/auth/me` | Current user + workspace memberships |

### Workspace

| Method | Path | Description |
|---|---|---|
| `GET` | `/workspace` | Get workspace settings |
| `PATCH` | `/workspace` | Update settings _(admin+)_ |
| `GET` | `/workspace/members` | List team members |
| `POST` | `/workspace/invitations` | Invite member _(admin+)_ |
| `POST` | `/workspace/invitations/:token/accept` | Accept invitation |
| `PATCH` | `/workspace/members/:userId` | Change member role _(admin+)_ |
| `DELETE` | `/workspace/members/:userId` | Remove member _(admin+)_ |

### Accounts

| Method | Path | Description |
|---|---|---|
| `GET` | `/accounts` | List accounts (paginated, `?search=`) |
| `POST` | `/accounts` | Create account |
| `POST` | `/accounts/import` | Bulk import from CSV file |
| `GET` | `/accounts/:id` | Get account |
| `PATCH` | `/accounts/:id` | Update account |
| `DELETE` | `/accounts/:id` | Delete _(manager+)_ |
| `POST` | `/accounts/:id/rescore` | Recalculate ICP score |
| `GET` | `/accounts/:id/contacts` | List account's contacts |

### Contacts

| Method | Path | Description |
|---|---|---|
| `GET` | `/contacts` | List contacts (paginated, `?status=`, `?search=`) |
| `POST` | `/contacts` | Create contact |
| `GET` | `/contacts/:id` | Get contact |
| `PATCH` | `/contacts/:id` | Update contact |
| `PATCH` | `/contacts/:id/lifecycle` | Update lifecycle status |
| `POST` | `/contacts/:id/unsubscribe` | Mark unsubscribed |
| `DELETE` | `/contacts/:id` | Delete _(manager+)_ |

### Sequences

| Method | Path | Description |
|---|---|---|
| `GET` | `/sequences` | List sequences |
| `POST` | `/sequences` | Create sequence with steps |
| `GET` | `/sequences/:id` | Get sequence + steps |
| `PATCH` | `/sequences/:id` | Update sequence + steps |
| `PATCH` | `/sequences/:id/status` | Activate / pause / archive |
| `DELETE` | `/sequences/:id` | Delete sequence |
| `POST` | `/sequences/:id/enroll` | Enroll contacts `{ contactIds: [...] }` |
| `GET` | `/sequences/:id/enrollments` | List enrollments + status |
| `POST` | `/sequences/enrollments/:id/pause` | Pause enrollment |
| `POST` | `/sequences/enrollments/:id/resume` | Resume enrollment |

### Messages & Replies

| Method | Path | Description |
|---|---|---|
| `GET` | `/messages` | List messages (`?status=pending`) |
| `POST` | `/messages/:id/approve` | Approve + send (optionally edit first) |
| `POST` | `/messages/:id/reject` | Reject message |
| `POST` | `/messages/replies/inbound` | Receive inbound reply + classify |
| `GET` | `/messages/replies/:id` | Get reply with classification |
| `POST` | `/messages/replies/:id/review` | Human override: set intent + action |

### Meetings

| Method | Path | Description |
|---|---|---|
| `GET` | `/meetings` | List meetings (`?status=`) |
| `POST` | `/meetings` | Propose meeting |
| `POST` | `/meetings/:id/confirm` | Confirm + generate pre-call brief |
| `PATCH` | `/meetings/:id` | Update status / notes |
| `GET` | `/meetings/:id/brief` | Get AI pre-call brief |

### CRM

| Method | Path | Description |
|---|---|---|
| `GET` | `/crm/connections` | List active CRM connections |
| `GET` | `/crm/hubspot/connect` | Start HubSpot OAuth flow |
| `GET` | `/crm/hubspot/callback` | OAuth callback handler |
| `POST` | `/crm/hubspot/connect-manual` | Connect with access token directly |
| `DELETE` | `/crm/connections/:id` | Disconnect CRM |
| `POST` | `/crm/sync/contact/:id` | Manually trigger contact sync |

### Email Accounts

| Method | Path | Description |
|---|---|---|
| `GET` | `/email-accounts` | List connected email accounts |
| `GET` | `/email-accounts/google/connect` | Start Google OAuth flow _(admin+)_ |
| `GET` | `/email-accounts/google/callback` | OAuth callback handler |
| `DELETE` | `/email-accounts/:id` | Disconnect email account _(admin+)_ |
| `POST` | `/email-accounts/:id/test` | Send test email _(admin+)_ |

### Webhooks (public, no auth)

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhooks/resend` | Unified Resend webhook (routes by event type) |
| `POST` | `/webhooks/email/open` | Track email opens |
| `POST` | `/webhooks/email/click` | Track link clicks |
| `POST` | `/webhooks/email/bounce` | Handle bounces |
| `POST` | `/webhooks/email/reply` | Process reply + AI classify intent |

### Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/analytics/dashboard` | 30-day performance metrics |
| `GET` | `/analytics/audit-log` | Full audit trail (paginated) |

---

## Database Schema

15 tables covering the complete sales execution lifecycle:

```
workspaces ──< workspace_members >── users
           ──< email_accounts
           ──< icp_configs
           ──< accounts ──< contacts
           ──< sequences ──< sequence_steps
                         ──< sequence_enrollments ──< messages ──< replies
           ──< meetings
           ──< crm_connections
           ──< activity_logs
users ──< refresh_tokens
```

**Key design decisions:**

- **Soft suppression** — `unsubscribed` + `doNotContact` flags checked before every send; never deleted
- **Idempotent enrollment** — `UNIQUE(sequence_id, contact_id)` prevents duplicate enrollments at the DB level
- **Immutable audit log** — `activity_logs` is append-only, records `actorType: ai | user | system` for every action
- **Async CRM sync** — changes enqueue a BullMQ job and return immediately; failures are logged without blocking the API

---

## Deployment

### Docker Compose (production)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Minimum required env vars for production:

```bash
DATABASE_URL=postgresql://...
POSTGRES_PASSWORD=...
JWT_SECRET=<long-random-string>
JWT_REFRESH_SECRET=<long-random-string>
ANTHROPIC_API_KEY=sk-ant-...
EMAIL_ENABLED=true
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@yourdomain.com
API_PUBLIC_URL=https://api.yourdomain.com
APP_PUBLIC_URL=https://app.yourdomain.com
```

### Railway

1. Create a new Railway project
2. Add two services — point one to `apps/api/Dockerfile`, one to `apps/web/Dockerfile`
3. Add **PostgreSQL** and **Redis** plugins (env vars auto-injected)
4. Set the remaining env vars in each service's Variables tab
5. See `railway.toml` for the full reference

---

## Roadmap

**Phase 2**
- [x] Gmail OAuth for real sending (Gmail API + auto token refresh + Resend fallback)
- [x] Email open/click/bounce/reply tracking via webhooks
- [x] Account & contact detail pages with ICP score visualization
- [x] Settings page (workspace, CRM, team, ICP config)
- [x] GitHub Actions CI pipeline
- [ ] Salesforce CRM integration
- [ ] Built-in sequence template library (cold outbound, re-engagement, post-demo follow-up)
- [ ] Team-level analytics and per-sequence A/B comparison
- [ ] Contact-level CSV import (currently account-level only)

**Phase 3**
- [ ] LinkedIn outreach automation
- [ ] SMS / WhatsApp channel support
- [ ] Intent signal ingestion (G2 reviews, job postings, funding rounds)
- [ ] ML-based advanced scoring model
- [ ] Multi-territory routing and round-robin assignment
- [ ] Public REST API + webhook system

---

---

# 中文文档

**[English](#ai-sales-agent)** | 中文

> AI 销售执行平台 —— 不只是 Copilot，而是一个完整的执行引擎。自动识别目标客户、生成个性化触达邮件、理解客户回复意图、推动预约会议，并将全过程自动回写 CRM。

---

## 目录

- [产品概述](#产品概述)
- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [API 接口概览](#api-接口概览)
- [数据模型](#数据模型)
- [生产部署](#生产部署)
- [后续规划](#后续规划)

---

## 产品概述

AI Sales Agent 是一个面向 **B2B SaaS 公司 SDR/BDR 团队**的 Outbound 销售自动化平台，将完整的外呼闭环自动化：

```
导入目标客户 → ICP 打分排序 → 加入 Sequence
→ AI 生成个性化邮件 → 发送（或先审批）
→ AI 识别回复意图 → 自动或人工跟进
→ 预约会议 → 生成会前简报 → 同步至 CRM
```

与传统销售工具的核心区别：**AI 进入了执行层，而非仅停留在建议层**。它主动发送邮件、分类回复、推动预约——人工只在设定的审批节点介入。

---

## 核心功能

### 工作空间与权限管理
- 多租户工作空间，支持团队邮件邀请
- 6 级角色权限：`owner → admin → manager → ae → sdr → viewer`
- JWT 认证，短效 Access Token + 轮换 Refresh Token

### ICP 与 Playbook 配置
- 定义理想客户画像：行业、国家、公司规模、技术栈、职级、职能
- 可配置评分权重，ICP 评分自动驱动账号和联系人的优先级排序

### 客户情报（Prospect Intelligence）
- 账号与联系人管理，支持 CSV 批量导入
- 基于 ICP 的自动评分（0–100 分），各维度分项展示：行业 / 国家 / 规模 / 技术栈
- 联系人生命周期追踪：`new → contacted → replied → meeting_scheduled → qualified`

### Sequence 构建器
- 可视化多步骤邮件序列编辑器
- 每步可配置：延迟天数、触发条件、邮件模板、审批模式
- 条件分支：仅在前一封已打开 / 未回复 / 以特定意图回复时执行该步骤
- 三种审批模式：**全自动发送** · **仅首封需审批** · **每封均需审批**
- 可配置每日发送上限和发送时间窗口

### AI 邮件生成（Claude API）
- 使用 `claude-sonnet-4-6` 生成个性化冷邮件
- 上下文输入：联系人姓名 + 职位、公司画像、ICP 配置、品牌语气设置
- 未配置 `ANTHROPIC_API_KEY` 时自动降级为规则 Mock，开发/测试无需真实 API Key
- 支持变量插值：`{{contact.firstName}}`、`{{account.companyName}}`

### 回复理解引擎
- 将来信回复自动分类为 11 种意图：
  `interested`（有兴趣）· `request_demo`（要求演示）· `not_now`（暂不考虑）· `not_relevant`（不相关）· `using_competitor`（已在用竞品）· `pricing_concern`（价格顾虑）· `security_concern`（安全合规问题）· `referral`（转介绍）· `unsubscribe`（退订）· `out_of_office`（外出自动回复）· `unknown`（无法判断）
- 返回置信度（0–1）和建议下一步行动
- 置信度低于 0.7 时强制标记为人工审核
- 收到 `unsubscribe` 意图时自动退订联系人并暂停其 Sequence

### 会议转化引擎
- 提议、确认、追踪会议状态：`proposed → confirmed → completed`
- AI 生成会前简报：联系人背景、公司概况、历史触达记录、建议切入点
- 确认/完成会议时自动更新联系人生命周期状态

### 人工接管控制台（Inbox）
- 待审批队列：查看 AI 生成内容，可编辑主题/正文后发送，或直接拒绝
- 来信回复查看器：显示意图标签和置信度评分
- 对任何 AI 判断提供人工覆盖入口

### CRM 集成（HubSpot）
- OAuth 2.0 连接流程 + Token 自动刷新（过期自动续签，失败自动断开）
- 按邮箱 / 域名去重，Upsert 联系人和公司
- 自动建立联系人与公司的关联关系
- 将邮件 Engagement 和会议记录写入 HubSpot 活动时间线
- CRM 同步通过 BullMQ Worker 异步执行，不阻塞 API 响应，失败记录审计日志

### 数据分析与审计日志
- 30 天指标看板：发送量、打开率、回复率、预约会议数
- 不可篡改的全链路审计日志：记录每个操作的执行者（`ai` / `user` / `system`）
- 完整的 Sequence 执行跟踪，可查看每个联系人的当前步骤及下次发送时间

---

## 技术栈

| 层级 | 技术选型 |
|---|---|
| **后端** | Fastify 4、TypeScript、Node.js 20 |
| **ORM** | Drizzle ORM |
| **数据库** | PostgreSQL 16 |
| **缓存 / 队列** | Redis 7 + BullMQ 5 |
| **AI** | Anthropic Claude API（`claude-sonnet-4-6`）|
| **邮件发送** | Gmail API（OAuth）+ Resend SDK（备选）|
| **前端** | Next.js 14 App Router、Tailwind CSS、SWR |
| **Monorepo** | pnpm workspaces + Turborepo |
| **认证** | JWT（Access Token + Refresh Token 轮换）|
| **CRM** | HubSpot CRM API v3 |
| **测试** | Vitest（55 个测试用例）|
| **CI/CD** | GitHub Actions |
| **部署** | Docker 多阶段构建、Railway |

---

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│                  apps/web（Next.js）                 │
│  /login  /dashboard  /sequences  /contacts  /inbox  │
└──────────────────────┬──────────────────────────────┘
                       │  REST  /api/v1
┌──────────────────────▼──────────────────────────────┐
│                  apps/api（Fastify）                  │
│                                                      │
│  auth │ workspace │ icp │ accounts │ contacts        │
│  sequences │ messages │ meetings │ analytics │ crm   │
│  webhooks │ email-accounts                            │
│                                                      │
│  ┌──────────────┐   ┌───────────────────────────┐   │
│  │   AI 引擎    │   │      BullMQ Workers        │   │
│  │  (Claude)    │   │  sequence · crm · notify   │   │
│  │  邮件生成    │   └───────────────────────────┘   │
│  │  意图分类    │                                    │
│  └──────────────┘                                    │
└──────────┬─────────────────┬──────────────┬─────────┘
           │                 │              │
      PostgreSQL           Redis        HubSpot API
      (Drizzle ORM)      (BullMQ)       (CRM 同步)
```

### Outbound Sequence 执行流程

```
enrollContact()
    │
    └─► BullMQ: scheduleNextStep(enrollmentId)
            │
            └─► executeStep()
                    │
                    ├─► generateEmail() ──► Claude API（个性化生成）
                    │
                    ├─► [需要审批] → status: pending → 进入 Inbox
                    │
                    └─► dispatchMessage() ──► Resend 发信
                                │
                                └─► 推进至下一步（按配置延迟天数）
```

### 回复处理流程

```
POST /messages/replies/inbound
    │
    └─► classifyReply() ──► Claude API（意图分类）
            │
            ├─► intent: unsubscribe  → 退订联系人 + 暂停 Sequence
            ├─► intent: interested   → 标记 + 建议预约会议
            ├─► confidence < 0.7     → requiresHumanReview = true → Inbox
            └─► logActivity()        → 写入审计日志
```

---

## 项目结构

```
ai-sales-agent/
├── apps/
│   ├── api/                           # Fastify 后端
│   │   └── src/
│   │       ├── ai/                    # Claude API 集成
│   │       │   ├── client.ts          # Anthropic SDK 客户端初始化
│   │       │   ├── email-generator.ts # 个性化邮件生成（含 Mock 降级）
│   │       │   └── reply-classifier.ts# 意图分类 + 会前简报生成
│   │       ├── config/env.ts          # Zod 环境变量类型校验
│   │       ├── db/
│   │       │   ├── schema.ts          # 15 张数据表定义 + 全量 relations
│   │       │   ├── index.ts           # 数据库连接 + 统一导出
│   │       │   └── migrate.ts         # 迁移执行脚本
│   │       ├── email/email.service.ts # Gmail 优先、Resend 备选（EMAIL_ENABLED=false 时打印日志）
│   │       ├── modules/
│   │       │   ├── auth/              # JWT 认证路由、RBAC 中间件
│   │       │   ├── workspace/         # 工作空间、邀请、成员管理
│   │       │   ├── icp/               # ICP 配置 CRUD
│   │       │   ├── accounts/          # 账号管理、CSV 导入、ICP 评分
│   │       │   ├── contacts/          # 联系人管理、生命周期更新
│   │       │   ├── sequences/         # Sequence CRUD + 执行引擎
│   │       │   ├── messages/          # 审批队列、入站回复处理
│   │       │   ├── meetings/          # 会议调度、AI 会前简报
│   │       │   ├── crm/               # HubSpot OAuth + 同步服务
│   │       │   ├── webhooks/          # 邮件打开/点击/退信/回复 Webhook
│   │       │   ├── email-accounts/    # Google OAuth + Gmail API 发信
│   │       │   └── analytics/         # 指标看板、审计日志
│   │       ├── queues/
│   │       │   ├── index.ts           # BullMQ 队列定义 + 调度辅助函数
│   │       │   └── worker.ts          # Sequence / CRM / 通知 Worker
│   │       └── server.ts              # Fastify 应用入口，注册所有路由
│   │
│   └── web/                           # Next.js 14 前端
│       └── src/
│           ├── app/
│           │   ├── login/             # 登录页
│           │   ├── register/          # 注册 + 创建工作空间
│           │   └── dashboard/
│           │       ├── page.tsx       # 30 天指标看板
│           │       ├── accounts/      # 账号列表 + CSV 导入
│           │       ├── contacts/      # 联系人列表 + 批量加入 Sequence
│           │       ├── sequences/     # Sequence 列表 + 步骤编辑器
│           │       ├── inbox/         # 审批队列 + 来信回复查看
│           │       ├── meetings/      # 会议状态追踪
│           │       ├── analytics/     # 审计日志查看器
│           │       └── settings/     # 工作空间、CRM、团队、ICP 配置
│           ├── components/
│           │   ├── layout/Sidebar.tsx # 侧边导航栏
│           │   └── ui/SequenceEditor.tsx # 可视化步骤构建器
│           ├── context/auth.tsx       # 全局认证状态 + Token 自动刷新
│           └── lib/api.ts             # fetch 封装 + 401 自动续签
│
└── packages/
    └── types/src/index.ts             # 前后端共享 TypeScript 类型与枚举
```

---

## 快速开始

### 前置条件

- Node.js 20+
- pnpm 9+
- Docker & Docker Compose（用于本地 PostgreSQL 和 Redis）

### 1. 克隆并安装依赖

```bash
git clone https://github.com/chrislwd/ai-sales-agent.git
cd ai-sales-agent
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 按需编辑 .env
```

### 3. 启动基础设施

```bash
docker compose up postgres redis -d
```

### 4. 执行数据库迁移

```bash
pnpm db:migrate    # 执行迁移
```

### 5. 填充示范数据（可选）

```bash
pnpm db:seed       # 创建工作空间、用户、账户、联系人、序列
                    # 登录账号: demo@example.com / demo1234
```

### 6. 启动开发服务器

```bash
pnpm dev   # api 运行于 :3001，web 运行于 :3000
```

打开 [http://localhost:3000](http://localhost:3000) — 如果执行了 seed，可用 `demo@example.com` / `demo1234` 登录。

**Bull Board**: 队列可视化面板位于 [http://localhost:3001/admin/queues](http://localhost:3001/admin/queues)（仅开发模式可用）。

### 运行测试

```bash
pnpm test
```

共 55 个 Vitest 测试用例，覆盖：ICP 评分、回复分类、RBAC 中间件、Sequence 加入、Webhook 处理、邮件生成、JWT 认证与 Token 轮换。

---

## 环境变量

| 变量名 | 说明 | 是否必填 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接串 | 必填 |
| `REDIS_URL` | Redis 连接串 | 必填 |
| `JWT_SECRET` | JWT 签名密钥（建议 32+ 字符随机字符串）| 必填 |
| `JWT_REFRESH_SECRET` | Refresh Token 签名密钥 | 必填 |
| `ANTHROPIC_API_KEY` | Claude API 密钥，留空则启用 Mock 模式 | 可选 |
| `AI_MODEL` | 使用的模型 ID，默认 `claude-sonnet-4-6` | 可选 |
| `EMAIL_ENABLED` | `true` 时通过 Resend 真实发送 | 可选 |
| `RESEND_API_KEY` | Resend API Key（[resend.com](https://resend.com)）| 生产必填 |
| `EMAIL_FROM` | 发件人地址，如 `outreach@yourdomain.com` | 生产必填 |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID（Gmail 发信）| 邮件 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | 邮件 |
| `GOOGLE_REDIRECT_URI` | Google OAuth 回调地址 | 邮件 |
| `RESEND_WEBHOOK_SECRET` | Resend Webhook HMAC 签名密钥 | 可选 |
| `HUBSPOT_CLIENT_ID` | HubSpot OAuth App Client ID | CRM 必填 |
| `HUBSPOT_CLIENT_SECRET` | HubSpot OAuth App Secret | CRM 必填 |
| `HUBSPOT_REDIRECT_URI` | OAuth 回调地址 | CRM 必填 |
| `API_PUBLIC_URL` | API 公开访问地址（用于 OAuth 回调）| 生产必填 |
| `CORS_ORIGIN` | 前端地址，用于 CORS 白名单 | 必填 |

> **AI Mock 模式**：当 `ANTHROPIC_API_KEY` 未设置时，邮件生成器和回复分类器均自动降级为本地规则实现。**无需任何外部 API Key 即可在本地运行完整功能**，适合开发和测试。

完整变量列表及注释见 `.env.example`。

---

## API 接口概览

> 完整接口文档（含请求/响应格式）见英文版 [API Reference](#api-reference) 章节。

| 模块 | 基础路径 | 主要功能 |
|---|---|---|
| 认证 | `/auth` | 注册、登录、刷新 Token、当前用户信息 |
| 工作空间 | `/workspace` | 工作空间设置、成员管理、邀请 |
| ICP 配置 | `/icp` | 理想客户画像 CRUD |
| 账号 | `/accounts` | 账号管理、CSV 导入、ICP 重新评分 |
| 联系人 | `/contacts` | 联系人管理、生命周期更新、退订 |
| Sequence | `/sequences` | 序列构建、联系人加入、暂停/恢复 |
| 消息 | `/messages` | 审批队列、来信处理、人工覆盖 |
| 会议 | `/meetings` | 会议提议/确认、会前简报获取 |
| CRM | `/crm` | HubSpot 连接管理、手动触发同步 |
| 邮箱账户 | `/email-accounts` | Google OAuth 连接、Gmail 发信 |
| Webhook | `/webhooks` | 邮件打开/点击/退信/回复追踪 |
| 分析 | `/analytics` | 指标看板、审计日志 |

---

## 数据模型

共 15 张核心数据表，覆盖完整销售执行生命周期：

```
workspaces ──< workspace_members >── users
           ──< email_accounts（发信邮箱）
           ──< icp_configs（ICP 配置）
           ──< accounts（目标公司）──< contacts（联系人）
           ──< sequences（序列）──< sequence_steps（步骤）
                              ──< sequence_enrollments（加入记录）
                                        ──< messages（邮件）──< replies（回复）
           ──< meetings（会议）
           ──< crm_connections（CRM 连接）
           ──< activity_logs（审计日志）
users ──< refresh_tokens（刷新令牌）
```

**关键设计决策：**

- **软抑制**：`unsubscribed` + `doNotContact` 标志在每次发送前检查，从不物理删除
- **幂等加入**：`UNIQUE(sequence_id, contact_id)` 在数据库层防止重复加入
- **不可变审计日志**：`activity_logs` 只追加写入，每条记录包含 `actorType: ai | user | system`
- **异步 CRM 同步**：变更入队 BullMQ 后立即返回，失败写入审计日志，不阻塞 API

---

## 生产部署

### Docker Compose

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

生产环境最少需配置：

```bash
DATABASE_URL=postgresql://...
POSTGRES_PASSWORD=...
JWT_SECRET=<长随机字符串>
JWT_REFRESH_SECRET=<长随机字符串>
ANTHROPIC_API_KEY=sk-ant-...
EMAIL_ENABLED=true
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@yourdomain.com
API_PUBLIC_URL=https://api.yourdomain.com
APP_PUBLIC_URL=https://app.yourdomain.com
```

### Railway 部署

1. 创建 Railway 项目
2. 添加两个服务，分别指向 `apps/api/Dockerfile` 和 `apps/web/Dockerfile`
3. 添加 **PostgreSQL** 和 **Redis** 插件（环境变量自动注入）
4. 在各服务的 Variables 面板中填写上方剩余变量
5. 完整变量清单见 `railway.toml`

---

## 后续规划

**Phase 2**
- [x] Gmail OAuth 接入，Gmail API 发信 + Token 自动刷新 + Resend 备选
- [x] 邮件打开/点击/退信/回复 Webhook 追踪
- [x] 账户和联系人详情页，含 ICP 评分可视化
- [x] Settings 页面（工作空间、CRM、团队、ICP 配置）
- [x] GitHub Actions CI 流水线
- [ ] Salesforce CRM 集成
- [ ] 内置 Sequence 模板库（冷开发、重激活、会后跟进）
- [ ] 团队级分析报表和 Sequence A/B 对比
- [ ] 联系人级 CSV 导入（当前仅支持账号级）

**Phase 3**
- [ ] LinkedIn 自动化外呼渠道
- [ ] 短信 / WhatsApp 渠道支持
- [ ] Intent 信号接入（G2 评价、招聘信息、融资动态）
- [ ] 基于 ML 的高级评分模型
- [ ] 多区域 Territory 路由和轮询分配
- [ ] 开放 API + Webhook 对外集成能力

---

## License

MIT
