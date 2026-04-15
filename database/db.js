const { Client } = require("pg");

const db = new Client({
  user: "postgres",
  host: "localhost",
  database: "readium",
  password: "YOUR_DB_PASSWORD",
  port: 5432,
});

db.connect();

module.exports = db;
