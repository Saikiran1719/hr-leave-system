# 🏢 HR Leave Management System

Full-stack HR Leave Management System built with **HTML · CSS · JavaScript** (frontend) and **Node.js + Express** (backend) connected to **Microsoft SQL Server**.

---

## 📁 Project Structure

```
hr-leave-system/
├── database/
│   └── schema.sql              ← Run this first in SSMS
├── backend/
│   ├── config/db.js            ← SQL Server connection pool
│   ├── middleware/auth.js      ← JWT verification
│   ├── routes/
│   │   ├── auth.js             ← Login, forgot/reset password
│   │   ├── leaves.js           ← Apply, approve, cancel leaves
│   │   └── users.js            ← Employee CRUD, balances, reports
│   ├── utils/seed.js           ← Hash passwords utility
│   └── server.js               ← Express entry point
├── frontend/
│   ├── index.html              ← Single page app shell
│   ├── css/style.css           ← All styles (responsive)
│   └── js/
│       ├── api.js              ← Fetch wrapper for all API calls
│       ├── ui.js               ← Toast, badges, helpers
│       ├── auth.js             ← Login / forgot / reset screens
│       ├── app.js              ← Sidebar shell + router
│       └── pages/              ← One file per page
│           ├── dashboard.js
│           ├── apply.js
│           ├── myleaves.js     ← includes calendar
│           ├── approvals.js
│           ├── employees.js
│           ├── balances.js     ← includes reports + holidays
│           ├── settings.js
│           └── holidays.js     ← includes profile
├── uploads/                    ← Uploaded attachments (auto-created)
├── .env                        ← Your config (edit this!)
└── package.json
```

---

## ⚙️ Setup Instructions

### 1. Install Node.js
Download from https://nodejs.org (LTS version recommended)

### 2. Install SQL Server
- **SQL Server Express** (free): https://www.microsoft.com/sql-server/sql-server-downloads
- Or use an existing SQL Server instance

### 3. Run the Database Schema
Open **SQL Server Management Studio (SSMS)** or **Azure Data Studio**, then:
1. Open `database/schema.sql`
2. Run the entire script  
   *(It creates the database, all tables, stored procedures, and seed data)*

### 4. Configure Environment
Edit `.env` with your SQL Server details:
```env
DB_SERVER=localhost          # or localhost\SQLEXPRESS for SQL Express
DB_PORT=1433
DB_NAME=HRLeaveDB
DB_USER=sa
DB_PASSWORD=YourPassword
DB_ENCRYPT=false
DB_TRUST_CERT=true
JWT_SECRET=any_long_random_string_here
PORT=3000
```

### 5. Install Dependencies
```bash
npm install
```

### 6. Seed Passwords
```bash
npm run seed
```
*(This hashes the demo passwords into the database)*

### 7. Start the Server
```bash
# Development (auto-restart on changes):
npm run dev

# Production:
npm start
```

### 8. Open in Browser
Visit: **http://localhost:3000**

---

## 🔐 Demo Login Credentials

| Role     | Email              | Password  |
|----------|--------------------|-----------|
| HR Admin | hr@acme.com        | hr@1234   |
| Manager  | ravi@acme.com      | pass123   |
| Employee | arjun@acme.com     | pass123   |
| Employee | priya@acme.com     | pass123   |
| Employee | kiran@acme.com     | pass123   |

---

## 📋 Features by Role

### Employee
- Dashboard with leave balance overview
- Apply for leave (with file attachment)
- View leave history with cancel option
- Monthly leave calendar
- Profile management + password change

### Manager (all employee features +)
- Approve / reject team leave requests
- View all team leave history
- Pending approvals badge in sidebar

### HR Admin (all manager features +)
- Full employee directory (add / edit)
- Manage leave balances per employee
- Reports & analytics (by type, department)
- Holiday calendar management
- System settings (leave policy, workflows)

---

## 🗄️ API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/forgot-password | Request reset token |
| POST | /api/auth/reset-password | Reset password |
| POST | /api/auth/change-password | Change password (auth) |

### Leaves
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/leaves/types | Get leave types |
| GET | /api/leaves/balance | My leave balance |
| GET | /api/leaves/my | My leave applications |
| POST | /api/leaves/apply | Apply for leave |
| PATCH | /api/leaves/:id/cancel | Cancel leave |
| GET | /api/leaves/pending | Pending approvals (mgr/hr) |
| PATCH | /api/leaves/:id/status | Approve/reject (mgr/hr) |
| GET | /api/leaves/calendar | Calendar data |
| GET | /api/leaves/holidays | Holidays |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users/me | My profile |
| PATCH | /api/users/me | Update profile |
| GET | /api/users | All employees (hr/mgr) |
| POST | /api/users | Add employee (hr) |
| PATCH | /api/users/:id | Update employee (hr) |
| GET | /api/users/:id/balance | Employee balance |
| PATCH | /api/users/:id/balance | Update balance (hr) |
| GET | /api/users/reports | Reports (hr) |
| GET | /api/users/notifications | Notifications |

---

## 🛠️ VS Code Tips

Install these extensions for best experience:
- **REST Client** — test API endpoints directly
- **SQL Server (mssql)** — connect to DB inside VS Code
- **Prettier** — code formatting
- **ESLint** — JS linting

---

## 🔒 Security Notes

- Passwords are hashed with **bcrypt** (10 rounds)
- All API routes use **JWT Bearer token** authentication
- Login endpoint is **rate limited** (20 attempts / 15 min)
- File uploads are restricted to PDF, images, and DOC files
- SQL injection prevented via **parameterized queries** (mssql library)

---

## 📝 Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| DB_SERVER | SQL Server hostname | localhost |
| DB_PORT | SQL Server port | 1433 |
| DB_NAME | Database name | HRLeaveDB |
| DB_USER | SQL login username | sa |
| DB_PASSWORD | SQL login password | — |
| DB_ENCRYPT | Use TLS (Azure: true) | false |
| DB_TRUST_CERT | Trust self-signed cert | true |
| JWT_SECRET | JWT signing secret | — |
| JWT_EXPIRES_IN | Token expiry | 8h |
| PORT | HTTP server port | 3000 |
