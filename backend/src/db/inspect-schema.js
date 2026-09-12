const { pool } = require("./connection");

async function main() {
  const tables = [
    "invoices",
    "invoice_items",
    "inventory_batches",
    "products",
    "customers",
  ];
  for (const t of tables) {
    const res = await pool.query(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position",
      [t],
    );
    console.log(`=== ${t} ===`);
    console.log(
      res.rows
        .map((r) => `${r.column_name} (${r.data_type}, null:${r.is_nullable})`)
        .join(", "),
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
