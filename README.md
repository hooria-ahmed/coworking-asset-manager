# AI-Powered Co-Working Space Asset Manager

React (Vite) + Node.js/Express + MySQL + JWT, with Claude API for the AI features.
Requirements: [docs/SRS.pdf](docs/SRS.pdf) (the requirement IDs such as FR-RQ-02 in the code come from it).

- **Who builds what:** [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md)
- **Every endpoint and its request/response shape:** [docs/API.md](docs/API.md)
- **Your own task list:** `docs/modules/<your-name>.md`
- **How screens should look (theme, components, page template):** [docs/UI_TEMPLATE.md](docs/UI_TEMPLATE.md), live at `/ui-template` once logged in

## Folder structure

```
server/                    Express API
  db/schema.sql            all tables (from SRS Appendix A)
  db/seed.sql, setup.js    sample categories, 10 assets, an admin and a member
  src/app.js               mounts every module (already done, do not edit)
  src/config/              db pool, constants (statuses, limits)
  src/middleware/auth.js   requireAuth, requireRole('Admin')
  src/services/            shared helpers: notify, availability, audit, llm
  src/modules/<module>/    ONE FOLDER PER MODULE - you only edit your own folders
client/                    React app
  src/api/client.js        api.get / post / put / patch / delete (adds the token)
  src/context/AuthContext  useAuth() -> { user, login, logout }
  src/styles.css           theme "Neon Noir": Tailwind CSS v4 + shadcn/ui colour tokens, dark-first + light
  src/components/ui/       shadcn/ui components + Page, StatCard, StatusBadge, ErrorBox (one import)
  src/components/Layout    floating top bar with pill navigation around every page
  src/modules/_template/   UI template page (/ui-template) and the copy-me PageTemplate.jsx
  src/routes.jsx           every screen, already registered in the menu
  src/modules/<module>/    ONE FOLDER PER MODULE - your screens go here
docs/                      team plan, API contract, per-member briefs
```

## Run it on your laptop

You need **Node.js 20+** and **MySQL 8** (MySQL Installer on Windows, or XAMPP's MySQL/MariaDB).

```bash
# 1. Server
cd server
npm install
cp .env.example .env        # Windows: copy .env.example .env
#    open .env and set DB_USER / DB_PASSWORD to your MySQL login
npm run db:setup            # creates the database with sample data (wipes it if it exists)
node db/demo-data.js        # optional: busy demo data (more members, assets, loans, repairs)
npm run dev                 # API on http://localhost:5000

# 2. Client (second terminal)
cd client
npm install
npm run dev                 # app on http://localhost:5173
```

Log in with **admin@cowork.local / Admin@123** (admin) or **member@cowork.local / Member@123** (member).
Screens nobody has built yet show a placeholder card naming the owner; endpoints not built yet answer `501`.

Test an endpoint without the UI (Postman or curl): log in, copy `token`, then send `Authorization: Bearer <token>`.

## Run it as one app (how it runs when live)

```bash
npm run build    # installs both parts and builds the React app into client/dist
npm start        # Express serves the API and the built app on http://localhost:5000
```
