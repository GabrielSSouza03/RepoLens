import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

async function migrate() {
  const connectionString =
    process.env.DATABASE_URL ??
    "postgres://repolens:repolens@localhost:5432/repolens";
  const pool = new Pool({ connectionString });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS drizzle_migrations (
      id serial PRIMARY KEY,
      hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const candidates = [
    join(__dirname, "../../drizzle"),
    join(__dirname, "../drizzle"),
    join(process.cwd(), "drizzle"),
  ];
  const dir = candidates.find((p) => {
    try {
      return readdirSync(p).some((f) => f.endsWith(".sql"));
    } catch {
      return false;
    }
  });
  if (!dir) {
    throw new Error("Could not find drizzle migrations directory");
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const existing = await pool.query(
      "SELECT 1 FROM drizzle_migrations WHERE hash = $1",
      [file],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO drizzle_migrations (hash) VALUES ($1)", [
      file,
    ]);
    console.log(`Applied ${file}`);
  }

  await pool.end();
  console.log("Migrations complete");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
