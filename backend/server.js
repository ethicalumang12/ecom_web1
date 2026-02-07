const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { Sequelize } = require('sequelize');

dotenv.config();

const isCloudConnection = !!process.env.DB_HOST;
// --- DATABASE CONFIG ---
// REPLACE THE TOP DB SECTION WITH THIS:
const sequelize = new Sequelize(
    process.env.DB_NAME || 'umang_hardware', 
    process.env.DB_USER || 'root', 
    process.env.DB_PASSWORD || 'umangsql12', 
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: false,
        dialectOptions: isCloudConnection ? {
            ssl: {
                require: true,
                rejectUnauthorized: false // Required for many cloud DBs
            }
        } : {}
    }
);

const app = express();
const Op = Sequelize.Op;

app.use(cors());
app.use(express.json());

// --- CONSTANTS ---
const ADMIN_EMAIL = "admin@umang.com";
const ADMIN_PASS = "admin123";
const otpStore = {};
let adminLastSeen = 0;

const razorpay = new Razorpay({
  key_id: 'rzp_test_YOUR_KEY_ID_HERE', 
  key_secret: 'YOUR_KEY_SECRET_HERE',
});

// --- MODELS ---
const User = sequelize.define('user', {
  name: { type: Sequelize.STRING, allowNull: false },
  email: { type: Sequelize.STRING, allowNull: false, unique: true },
  phone: { type: Sequelize.STRING },
  password: { type: Sequelize.STRING },
  cart_data: { type: Sequelize.TEXT }, 
  is_admin: { type: Sequelize.BOOLEAN, defaultValue: false },
  isPrime: { type: Sequelize.BOOLEAN, defaultValue: false }
}, { timestamps: true });

const Product = sequelize.define('product', {
  name: { type: Sequelize.STRING, allowNull: false },
  category: { type: Sequelize.STRING, allowNull: false },
  price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
  stock: { type: Sequelize.INTEGER, defaultValue: 0 },
  image: { type: Sequelize.STRING(500) },
  description: { type: Sequelize.TEXT } 
}, { timestamps: false });

const Order = sequelize.define('order', {
    userId: { type: Sequelize.INTEGER, allowNull: false },
    total_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
    status: { type: Sequelize.STRING, defaultValue: 'Processing' },
    payment_id: { type: Sequelize.STRING },
    date: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
}, { timestamps: false });

const OrderItem = sequelize.define('order_item', {
    orderId: { type: Sequelize.INTEGER, allowNull: false },
    productId: { type: Sequelize.INTEGER },
    product_name: { type: Sequelize.STRING },
    quantity: { type: Sequelize.INTEGER },
    price: { type: Sequelize.DECIMAL(10, 2) },
    image: { type: Sequelize.STRING }
}, { timestamps: false });

const Review = sequelize.define('review', {
    productId: { type: Sequelize.INTEGER },
    userId: { type: Sequelize.INTEGER },
    userName: { type: Sequelize.STRING },
    rating: { type: Sequelize.INTEGER },
    comment: { type: Sequelize.TEXT },
    date: { type: Sequelize.DATEONLY, defaultValue: Sequelize.NOW }
});

const SiteReview = sequelize.define('site_review', {
    userId: { type: Sequelize.INTEGER },
    userName: { type: Sequelize.STRING },
    rating: { type: Sequelize.INTEGER },
    comment: { type: Sequelize.TEXT }
});

const ChatMessage = sequelize.define('chat_message', {
    userId: { type: Sequelize.INTEGER, allowNull: false },
    sender: { type: Sequelize.STRING }, 
    text: { type: Sequelize.TEXT },
    isRead: { type: Sequelize.BOOLEAN, defaultValue: false },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
});

const CallRequest = sequelize.define('call_request', {
    userId: { type: Sequelize.INTEGER },
    name: { type: Sequelize.STRING },
    phone: { type: Sequelize.STRING },
    status: { type: Sequelize.STRING, defaultValue: 'Pending' },
    createdAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW }
});

