const Sequelize = require('sequelize');
const sequelize = require('../config/database');

// 1. User Model (Added cart_data)
const User = sequelize.define('user', {
  name: { type: Sequelize.STRING, allowNull: false },
  email: { type: Sequelize.STRING, allowNull: false, unique: true },
  phone: { type: Sequelize.STRING },
  password: { type: Sequelize.STRING },
  cart_data: { type: Sequelize.TEXT }, // <--- Stores Cart JSON
  is_admin: { type: Sequelize.BOOLEAN, defaultValue: false }
}, { timestamps: false, tableName: 'users' });

// 2. Product Model
const Product = sequelize.define('product', {
  name: { type: Sequelize.STRING, allowNull: false },
  category: { type: Sequelize.STRING, allowNull: false },
  price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
  stock: { type: Sequelize.INTEGER, defaultValue: 0 },
  image: { type: Sequelize.STRING } 
}, { timestamps: false, tableName: 'products' });

// 3. Order Models
const Order = sequelize.define('order', {
    userId: { type: Sequelize.INTEGER, allowNull: false },
    total_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
    status: { type: Sequelize.STRING, defaultValue: 'Processing' },
    date: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
}, { timestamps: false, tableName: 'orders' });

const OrderItem = sequelize.define('order_item', {
    orderId: { type: Sequelize.INTEGER, allowNull: false },
    productId: { type: Sequelize.INTEGER },
    product_name: { type: Sequelize.STRING },
    quantity: { type: Sequelize.INTEGER },
    price: { type: Sequelize.DECIMAL(10, 2) },
    image: { type: Sequelize.STRING }
}, { timestamps: false, tableName: 'order_items' });

Order.hasMany(OrderItem, { foreignKey: 'orderId' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });

module.exports = { User, Product, Order, OrderItem, sequelize };