# Falah Pharmacy Billing & Management SaaS 💊

A universal, offline-first, multi-tenant Pharmacy Billing and Inventory Management Software as a Service (SaaS). Designed to provide fast POS checkout, stock management, and transaction sync for pharmacies of all sizes.

---

## 🚀 Tech Stack

Our application uses a modern, performant, and secure tech stack designed for universal deployment across web, Android, iOS, and desktop:

### 1. Frontend
* **Core Framework**: React Native & [Expo v57](https://docs.expo.dev/) (Universal Web/Mobile)
* **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based router layout)
* **UI & Styling**: Vanilla React Native StyleSheet with custom theme support (light/dark modes)
* **Icons**: Lucide React Native (`lucide-react-native`)

### 2. Backend
* **Server Framework**: Node.js & Express.js
* **Middleware**: CORS (for cross-origin requests), Express JSON Parser
* **Security & Encryption**: `bcrypt` (secure password hashing with 10 salt rounds)

### 3. Database
* **Database Engine**: PostgreSQL (Authoritative cloud source of truth)
* **Client Driver**: Node-Postgres (`pg` connection pool)
* **Features**: Relational constraints, isolated database schemas, database session controls, transactional seeding (`BEGIN`/`COMMIT`/`ROLLBACK`).

---

## 📦 Core Modules & How They Work

The application is structured into modular components:

### 1. Authentication & Tenant Identity (`/auth`)
* **Hashed Credentials**: Passwords are encrypted using bcrypt hashing in the backend database.
* **Flow**: The frontend form captures user input, makes a secure POST request to the Express API `/api/login`, matches credentials using `bcrypt.compare`, and redirects authorized users to the `/explore` dashboard.

### 2. Multi-Tenant Branch Management (`/organizations` & `/branches`)
* **Organizations**: Represents a tenant (pharmacy chain).
* **Branches**: Pharmacies under the organization. Users are granted branch-level permissions via the `user_branch_access` schema.
* **RLS & Security**: Ensures branch and tenant data isolation so staff in one branch cannot read other branches' financial data.

### 3. POS Billing & Catalog Search (`/sales`)
* **Billing Flow**: Scanner/manual search -> Product batch & expiry selection -> Tax/GST application -> Receipt print/share.
* **Offline Billing**: Local transactional IDs are assigned offline, synchronizing idempotently with the server once internet connectivity is restored.

### 4. Inventory, Batch & Expiry Control (`/products`)
* **Batches**: Tracks stock quantities at the batch level to prevent expired medicines from being sold.
* **Stock Movements**: Logs every inventory addition, deduction, transfer, and count adjustment.

---

## 🛠️ Getting Started (Prerequisites)

Make sure you have the following installed on your machine:
* **Node.js** (v18.0.0 or higher)
* **PostgreSQL** (v15.0.0 or higher)
* **Expo CLI** (installed automatically via `npx`)

---

## ⚡ Setup & Run Instructions

Follow these step-by-step instructions to get the application running locally:

### Step 1: PostgreSQL Server Setup
Ensure your local PostgreSQL server is running. You can connect to your server using the default admin credentials:
* **Host**: `localhost`
* **Port**: `5432`
* **Username**: `postgres`
* **Password**: `root`

The backend server will automatically check for and create the `falah_pharmacy` database and tables upon launch.

### Step 2: Configure Backend Environment
Navigate to the `backend/` folder and create a `.env` file:
```env
PORT=5000
DB_USER=postgres
DB_PASSWORD=root
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=falah_pharmacy
```

### Step 3: Run the Backend API
In your terminal, navigate to the `backend/` directory:
```bash
# Install server dependencies
npm install

# Start the Express server with Nodemon (auto-reloads on file edits)
npm run dev
```
*You should see logs indicating the database was created and seeded with default credentials.*

### Step 4: Run the Expo Frontend App
Open a new terminal window and navigate to the `frontend/` directory:
```bash
# Install frontend dependencies
npm install

# Start the Expo development server
npx expo start --web
```
*Press **w** in the terminal to launch the web client at `http://localhost:8081`.*

---

## 📂 Project Directory Structure

```
pharma/
├── backend/                  # Node.js + Express API
│   ├── .env                  # Port & PostgreSQL Credentials
│   ├── .gitignore            # Git ignore rule file
│   ├── db.js                 # Database connection pool & auto-seeder
│   ├── server.js             # Express app entry & auth routes
│   ├── schema.sql            # Isolated user & branch schema script
│   ├── list-users.js         # Quick DB console inspection tool
│   └── package.json          # Node scripts & dependencies
│
├── frontend/                 # React Native / Expo Application
│   ├── assets/               # Local static assets & images
│   ├── src/
│   │   ├── app/              # Screen components & layouts (Expo Router)
│   │   │   ├── index.tsx     # Login screen component
│   │   │   ├── explore.tsx   # Dashboard / Explore screen
│   │   │   └── _layout.tsx   # Application router layouts
│   │   ├── components/       # Custom reusable UI widgets
│   │   └── constants/        # Theme stylesheets & sizes
│   └── package.json          # Expo dependencies & runner commands
```

---

## 🔒 Default Login Credentials (Seeded)

For testing purposes, the database is auto-seeded with the following administrator credentials:
* **Email/Username**: `root@falah.com` (or phone: `root`)
* **Password**: `more#78548`
