# Falah Pharmacy Billing - Backend & Database Setup Guide

This Node.js / Express.js backend handles user authentication and connects directly to your local PostgreSQL database server.

---

## 1. Project Configuration (`.env`)

The backend uses environment variables configured in `backend/.env`. The file contains:

```env
PORT=5000
DB_USER=postgres
DB_PASSWORD=root
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=postgres
```

* **PORT**: The port the backend server runs on (`5000`).
* **DB_USER & DB_PASSWORD**: The credentials to connect to your PostgreSQL instance (user: `postgres`, password: `root`).
* **DB_DATABASE**: The name of the database (`postgres`).

---

## 2. Database Auto-Initialization

When the backend server starts, it automatically:
1. Connects to PostgreSQL using the credentials in `.env`.
2. Creates the `users` table if it doesn't already exist in the `public` schema.
3. Seeds the default admin account if the table is empty:
   - **Email/Username**: `root@falah.com`
   - **Phone/Alias**: `root`
   - **Password**: `more#78548`

---

## 3. How to Start the Backend Server

Open your terminal, navigate to the `backend/` directory, and run the following commands:

### Install Dependencies
If you haven't already:
```bash
npm install
```

### Start Server in Development Mode (with hot-reload)
```bash
npm run dev
```
*Expected log output on success:*
```
Backend server is running on port 5000
Database connected. Admin user already seeded.
```

---

## 4. How to View and Query the Data in pgAdmin 4

Based on your current pgAdmin 4 window, here is how you can find and query the data:

### Method A: Using SQL Query in the PSQL Terminal (your active window)
In the black terminal window inside pgAdmin 4 showing the `postgres=#` prompt, type the following commands:

1. **List all tables** in the current database:
   ```sql
   \dt
   ```
   *(You should see `public.users` listed in the output table)*

2. **Query all users** to see the seeded credentials:
   ```sql
   SELECT * FROM users;
   ```

### Method B: Using the Object Explorer Tree (on the left side)
1. On the left side of pgAdmin, locate the **Object Explorer** panel.
2. Expand **Servers** -> **PostgreSQL 18** -> **Databases** -> **postgres**.
3. Under `postgres`, expand **Schemas** -> **public** -> **Tables**.
4. You will see the **users** table listed.
5. Right-click the **users** table, hover over **View/Edit Data**, and select **All Rows**.
6. pgAdmin will automatically execute a query and display the table row data in a grid view at the bottom of the screen.

---

## 5. Quick CLI Inspector
We've provided a simple command-line script to inspect the database rows instantly from your terminal:
```bash
node list-users.js
```
This queries the local PostgreSQL instance and prints all registered users in a clean console table.
