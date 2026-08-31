const { testConnection, pool } = require("./db/connection");

const run = async () => {
  try {
    await testConnection();
  } catch (error) {
    console.error("PostgreSQL connection failed.");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

run();
