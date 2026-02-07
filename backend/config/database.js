const Sequelize = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

// Connect to MySQL
const sequelize = new Sequelize(
  process.env.DB_NAME,     // Database Name
  process.env.DB_USER,     // Username (usually 'root')
  process.env.DB_PASS,     // Password (often empty or 'password')
  {
    host: process.env.DB_HOST, // 'localhost'
    dialect: 'mysql',
    logging: false, // Set to true if you want to see raw SQL queries
  }
);

module.exports = sequelize;