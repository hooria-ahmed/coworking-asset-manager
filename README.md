# 🏢 AssetFlow AI — Co-Working Space Asset Management System

[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.0-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Tests](https://img.shields.io/badge/Tests-108%2F108%20Passing-10B981?style=for-the-badge&logo=checkmarx&logoColor=white)](tests/TEST_REPORT.md)

An intelligent, full-stack enterprise asset management platform engineered for co-working spaces and innovation hubs. Built with a modern decoupled architecture combining **React 19**, **Node.js/Express 5**, **MySQL 8**, and **Large Language Models (Groq / Anthropic)** for context-aware inventory recommendations and conversational space assistance.

---

## 🌟 Key Highlights

- **🧠 Intelligent AI Hardware Matchmaker**: Suggests ideal hardware and peripherals based on project requirements, team sizing, and availability schedules using LLM reasoning with deterministic rule fallback.
- **💬 Natural Language Assistant**: Conversational AI assistant connected directly to live inventory data to query asset specs, availability windows, and borrowing policies.
- **🔄 Concurrency-Safe Booking Pipeline**: High-integrity reservation lifecycle with atomic locking (`SELECT ... FOR UPDATE`) preventing double-booking and race conditions across parallel member requests.
- **🛠️ End-to-End Maintenance Operations**: Built-in state machine for equipment damage reporting, repair workflows, downtime tracking, and automated asset status transitioning.
- **📊 Business Intelligence & Exportable Reports**: Real-time KPI dashboards rendered via Chart.js with one-click export to CSV and formatted PDF reports.
- **🎨 "Neon Noir" Design System**: Sleek, accessible dark-first UI built using **Tailwind CSS v4** and **Radix UI** primitives with fluid pill navigation and reactive notifications.
- **🛡️ Enterprise Security**: Hardened against OWASP vulnerabilities with 5-strike brute-force lockout, parametrized SQL queries, CSV formula sanitization, and token revocation checks.

---

## 📸 Core Modules & Capabilities

### 1. 🤖 AI-Powered Intelligence
* **Smart Asset Recommender (`/ai/recommend`)**: Evaluates user task complexity (e.g., 3D rendering vs. basic presentations), duration, and availability to output ranked asset recommendations with explicit explanations.
* **Co-Working AI Assistant (`/ai/assistant`)**: Natural language space agent with dynamic tool execution, conversational context history, and daily request quotas.
* **Resilient Architecture**: Zero-downtime fallback mechanism defaults to business rule ranking if external AI APIs encounter timeouts or outages.

### 2. 📦 Asset Catalog & Lifecycle
* **Central Inventory**: Searchable repository with category classification, condition tracking (*New*, *Good*, *Fair*, *Damaged*), serial numbers, and physical location mapping.
* **Image Upload Pipeline**: Validates image MIME types using magic-byte inspection (supports JPG, PNG, WebP up to 2 MB) with secure server-side isolation.
* **Audit Trail**: Preserves full historical records of past loans, users, and maintenance repairs before allowing asset retirement or deletion.

### 3. 📅 Reservation & Borrowing Engine
* **Conflict-Free Scheduling**: Automated calendar overlap detection ensuring an asset is never reserved concurrently.
* **Approval Workflows**: Administrator dashboard to inspect, approve, or reject pending asset reservations with automated feedback notifications.
* **Check-In / Check-Out**: Digital asset issuance and return tracking, including automatic overdue logging and damage detection.

### 4. 🛠️ Maintenance & Repair Management
* **Issue Reporting**: Members and staff can log equipment defects directly from catalog screens.
* **Lifecycle State Tracking**: Work order progression (*Open* &rarr; *In Progress* &rarr; *Repaired* / *Retired*) with real-time alerts dispatched to original reporters upon resolution.

### 5. 📈 Analytics & Executive Reporting
* **Interactive Dashboards**: Role-tailored dashboards for Administrators (utilization rates, active loans, turnover time) and Members (active borrowings, pending approvals).
* **Automated Data Exports**: Download system-wide usage, maintenance logs, and financial records in CSV format (with spreadsheet formula injection defense) or styled PDF reports.

---

## 🏗️ Architecture & Tech Stack

```
                          ┌────────────────────────────────┐
                          │   React 19 Frontend (Vite)     │
                          │   Tailwind CSS v4 + Radix UI   │
                          └───────────────┬────────────────┘
                                          │  REST API (JSON)
                                          ▼
                          ┌────────────────────────────────┐
                          │   Node.js / Express 5 API      │
                          │   Auth & RBAC (JWT + Bcrypt)   │
                          └──────┬──────────────────┬──────┘
                                 │                  │
                    MySQL Queries│                  │ Tool Execution
                                 ▼                  ▼
                    ┌──────────────────┐    ┌────────────────────┐
                    │  MySQL 8.0 DB    │    │  LLM Engine        │
                    │  (Relational)    │    │  (Groq / Claude)   │
                    └──────────────────┘    └────────────────────┘
```

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite, Tailwind CSS v4 | Dark-first "Neon Noir" theme, Radix UI primitives, Lucide Icons, Sonner |
| **Visualizations**| Chart.js, React-ChartJS-2 | Interactive utilization charts, category breakdowns, and bar strips |
| **Backend** | Node.js (v20+), Express 5 | Modular route architecture, background cron jobs, PDFKit |
| **Database** | MySQL 8.0 | Normalized relational schema with strict foreign keys and transactional locks |
| **Authentication**| JWT (JSON Web Tokens) & Bcrypt | Role-based authorization (`Admin` vs `Member`), 5-strike brute-force lockout |
| **AI Integration** | Groq API / Anthropic Claude API | Contextual system prompts, function calling / tool loop, automated rule fallback |

---

## 📂 Project Structure

```
asset-manager-app/
├── client/                     # React Single Page Application (Vite)
│   ├── src/
│   │   ├── api/client.js       # Centralized Axios/Fetch client with JWT interceptor
│   │   ├── components/         # Shared UI library (Radix primitives, Theme Provider)
│   │   ├── context/AuthContext # Reactive authentication context & session state
│   │   ├── modules/            # Feature pages (AI, Assets, Borrowing, Reports)
│   │   └── routes.jsx          # Protected route declarations and role guards
├── server/                     # Node.js / Express REST API
│   ├── db/
│   │   ├── schema.sql          # Relational database schema & indexes
│   │   ├── seed.sql            # Base seed data for categories and assets
│   │   └── setup.js            # Automated database initialization script
│   └── src/
│       ├── config/             # Database connection pool & constants
│       ├── middleware/         # Authentication, RBAC, and error handlers
│       ├── services/           # Shared utilities (Audit, Availability, LLM, Notify)
│       └── modules/            # Domain-driven REST controllers & services
├── tests/                      # Automated test suites (Functional, Security, AI)
│   └── TEST_REPORT.md          # Full test run report (108/108 passing)
└── docs/                       # Specifications and API Documentation
    ├── SRS.pdf                 # Software Requirements Specification (IEEE 830 compliant)
    ├── API.md                  # Complete REST API specification
    └── UI_TEMPLATE.md          # Design system and component guidelines
```

---

## ⚡ Quickstart Guide

### 1. Prerequisites
- **Node.js** (v20 or higher)
- **MySQL Server 8.0+** (running on port `3306`)

### 2. Clone and Install Dependencies
```bash
git clone https://github.com/hooria-ahmed/coworking-asset-manager.git
cd coworking-asset-manager

# Install dependencies for both server and client:
npm run install:all
```

### 3. Environment Configuration
Create the environment configuration file:

```bash
# Windows:
copy server\.env.example server\.env

# Mac / Linux:
cp server/.env.example server/.env
```

Open `server/.env` and update your MySQL credentials:
```env
PORT=5000
CLIENT_ORIGIN=http://localhost:5173

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=asset_manager

JWT_SECRET=your-secure-secret-key-at-least-16-chars
JWT_EXPIRY=24h

# Optional: Add Groq or Anthropic API key for live AI features (falls back to rule engine if omitted)
GROQ_API_KEY=your_groq_api_key_here
AI_MODEL=openai/gpt-oss-120b
```

### 4. Database Setup & Seeding
Ensure MySQL is running, then run:

```bash
# Initialize database tables and core seed data
npm run db:setup

# (Optional) Populate rich demo data (realistic assets, past loans, maintenance tickets):
npm run db:demo
```

### 5. Run Development Servers
Start the backend and frontend in two separate terminals:

```bash
# Terminal 1: Backend API
cd server
npm start
# -> Running on http://localhost:5000

# Terminal 2: Frontend App
cd client
npm run dev
# -> Running on http://localhost:5173
```

---

## 🔑 Demo Credentials

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@cowork.local` | `Admin@123` | Full inventory control, approvals, maintenance, reports |
| **Member** | `member@cowork.local` | `Member@123` | Browse catalog, request assets, AI assistant, personal history |

---

## 🛡️ Quality Assurance & Automated Testing

The platform includes comprehensive test suites spanning **functional workflows**, **security constraints**, and **AI resiliency**:

```bash
cd tests
node --test --test-concurrency=1
```

- **Suite 01: Functional Lifecycle** (62/62 Passed): Complete validation of Request &rarr; Approval &rarr; Check-out &rarr; Return &rarr; Maintenance pipeline.
- **Suite 02: Security, Concurrency & Boundaries** (31/31 Passed): Race condition resilience (`SELECT ... FOR UPDATE`), SQL injection mitigation, JWT algorithm validation (`alg:none` attack rejection), session revocation on deactivation, and CSV formula injection neutralization.
- **Suite 03: AI Configuration & Resiliency** (15/15 Passed): Quota enforcement, timeout resilience, schema verification, and automated fallback when LLM endpoints are unreachable.

*For complete details, view the [Comprehensive Test Report](tests/TEST_REPORT.md).*

---

## 📄 Documentation

- 📘 **Software Requirements Specification**: [docs/SRS.pdf](docs/SRS.pdf)
- 🔌 **API Documentation & Endpoints**: [docs/API.md](docs/API.md)
- 🎨 **Design System & Components**: [docs/UI_TEMPLATE.md](docs/UI_TEMPLATE.md)

---

## 👥 Engineering Team & Contributors

| Contributor | Focus Areas & Modules |
| :--- | :--- |
| **Misbah Ul Hasan** | **AI Services & Analytics Engine**: LLM Integration (Groq / Anthropic), Availability-Aware Asset Ranking, Usage & Financial Reporting |
| **Hamza Siddiqui** | **Operations & User Management**: Asset Request & Multi-Stage Approval Engine, Checkout/Return Lifecycle, Overdue Monitoring |
| **Syed Azlaan Aqib** | **Asset Catalog & Maintenance**: Inventory Architecture, Category Taxonomy, Search Filtering, Hardware Maintenance Workflows |
| **Hooria Ahmed** | **AI Experiences & Event Notifications**: Conversational AI UI, Dynamic Recommendation Screens, Real-Time Notification Pipeline, Audit History |
