//info: This code is for setup and Run DataBase Postgres in local system

// const { Client } = require("pg");

// const db = new Client({
//   user: "postgres",
//   host: "localhost",
//   database: "readium",
//   password: process.env.PG_PASSWORD,
//   port: 5432,
// });

// db.connect();

// module.exports = db;

//-----------------------------------------------------------
//Info: this code Below id setup for database online on NEON for make it available for users

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = pool;