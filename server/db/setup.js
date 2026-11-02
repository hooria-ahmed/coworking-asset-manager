// Creates the database, tables and sample data.  Run:  npm run db:setup
// WARNING: drops and recreates the asset_manager database every time.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { BCRYPT_COST } = require('../src/config/constants');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await conn.query(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));

  const adminHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'Admin@123', BCRYPT_COST);
  const memberHash = await bcrypt.hash('Member@123', BCRYPT_COST);
  await conn.query(
    `INSERT INTO users (name, email, contact_no, password_hash, role) VALUES
     ('Space Admin', ?, '03000000000', ?, 'Admin'),
     ('Test Member', 'member@cowork.local', '03111111111', ?, 'Member')`,
    [process.env.SEED_ADMIN_EMAIL || 'admin@cowork.local', adminHash, memberHash]
  );
  // PRJ-002 is seeded as Under Maintenance: give it its open record so it shows on the
  // Maintenance screen and can be closed from there (an asset is never Under Maintenance without one).
  await conn.query(
    `INSERT INTO maintenance_logs (asset_id, reported_by, issue_description, status)
     SELECT a.asset_id, u.user_id, 'Lamp flickers after 10 minutes of use', 'Open'
       FROM assets a JOIN users u ON u.role = 'Admin' WHERE a.asset_tag = 'PRJ-002' LIMIT 1`
  );
  await conn.end();
  console.log('Database ready. Admin: %s / %s, Member: member@cowork.local / Member@123',
    process.env.SEED_ADMIN_EMAIL || 'admin@cowork.local', process.env.SEED_ADMIN_PASSWORD || 'Admin@123');
}

main().catch((err) => { console.error('Database setup failed:', err.message || err); process.exit(1); });
