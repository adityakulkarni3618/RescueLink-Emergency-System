// run-migrations.js
// Migration runner script to execute SQL migrations sequentially

const fs = require('fs');
const path = require('path');
const { sequelize } = require('../utils/db');

async function runMigrations() {
  try {
    console.log('[MIGRATOR] Connecting to database...');
    await sequelize.authenticate();
    const dialect = sequelize.getDialect();
    console.log(`[MIGRATOR] Connected. Database dialect: ${dialect}`);

    // Create tracking table dialect-aware
    if (dialect === 'sqlite') {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR(255) NOT NULL UNIQUE,
          run_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } else {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
    }

    const migrationsDir = path.join(__dirname, '../migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[MIGRATOR] No migrations folder found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Check if already run
      const [existing] = await sequelize.query(
        'SELECT * FROM migrations WHERE name = :name',
        { replacements: { name: file }, type: sequelize.QueryTypes.SELECT }
      );

      if (existing) {
        console.log(`[MIGRATOR] Migration ${file} already applied.`);
        continue;
      }

      console.log(`[MIGRATOR] Applying migration: ${file}...`);
      let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // SQLite compatibility transformations
      if (dialect === 'sqlite') {
        sql = sql
          .replace(/TIMESTAMP WITH TIME ZONE/gi, 'DATETIME')
          .replace(/DOUBLE PRECISION/gi, 'REAL')
          .replace(/JSONB/gi, 'TEXT')
          .replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
          .replace(/ON DELETE SET NULL/gi, '')
          .replace(/ON DELETE CASCADE/gi, '')
          .replace(/REFERENCES \w+\(\w+\)/gi, '')
          .replace(/CREATE INDEX IF NOT EXISTS \w+ ON \w+\([\w\s,"]+\);/gi, ''); // SQLite indexes handled simply
      }

      // Execute commands split by semicolon (simple splitter)
      const commands = sql.split(';')
        .map(c => c.trim())
        .filter(c => c.length > 0);

      for (const command of commands) {
        try {
          await sequelize.query(command);
        } catch (queryErr) {
          // If we fail on duplicate index in SQLite/Postgres we can ignore, otherwise fail
          if (!queryErr.message.includes('already exists')) {
            throw queryErr;
          }
        }
      }

      // Log in migrations table
      await sequelize.query(
        'INSERT INTO migrations (name) VALUES (:name)',
        { replacements: { name: file } }
      );
      console.log(`[MIGRATOR] Migration ${file} successfully applied.`);
    }

    console.log('[MIGRATOR] All migrations applied successfully.');
  } catch (err) {
    console.error('[MIGRATOR ERROR] Migration execution failed:', err);
    throw err;
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = runMigrations;
