require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
};

const databaseName = process.env.DB_NAME || 'account_transactions';

const pool = mysql.createPool({
  ...config,
  database: databaseName,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: false
});

async function initializeDatabase() {
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error('DB_NAME may contain only letters, numbers, and underscores');
  }

  const connection = await mysql.createConnection({
    ...config,
    multipleStatements: true
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);

    let schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    schema = schema.replace(
      /CREATE DATABASE IF NOT EXISTS account_transactions;\s*USE account_transactions;/i,
      `USE \`${databaseName}\`;`
    );
    await connection.query(schema);
  } finally {
    await connection.end();
  }
}

module.exports = pool;
module.exports.initializeDatabase = initializeDatabase;