// Relationships
Order.hasMany(OrderItem, { foreignKey: 'orderId' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });
Product.hasMany(Review, { foreignKey: 'productId' });
Review.belongsTo(Product, { foreignKey: 'productId' });
User.hasMany(ChatMessage, { foreignKey: 'userId', onDelete: 'CASCADE' });
ChatMessage.belongsTo(User, { foreignKey: 'userId' });

// --- MIDDLEWARE ---
const trackAdmin = (req, res, next) => {
    if(req.path.includes('/admin') || (req.body && req.body.isAdmin)) adminLastSeen = Date.now();
    next();
};
app.use(trackAdmin);

// --- ROUTES ---

// Chat & Support
app.get('/api/chat/status', (req, res) => {
    const isOnline = (Date.now() - adminLastSeen) < 120000; 
    res.json({ online: isOnline });
});

app.get('/api/chat/:userId', async (req, res) => {
    try {
        const msgs = await ChatMessage.findAll({ where: { userId: req.params.userId }, order: [['createdAt', 'ASC']] });
        res.json(msgs);
    } catch(e) { res.json([]); }
});

app.post('/api/chat/send', async (req, res) => {
    const { userId, text, sender } = req.body;
    try {
        // Ensure user exists before chatting
        const userExists = await User.findByPk(userId);
        if (!userExists) return res.status(404).json({ error: "User not found. Please relogin." });

        const msg = await ChatMessage.create({ userId, text, sender, isRead: false });

        // AI Logic
        const isAdminOnline = (Date.now() - adminLastSeen) < 120000;
        if (sender === 'user' && !isAdminOnline) {
            let botReply = "Thanks for your message. An agent will reply shortly.";
            const lower = text.toLowerCase();
            if(lower.includes('price')) botReply = "Prices are listed on the product page.";
            else if(lower.includes('delivery')) botReply = "We deliver within 24-48 hours.";
            else if(lower.includes('hello')) botReply = "Hello! I am the Umang AI Assistant.";
            
            setTimeout(async () => {
                await ChatMessage.create({ userId, text: botReply, sender: 'bot', isRead: false });
            }, 1000);
        }
        res.json(msg);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/chats', async (req, res) => {
    const users = await User.findAll({ include: [{ model: ChatMessage, required: true }], order: [[ChatMessage, 'createdAt', 'DESC']] });
    res.json(users);
});

app.post('/api/support/call-request', async (req, res) => {
    await CallRequest.create(req.body);
    res.json({ success: true });
});
app.get('/api/admin/call-requests', async (req, res) => res.json(await CallRequest.findAll({ order: [['createdAt', 'DESC']] })));
app.put('/api/admin/call-requests/:id', async (req, res) => { await CallRequest.update({ status: 'Called' }, { where: { id: req.params.id } }); res.json({ success: true }); });

// Standard Routes
app.get('/api/products', async (req, res) => res.json(await Product.findAll()));
app.get('/api/products/:id', async (req, res) => res.json(await Product.findByPk(req.params.id)));
app.post('/api/products', async (req, res) => res.status(201).json(await Product.create(req.body)));
app.put('/api/products/:id', async (req, res) => { await Product.update(req.body, { where: { id: req.params.id } }); res.json({ success: true }); });
app.delete('/api/products/:id', async (req, res) => { await Product.destroy({ where: { id: req.params.id } }); res.json({ success: true }); });
app.get('/api/products/:id/reviews', async (req, res) => res.json(await Review.findAll({ where: { productId: req.params.id }, order: [['id', 'DESC']] })));
app.post('/api/products/:id/reviews', async (req, res) => { try { await Review.create({ productId: req.params.id, ...req.body }); res.json({ success: true }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.get('/api/site-reviews', async (req, res) => res.json(await SiteReview.findAll({ order: [['createdAt', 'DESC']] })));
app.post('/api/site-reviews', async (req, res) => res.json(await SiteReview.create(req.body)));
app.get('/api/users', async (req, res) => res.json(await User.findAll()));
app.delete('/api/users/:id', async (req, res) => { await User.destroy({ where: { id: req.params.id } }); res.json({ success: true }); });
app.put('/api/users/:id', async (req, res) => { await User.update(req.body, { where: { id: req.params.id } }); res.json({ message: "Updated" }); });
app.put('/api/users/:id/cart', async (req, res) => { const { cart } = req.body; await User.update({ cart_data: JSON.stringify(cart.map(i=>({name:i.name, price:i.price, Quantity:i.qty}))) }, { where: { id: req.params.id } }); res.json({ success: true }); });
app.post('/api/payment/create', async (req, res) => { try { const order = await razorpay.orders.create({ amount: req.body.amount * 100, currency: "INR", receipt: "order_" + Date.now() }); res.json(order); } catch (e) { res.status(500).send(e); } });
app.post('/api/payment/verify', async (req, res) => { const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body; const generated_signature = crypto.createHmac('sha256', 'YOUR_KEY_SECRET_HERE').update(razorpay_order_id + "|" + razorpay_payment_id).digest('hex'); if (generated_signature === razorpay_signature) res.json({ success: true }); else res.status(400).json({ success: false }); });
app.post('/api/orders', async (req, res) => { const { userId, items, total, paymentId } = req.body; const order = await Order.create({ userId, total_amount: total, status: 'Paid', payment_id: paymentId }); const orderItems = items.map(item => ({ orderId: order.id, productId: item.id, product_name: item.name, quantity: item.qty, price: item.price, image: item.image })); await OrderItem.bulkCreate(orderItems); await User.update({ cart_data: '[]' }, { where: { id: userId } }); res.json({ success: true, orderId: order.id }); });
app.get('/api/orders/:userId', async (req, res) => res.json(await Order.findAll({ where: { userId: req.params.userId }, include: [OrderItem], order: [['date', 'DESC']] })));

// Auth with Real Admin Seed
app.post('/api/auth/otp', async (req, res) => { const { contact } = req.body; const user = await User.findOne({ where: { [Op.or]: [{ email: contact }, { phone: contact }] } }); if(user) return res.status(400).json({ message: "User exists" }); otpStore[contact] = 1234; res.json({ message: "OTP Sent", mockOtp: 1234 }); });
app.post('/api/auth/register', async (req, res) => { const { contact, otp, name, password } = req.body; if(otpStore[contact] != otp) return res.status(400).json({ message: "Invalid OTP" }); try { const user = await User.create({ name, password, email: contact.includes('@')?contact:`${contact}@mobile`, phone: contact.includes('@')?null:contact }); delete otpStore[contact]; res.json({ id: user.id, name: user.name, role: 'user', cart: [] }); } catch(e) { res.status(500).json({ message: "Error" }); } });

app.post('/api/auth/login', async (req, res) => {
    const { contact, password } = req.body;
    const user = await User.findOne({ where: { [Op.or]: [{ email: contact }, { phone: contact }] } });
    if (!user || user.password !== password) return res.status(401).json({ message: "Invalid Credentials" });
    
    // Track admin activity
    if(user.is_admin) adminLastSeen = Date.now();

    let restoredCart = [];
    try { 
        const storedData = JSON.parse(user.cart_data) || [];
        if(storedData.length > 0) {
            const allProducts = await Product.findAll();
            restoredCart = storedData.map(i => {
                const p = allProducts.find(prod => prod.name === i.name);
                return { id: p ? p.id : Math.random(), name: i.name, price: i.price, image: p?.image, qty: i.Quantity };
            });
        }
    } catch(e) {}
    
    res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, isAdmin: user.is_admin, isPrime: user.isPrime, cart: restoredCart });
});

// Seed Admin & Start
const PORT = 5000;
sequelize.sync({ alter: true }).then(async () => {
    console.log('✅ MySQL Database Synced.');
    
    // Create Admin if not exists
    const admin = await User.findOne({ where: { email: ADMIN_EMAIL } });
    if(!admin) {
        await User.create({ name: "Master Admin", email: ADMIN_EMAIL, password: ADMIN_PASS, is_admin: true });
        console.log("👑 Admin Account Created: admin@umang.com / admin123");
    }

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});