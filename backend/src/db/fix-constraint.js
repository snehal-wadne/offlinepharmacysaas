const { pool } = require('./connection');

const fixConstraint = async () => {
  try {
    console.log('Fixing purchases_status_check constraint...');
    await pool.query(`
      ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
      ALTER TABLE purchases ADD CONSTRAINT purchases_status_check
        CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'));
    `);
    console.log('✓ Constraint purchases_status_check successfully updated in database!');
  } catch (err) {
    console.error('Failed to fix constraint:', err);
  } finally {
    await pool.end();
  }
};

fixConstraint();
