const { pool } = require('./connection');

async function main() {
  const bCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'branches'");
  console.log('branches columns:\n', bCols.rows.map(x => `  ${x.column_name}: ${x.data_type}`).join('\n'));
  const oCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'organisations'");
  console.log('organisations columns:\n', oCols.rows.map(x => `  ${x.column_name}: ${x.data_type}`).join('\n'));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
