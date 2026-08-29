/**
 * BACKEND SERVER ENTRY POINT (Express API)
 * 
 * Purpose:
 * Starts the Node.js Express server on port 5000, handles incoming HTTP API requests 
 * from the React Native/Expo frontend web application, and exposes authentication endpoints.
 */

const express = require('express');
const cors = require('cors'); // Handles Cross-Origin Resource Sharing (CORS) between React Native and the API
require('dotenv').config(); // Load environment settings
const { pool, initDb } = require('./db'); // Import DB connection pool and initialization trigger
const bcrypt = require('bcrypt'); // Import password decryption/hashing library

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
// CORS allows the Expo application running on http://localhost:8081 to fetch requests from http://localhost:5000
app.use(cors());
// Body parser middleware to automatically parse request body streams as JSON objects (accessible via req.body)
app.use(express.json());

// Initialize Database Tables and Seeding on Startup
// This creates the 'falah_pharmacy' database and tables, then seeds the default 'root' user
initDb();

/**
 * LOGIN AUTHENTICATION ROUTE
 * POST /api/login
 * 
 * Flow:
 * 1. Receive JSON request body containing { emailOrPhone, password }.
 * 2. Validate that inputs are provided.
 * 3. Query PostgreSQL 'users' table to find a matching user by email or phone.
 * 4. Verify that the account is active.
 * 5. Securely compare the plaintext input password with the stored bcrypt password hash using bcrypt.compare().
 * 6. If matching, return user profile info and status code 200 (Success).
 */
app.post('/api/login', async (req, res) => {
  const { emailOrPhone, password } = req.body;

  // Basic validation check
  if (!emailOrPhone || !password) {
    return res.status(400).json({ message: 'Email/Phone and password are required.' });
  }

  try {
    // DATABASE QUERY
    // Query the Postgres 'users' table to find a user where either their email or phone
    // matches the provided 'emailOrPhone' identifier.
    const userRes = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR phone = $2',
      [emailOrPhone, emailOrPhone]
    );

    // If no user matches, return 401 Unauthorized
    if (userRes.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = userRes.rows[0];

    // Ensure the user account has not been deactivated
    if (!user.is_active) {
      return res.status(403).json({ message: 'User account is deactivated.' });
    }

    // ENCRYPTED PASSWORD DECRYPTION & VALIDATION
    // bcrypt.compare() takes the plaintext input password, applies the same salt hashing 
    // algorithm, and compares the resulting hash with the encrypted hash string stored 
    // in user.password. This process protects the password from being visible to db users.
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // STRIP SENSITIVE FIELDS
    // Deconstruct and omit the password string before sending the user profile data back to the client
    const { password: _, ...userWithoutPassword } = user;
    return res.status(200).json({
      message: 'Login successful',
      user: userWithoutPassword,
    });
  } catch (err) {
    console.error('Error handling login API request:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * HEALTH CHECK ENDPOINT
 * GET /health
 * 
 * Used to verify if the server is running and reachable.
 */
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
