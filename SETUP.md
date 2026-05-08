# MGSG Office Management — Setup Guide

## Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm

---

## 1. Database Setup

Create a PostgreSQL database:
```sql
CREATE DATABASE office_management;
```

---

## 2. Backend Setup

```bash
cd server
npm install

# Copy and fill in your DB credentials
cp .env.example .env
# Edit .env:
#   DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/office_management"
#   JWT_SECRET="pick-a-long-random-secret"

# Generate Prisma client & run migrations
npx prisma migrate dev --name init

# Seed the admin user (mudit.goyal@mgsg.in / muditgoyal)
npm run db:seed

# Start dev server (port 5000)
npm run dev
```

---

## 3. Frontend Setup

```bash
cd client
npm install

# Start dev server (port 3000)
npm start
```

Open http://localhost:3000

---

## Default Admin Login
- **Email:** mudit.goyal@mgsg.in
- **Password:** muditgoyal

---

## Adding New Staff (via Admin Dashboard)
1. Log in as admin
2. Go to Admin → Add Staff
3. Default password for new staff: `Welcome@123` (they can change it in Profile)

---

## Project Structure

```
├── server/
│   ├── prisma/
│   │   ├── schema.prisma     # DB schema (Users, Staff, Clients, Tasks, Timesheets, Expenses)
│   │   └── seed.ts           # Seeds admin user
│   └── src/
│       ├── controllers/      # authController, staffController, clientController, taskController, timesheetController
│       ├── middleware/        # JWT auth + admin guard
│       ├── routes/           # auth, staff, clients, tasks, timesheets
│       └── index.ts          # Express app entry
└── client/
    └── src/
        ├── api/              # Axios API calls
        ├── contexts/         # AuthContext (JWT + user state)
        ├── components/       # Layout (sidebar + header)
        └── pages/
            ├── Login.tsx
            ├── Tasks.tsx        # Task list with cost/OPE calculations
            ├── Timesheet.tsx    # Weekly timesheet grid
            ├── Clients.tsx      # Client master
            ├── Admin.tsx        # Staff management (admin only)
            └── Profile.tsx      # Password change
```

## How Cost & OPE are Calculated
- **Cost Incurred** = Σ (hours logged × staff per-hour cost) across all timesheets for that task
- **OPE Incurred** = Σ expenses added to that task
- Both are computed server-side on every task fetch — no manual entry needed
