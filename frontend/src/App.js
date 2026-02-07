import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { 
  ShoppingCart, MapPin, Search, X, Box, LogOut, Loader, 
  Edit2, Trash2, Smartphone, Lock, User, Key, ShieldCheck, 
  RotateCcw, Plus, Minus, ShoppingBag, 
  Phone, Clock, HelpCircle, MessageSquare, Mail, 
  Truck, CheckCircle, 
  Star, Zap, Sun, Moon, Menu, Facebook, Instagram, Twitter, 
  Crown, Info, AlertTriangle, ChevronDown, Send, ArrowLeft, ChevronLeft, ChevronRight
} from 'lucide-react';

// --- LEAFLET ICON FIX ---
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// ⚠️ CHANGE THIS TO YOUR RENDER URL BEFORE DEPLOYING
const API_URL = 'https://umang-backend.onrender.com/api'; 

// --- 1. GLOBAL UTILS ---
const loadRazorpay = () => {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

const generateInvoice = (orderId, user, items, total, paymentId, date) => {
    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(40, 40, 40); doc.text("UMANG HARDWARE", 14, 20);
    doc.setFontSize(10); doc.text("GSTIN: 10AAAAA0000A1Z5", 14, 26);
    doc.text("Patna, Bihar, India - 800020", 14, 31);
    doc.text("Contact: +91 98765 43210", 14, 36);
    doc.setLineWidth(0.5); doc.line(14, 40, 196, 40);
    
    doc.setFontSize(12); doc.text("Bill To:", 14, 50);
    doc.setFontSize(11); doc.text(`Name: ${user.name}`, 14, 56); doc.text(`Email: ${user.email}`, 14, 61);
    doc.text(`Order ID: #${orderId}`, 140, 50); doc.text(`Pay ID: ${paymentId || 'COD'}`, 140, 56); 
    doc.text(`Date: ${new Date(date || Date.now()).toLocaleDateString()}`, 140, 62);
    const tableRows = items.map(item => [item.name || item.product_name, item.qty || item.quantity, `Rs. ${item.price}`, `Rs. ${item.price * (item.qty || item.quantity)}`]);
    doc.autoTable({ head: [["Item", "Qty", "Unit Price", "Total"]], body: tableRows, startY: 70, theme: 'grid', headStyles: { fillColor: [59, 130, 246] } });
    doc.setFontSize(14); doc.text(`Grand Total: Rs. ${total}`, 140, doc.lastAutoTable.finalY + 10);
    doc.save(`Invoice_${orderId}.pdf`);
};

// --- 2. TOAST SYSTEM ---
const ToastContext = createContext();
const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const addToast = (msg, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    };
    return (
        <ToastContext.Provider value={addToast}>
            {children}
            <div className="fixed bottom-20 md:bottom-4 left-1/2 transform -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-[90%] md:max-w-sm px-4 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(t => (
                        <motion.div key={t.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className={`pointer-events-auto flex items-center gap-3 p-3 md:p-4 rounded-lg shadow-2xl border backdrop-blur-md ${t.type === 'success' ? 'bg-green-600/90 border-green-500 text-white' : t.type === 'error' ? 'bg-red-600/90 border-red-500 text-white' : 'bg-blue-600/90 border-blue-500 text-white'}`}>
                            {t.type === 'success' ? <CheckCircle size={20}/> : t.type === 'error' ? <AlertTriangle size={20}/> : <Info size={20}/>}
                            <span className="font-medium text-sm">{t.msg}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

// --- 3. GLOBAL CONTEXT ---
const AppContext = createContext(null);
const AppProvider = ({ children }) => {
  const toast = useContext(ToastContext);
  const [user, setUser] = useState(null); 
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isChatWidgetOpen, setIsChatWidgetOpen] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  useEffect(() => {
    const storedUser = localStorage.getItem('umangUser');
    const storedCart = localStorage.getItem('umangCart');
    const storedTheme = localStorage.getItem('umangTheme');
    if (storedUser) setUser(JSON.parse(storedUser));
    if (storedCart) setCart(JSON.parse(storedCart));
    if (storedTheme) setIsDarkMode(JSON.parse(storedTheme));
    setLoadingInitial(false);
    setTimeout(() => setIsRestoring(false), 1000); 
  }, []);

  // FIX: Added missing dependencies to avoid build warning
  useEffect(() => {
    if (loadingInitial || isRestoring) return;
    localStorage.setItem('umangCart', JSON.stringify(cart));
    if (user && user.id) {
        fetch(`${API_URL}/users/${user.id}/cart`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cart }) }).catch(console.error);
    }
  }, [cart, user, loadingInitial, isRestoring]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('umangTheme', JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const loginUser = (userData) => {
     setIsRestoring(true);
     const userObj = { ...userData, isPrime: userData.isPrime || false }; 
     setUser(userObj);
     localStorage.setItem('umangUser', JSON.stringify(userObj));
     if (userData.cart && Array.isArray(userData.cart) && userData.cart.length > 0) { setCart(userData.cart); }
     setTimeout(() => setIsRestoring(false), 500);
     toast(`Welcome back, ${userObj.name.split(' ')[0]}!`);
  };

  const joinPrime = () => {
      if(!user) return;
      const updatedUser = { ...user, isPrime: true };
      setUser(updatedUser);
      localStorage.setItem('umangUser', JSON.stringify(updatedUser));
      toast("🎉 Welcome to Umang Prime!", "success");
  };

  const logout = () => { 
      setUser(null); setCart([]); 
      localStorage.removeItem('umangUser'); localStorage.removeItem('umangCart'); 
      toast("Logged out successfully", "info");
  };

  const addToCart = (product) => { 
      setCart(prev => { const existing = prev.find(item => item.id === product.id); if (existing) return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item); return [...prev, { ...product, qty: 1 }]; }); 
      setIsCartOpen(true); 
      toast("Added to Cart", "success");
  };
  
  const decreaseQty = (productId) => setCart(prev => prev.map(item => item.id === productId ? { ...item, qty: Math.max(0, item.qty - 1) } : item).filter(item => item.qty > 0));
  const removeFromCart = (productId) => setCart(prev => prev.filter(item => item.id !== productId));
  const emptyCart = () => setCart([]);
  const cartTotal = cart.reduce((total, item) => total + (item.price * item.qty), 0);
  
  if (loadingInitial) return <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center text-blue-600 font-bold tracking-widest animate-pulse">LOADING...</div>;
  
  return (
    <AppContext.Provider value={{ user, loginUser, logout, cart, addToCart, decreaseQty, removeFromCart, emptyCart, isCartOpen, setIsCartOpen, cartTotal, searchTerm, setSearchTerm, selectedCategory, setSelectedCategory, isDarkMode, toggleTheme, joinPrime, toast, isChatWidgetOpen, setIsChatWidgetOpen }}>
      {children}
    </AppContext.Provider>
  );
};

// --- 4. UI COMPONENTS ---

const BackgroundVideo = () => {
    const { isDarkMode } = useContext(AppContext);
    if (!isDarkMode) return <div className="fixed inset-0 z-[-1] bg-gray-50 transition-colors duration-500"></div>; 
    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden bg-slate-950 transition-colors duration-500">
            <video autoPlay loop muted playsInline className="w-full h-full object-cover opacity-20"><source src="https://assets.mixkit.co/videos/preview/mixkit-server-room-with-blue-lights-2575-large.mp4" type="video/mp4" /></video>
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/60 to-slate-950/90"></div>
        </div>
    );
};

const Navbar = ({ onOpenLogin }) => {
  const { user, cart, logout, setIsCartOpen, setSearchTerm, isDarkMode, toggleTheme } = useContext(AppContext);
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border-b border-gray-200 dark:border-white/10 shadow-sm transition-colors duration-300">
      <div className="max-w-[1600px] mx-auto px-4 h-16 md:h-20 flex items-center justify-between gap-4">
        
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-gray-700 dark:text-white p-2"><Menu/></button>

        <Link to="/" className="flex items-center gap-2 group min-w-fit" onClick={() => window.scrollTo(0,0)}>
          <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition">
            <Box className="text-white w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg md:text-xl font-bold tracking-widest text-gray-900 dark:text-white leading-none">UMANG</span>
            <span className="text-[10px] text-blue-600 dark:text-blue-400 tracking-[0.2em] hidden sm:block">HARDWARE</span>
          </div>
        </Link>

        {/* Search Bar */}
        <div className="hidden md:flex flex-1 max-w-2xl relative group mx-4">
            <input 
                type="text" 
                placeholder="Search products, brands and more..." 
                className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white pl-4 pr-12 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder-gray-500 text-sm" 
                onChange={(e) => { setSearchTerm(e.target.value); navigate('/'); }}
            />
            <button className="absolute right-0 top-0 h-full px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-r-lg transition"><Search size={18}/></button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 md:gap-6 text-sm font-medium text-gray-600 dark:text-gray-300">
          
          <button onClick={toggleTheme} className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full transition hidden sm:block">
              {isDarkMode ? <Sun size={20} className="text-yellow-400"/> : <Moon size={20} className="text-gray-700"/>}
          </button>

          <Link to="/map" className="hidden lg:flex flex-col items-center hover:text-blue-600 dark:hover:text-white transition">
            <MapPin size={20} className="mb-0.5"/>
            <span className="text-[10px]">Locate</span>
          </Link>

          <Link to="/support" className="hidden lg:flex flex-col items-center hover:text-blue-600 dark:hover:text-white transition">
            <HelpCircle size={20} className="mb-0.5"/>
            <span className="text-[10px]">Support</span>
          </Link>
          
          {user?.isAdmin && (
              <Link to="/admin" className="hidden lg:flex flex-col items-center text-red-500 hover:text-red-600 transition" title="Admin Panel">
                <ShieldCheck size={20} className="mb-0.5"/>
                <span className="text-[10px] font-bold">Admin</span>
              </Link>
          )}
          
          <div className="hidden md:flex flex-col items-start cursor-pointer hover:text-blue-600 dark:hover:text-white transition" onClick={user ? () => navigate('/profile') : onOpenLogin}>
             <span className="text-[10px] whitespace-nowrap">Hello, {user ? user.name.split(' ')[0] : 'Sign in'}</span>
             <span className="font-bold text-gray-900 dark:text-white text-xs flex items-center gap-1">
                Account {user?.isPrime && <Crown size={12} className="text-yellow-500 fill-yellow-500"/>}
             </span>
          </div>

          {user && (
            <button onClick={logout} className="hidden md:flex flex-col items-center text-gray-500 hover:text-red-500 transition" title="Sign Out">
                <LogOut size={20} className="mb-0.5"/>
                <span className="text-[10px]">Exit</span>
            </button>
          )}

          <button onClick={() => setIsCartOpen(true)} className="flex items-center relative pr-2">
            <ShoppingCart className="w-6 h-6 md:w-7 md:h-7 text-gray-900 dark:text-white" />
            <span className="absolute -top-1 right-0 bg-yellow-500 text-black text-[10px] font-bold w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center shadow">
                {cart.reduce((a,b)=>a+b.qty,0)}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="md:hidden bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-white/10 overflow-hidden shadow-xl">
                <div className="p-4 space-y-4">
                    <div className="relative">
                        <input type="text" placeholder="Search..." className="w-full bg-gray-100 dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-lg pl-3 py-3 text-sm text-gray-900 dark:text-white" onChange={(e) => { setSearchTerm(e.target.value); navigate('/'); }}/>
                        <Search className="absolute right-3 top-3 text-gray-500" size={18}/>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium text-gray-600 dark:text-gray-300">
                        <Link to="/map" onClick={()=>setMobileMenuOpen(false)} className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg flex flex-col items-center gap-1 active:bg-blue-100"><MapPin size={20}/> Locate</Link>
                        <Link to="/support" onClick={()=>setMobileMenuOpen(false)} className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg flex flex-col items-center gap-1 active:bg-blue-100"><HelpCircle size={20}/> Support</Link>
                        <Link to="/prime" onClick={()=>setMobileMenuOpen(false)} className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg flex flex-col items-center gap-1 active:bg-blue-100"><Crown size={20} className="text-yellow-500"/> Prime</Link>
                        {user?.isAdmin && <Link to="/admin" onClick={()=>setMobileMenuOpen(false)} className="p-3 bg-red-50 dark:bg-slate-800 rounded-lg flex flex-col items-center gap-1 text-red-600"><ShieldCheck size={20}/> Admin</Link>}
                    </div>
                    
                    {user && (
                        <Link to="/profile" onClick={()=>setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-slate-800 rounded-lg">
                            <User size={20}/>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold dark:text-white">My Account</span>
                                <span className="text-xs text-gray-500">Edit Profile & Orders</span>
                            </div>
                        </Link>
                    )}

                    <button onClick={toggleTheme} className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-sm font-bold dark:text-white">
                        <span>Appearance</span>
                        {isDarkMode ? <Sun size={20} className="text-yellow-500"/> : <Moon size={20}/>}
                    </button>

                    {!user ? (
                        <button onClick={() => { onOpenLogin(); setMobileMenuOpen(false); }} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold shadow-md">Sign In / Register</button>
                    ) : (
                        <button onClick={() => { logout(); setMobileMenuOpen(false); }} className="w-full py-3 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg font-bold">Sign Out</button>
                    )}
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const Footer = () => (
    <footer className="bg-slate-900 text-gray-300 pt-12 pb-24 md:pb-6 text-sm border-t border-gray-800">
        <div className="max-w-[1600px] mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
                <h4 className="font-bold text-white mb-4">Get to Know Us</h4>
                <ul className="space-y-2 text-xs md:text-sm text-gray-400">
                    <li className="hover:underline hover:text-white cursor-pointer"><Link to="/support">About Umang</Link></li>
                    <li className="hover:underline hover:text-white cursor-pointer"><Link to="/support">Careers</Link></li>
                    <li className="hover:underline hover:text-white cursor-pointer"><Link to="/support">Press Releases</Link></li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold text-white mb-4">Connect with Us</h4>
                <div className="flex gap-4 mb-4">
                    <Facebook className="hover:text-blue-500 cursor-pointer transition" size={20}/>
                    <Twitter className="hover:text-sky-400 cursor-pointer transition" size={20}/>
                    <Instagram className="hover:text-pink-500 cursor-pointer transition" size={20}/>
                </div>
            </div>
            <div>
                <h4 className="font-bold text-white mb-4">Make Money with Us</h4>
                <ul className="space-y-2 text-xs md:text-sm text-gray-400">
                    <li className="hover:underline hover:text-white cursor-pointer"><Link to="/support">Sell on Umang</Link></li>
                    <li className="hover:underline hover:text-white cursor-pointer"><Link to="/prime">Become an Affiliate</Link></li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold text-white mb-4">Let Us Help You</h4>
                <ul className="space-y-2 text-xs md:text-sm text-gray-400">
                    <li className="hover:underline hover:text-white cursor-pointer"><Link to="/profile">Your Account</Link></li>
                    <li className="hover:underline hover:text-white cursor-pointer"><Link to="/support">Returns Centre</Link></li>
                    <li className="hover:underline hover:text-white cursor-pointer"><Link to="/support">Help</Link></li>
                </ul>
            </div>
        </div>
        <div className="border-t border-gray-800 pt-6 text-center">
            <div className="flex justify-center items-center gap-2 mb-2">
                <Box className="text-white" size={16}/>
                <span className="text-white font-bold tracking-widest">UMANG</span>
            </div>
            <p className="text-xs text-gray-500">© 2026, UmangHardware.com, Inc. or its affiliates. All rights reserved.</p>
        </div>
    </footer>
);

// --- 5. FEATURE COMPONENTS ---
const CartDrawer = () => {
    const { isCartOpen, setIsCartOpen, cart, addToCart, decreaseQty, removeFromCart, user, emptyCart, toast } = useContext(AppContext);
    const [selectedIds, setSelectedIds] = useState([]);

    // FIX: Functional update to remove dependency warning
    useEffect(() => { 
        setSelectedIds(prev => {
            const newIds = cart.map(i => i.id).filter(id => !prev.includes(id));
            return newIds.length > 0 ? [...prev, ...newIds] : prev;
        });
    }, [cart]);

    const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    const selectedItems = cart.filter(item => selectedIds.includes(item.id));
    const payTotal = selectedItems.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const handleRazorpay = async () => {
        if(!user) return toast("Please Login First", "error");
        if(selectedItems.length === 0) return toast("Select items to buy", "info");
        const res = await loadRazorpay();
        if (!res) { toast('Razorpay SDK failed. Check internet.', "error"); return; }
        try {
            const result = await fetch(`${API_URL}/payment/create`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ amount: payTotal }) });
            const order = await result.json();
            const options = { key: "rzp_test_YOUR_KEY_ID_HERE", amount: order.amount, currency: "INR", name: "Umang Hardware", description: "Cart Purchase", order_id: order.id, handler: async function (response) { const verifyRes = await fetch(`${API_URL}/payment/verify`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ...response }) }); if((await verifyRes.json()).success) { const dbOrderRes = await fetch(`${API_URL}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, items: selectedItems, total: payTotal, paymentId: response.razorpay_payment_id }) }); generateInvoice((await dbOrderRes.json()).orderId, user, selectedItems, payTotal, response.razorpay_payment_id, Date.now()); emptyCart(); setIsCartOpen(false); toast("Payment Successful! Invoice Downloaded.", "success"); } else { toast("Payment Verification Failed", "error"); } }, prefill: { name: user.name, email: user.email, contact: user.phone || '9999999999' }, theme: { color: "#3b82f6" } };
            const paymentObject = new window.Razorpay(options); paymentObject.open();
        } catch(e) { console.error(e); toast("Payment Error", "error"); }
    };
    return ( <AnimatePresence> {isCartOpen && ( <> <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsCartOpen(false)} className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm" /> <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-white/10 z-[70] shadow-2xl flex flex-col"> <div className="p-4 md:p-6 border-b border-gray-200 dark:border-white/10 flex justify-between items-center bg-gray-50 dark:bg-slate-950/50"> <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><ShoppingBag className="text-blue-600 dark:text-blue-500"/> Cart</h2> <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-white/10 rounded-full text-gray-500 dark:text-gray-400"><X /></button> </div> <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-white dark:bg-slate-900"> {cart.length === 0 ? (<div className="text-center text-gray-500 mt-20"><ShoppingCart size={48} className="mx-auto mb-4 opacity-50"/><p>Your cart is empty.</p></div>) : ( cart.map(item => ( <motion.div layout key={item.id} className="flex gap-3 bg-gray-50 dark:bg-slate-800/50 p-3 rounded-xl border border-gray-200 dark:border-white/5 items-center shadow-sm"> <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} className="w-5 h-5 accent-blue-600 cursor-pointer"/> <img src={item.image || 'https://via.placeholder.com/80'} alt={item.name} className="w-16 h-16 object-cover rounded bg-white dark:bg-gray-800" /> <div className="flex-1"> <div className="flex justify-between items-start"><h3 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-1">{item.name}</h3><button onClick={() => removeFromCart(item.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14}/></button></div> <p className="text-blue-600 dark:text-blue-400 font-mono text-xs font-bold">₹{item.price}</p> <div className="flex items-center gap-3 mt-2 bg-gray-200 dark:bg-black/40 w-fit rounded-lg"><button onClick={() => decreaseQty(item.id)} className="p-1 hover:bg-gray-300 dark:hover:bg-white/10 text-gray-700 dark:text-white"><Minus size={12}/></button><span className="text-xs font-bold w-4 text-center text-gray-900 dark:text-white">{item.qty}</span><button onClick={() => addToCart(item)} className="p-1 hover:bg-gray-300 dark:hover:bg-white/10 text-gray-700 dark:text-white"><Plus size={12}/></button></div> </div> </motion.div> )) )} </div> {cart.length > 0 && (<div className="p-6 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-slate-950/80 backdrop-blur"><div className="flex justify-between items-center mb-4"><span className="text-gray-500 dark:text-gray-400">Selected Total</span><span className="text-2xl font-bold text-gray-900 dark:text-white">₹{payTotal.toLocaleString()}</span></div><button onClick={handleRazorpay} className="w-full py-3.5 bg-yellow-400 hover:bg-yellow-500 text-black font-bold rounded-xl shadow-md transition-all uppercase tracking-wider">Proceed to Pay</button></div>)} </motion.div> </> )} </AnimatePresence> );
};

// FIX: Removed unused 'user' and 'toast' variables from this scope
const ChatWidget = () => {
    const { isChatWidgetOpen, setIsChatWidgetOpen } = useContext(AppContext);
    const [msgs, setMsgs] = useState([{ from: 'bot', text: 'Hi! How can I help you today?' }]);
    const [input, setInput] = useState('');
    const scrollRef = useRef(null);

    const send = () => {
        if(!input.trim()) return;
        setMsgs(prev => [...prev, { from: 'user', text: input }]);
        setInput('');
        setTimeout(() => {
            setMsgs(prev => [...prev, { from: 'bot', text: 'Thanks! Our agent will contact you soon.' }]);
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 1000);
    };

    return (
        <div className="fixed bottom-24 md:bottom-6 right-6 z-40">
            <AnimatePresence>
                {isChatWidgetOpen && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="mb-4 w-80 bg-white dark:bg-slate-900 border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-96">
                        <div className="bg-blue-600 p-4 font-bold text-white flex justify-between"><span>Support Chat</span><X size={18} className="cursor-pointer" onClick={()=>setIsChatWidgetOpen(false)}/></div>
                        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50 dark:bg-slate-950/50">
                            {msgs.map((m, i) => (
                                <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`p-3 rounded-xl max-w-[80%] text-sm shadow-sm ${m.from === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded-bl-none'}`}>{m.text}</div>
                                </div>
                            ))}
                            <div ref={scrollRef}></div>
                        </div>
                        <div className="p-3 bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-white/10 flex gap-2">
                            <input value={input} onChange={e=>setInput(e.target.value)} onKeyPress={e=>e.key==='Enter' && send()} placeholder="Type message..." className="flex-1 bg-gray-100 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none"/>
                            <button onClick={send} className="p-2 bg-blue-600 rounded-lg text-white"><Send size={16}/></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <button onClick={() => setIsChatWidgetOpen(!isChatWidgetOpen)} className="w-14 h-14 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/30 transition-transform hover:scale-110">
                {isChatWidgetOpen ? <X size={24}/> : <MessageSquare size={24}/>}
            </button>
        </div>
    );
};

// FIX: Changed == to ===
const AuthModal = ({ isOpen, onClose }) => { const { loginUser, toast } = useContext(AppContext); const [mode, setMode] = useState('login'); const [step, setStep] = useState(1); const [loading, setLoading] = useState(false); const [contact, setContact] = useState(''); const [otp, setOtp] = useState(''); const [generatedOtp, setGeneratedOtp] = useState(null); const [details, setDetails] = useState({ name: '', password: '' }); const x = useMotionValue(0); const y = useMotionValue(0); const rotateX = useTransform(y, [-100, 100], [10, -10]); const rotateY = useTransform(x, [-100, 100], [-10, 10]); if (!isOpen) return null; const handleMouseMove = (e) => { const rect = e.currentTarget.getBoundingClientRect(); x.set(e.clientX - rect.left - rect.width / 2); y.set(e.clientY - rect.top - rect.height / 2); }; const handleLogin = async (e) => { e.preventDefault(); setLoading(true); try { const res = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact, password: details.password }) }); const data = await res.json(); if (res.ok) { loginUser(data); onClose(); } else { toast(data.message || "Login Failed", "error"); } } catch (err) { toast("Server Error", "error"); } setLoading(false); }; const requestOtp = async (e) => { e.preventDefault(); setLoading(true); try { const res = await fetch(`${API_URL}/auth/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact }) }); const data = await res.json(); if (res.ok) { setGeneratedOtp(data.mockOtp); alert(`OTP Sent! (Test: ${data.mockOtp})`); setStep(2); } else { toast(data.message, "error"); } } catch (err) { toast("Network Error", "error"); } setLoading(false); }; const verifyOtp = (e) => { e.preventDefault(); if (Number(otp) === Number(generatedOtp)) setStep(3); else toast("Incorrect OTP", "error"); }; const handleRegister = async (e) => { e.preventDefault(); setLoading(true); try { const res = await fetch(`${API_URL}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact, otp, name: details.name, password: details.password }) }); const data = await res.json(); if (res.ok) { loginUser(data); onClose(); } else { toast("Registration Failed", "error"); } } catch (err) { toast("Error", "error"); } setLoading(false); }; return ( <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md perspective-1000 p-4"> <motion.div style={{ rotateX, rotateY, z: 100 }} onMouseMove={handleMouseMove} onMouseLeave={() => { x.set(0); y.set(0); }} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-blue-500/30 w-full max-w-md p-8 rounded-2xl shadow-2xl overflow-hidden"> <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 z-10"><X /></button> <div className="relative z-10 text-center"><h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 tracking-wider">{mode === 'login' ? 'WELCOME' : 'JOIN US'}</h2> <AnimatePresence mode="wait"> {mode === 'login' && ( <motion.form key="login" initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0 }} onSubmit={handleLogin} className="space-y-4"> <div className="relative group"><User className="absolute left-3 top-3.5 text-gray-500 group-focus-within:text-blue-500 transition" size={18} /><input type="text" placeholder="Email or Phone" className="w-full bg-gray-100 dark:bg-black/40 border border-gray-300 dark:border-gray-700 rounded-lg py-3 pl-10 text-gray-900 dark:text-white focus:border-blue-500 outline-none" value={contact} onChange={e => setContact(e.target.value)} required /></div> <div className="relative group"><Lock className="absolute left-3 top-3.5 text-gray-500 group-focus-within:text-blue-500 transition" size={18} /><input type="password" placeholder="Password" className="w-full bg-gray-100 dark:bg-black/40 border border-gray-300 dark:border-gray-700 rounded-lg py-3 pl-10 text-gray-900 dark:text-white focus:border-blue-500 outline-none" value={details.password} onChange={e => setDetails({...details, password: e.target.value})} required /></div> <button disabled={loading} className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 rounded-lg font-bold text-black transition">{loading ? <Loader className="animate-spin mx-auto"/> : 'Sign In'}</button> <div className="text-gray-500 dark:text-gray-400 text-sm mt-4">New User? <span onClick={() => { setMode('signup'); setContact(''); }} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">Create Account</span></div> </motion.form> )} {mode === 'signup' && ( <motion.div key="signup" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }}> {step === 1 && (<form onSubmit={requestOtp} className="space-y-4"><div className="relative group"><Smartphone className="absolute left-3 top-3.5 text-gray-500 transition" size={18} /><input type="text" placeholder="Mobile or Email" className="w-full bg-gray-100 dark:bg-black/40 border border-gray-300 dark:border-gray-700 rounded-lg py-3 pl-10 text-gray-900 dark:text-white focus:border-green-500 outline-none" value={contact} onChange={e => setContact(e.target.value)} required /></div><button disabled={loading} className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 rounded-lg font-bold text-black">{loading ? <Loader className="animate-spin mx-auto"/> : 'Send OTP'}</button></form>)} {step === 2 && (<form onSubmit={verifyOtp} className="space-y-4"><div className="relative group"><ShieldCheck className="absolute left-3 top-3.5 text-gray-500 transition" size={18} /><input type="number" placeholder="Enter OTP" className="w-full bg-gray-100 dark:bg-black/40 border border-gray-300 dark:border-gray-700 rounded-lg py-3 pl-10 text-gray-900 dark:text-white focus:border-purple-500 outline-none" value={otp} onChange={e => setOtp(e.target.value)} required /></div><button className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 rounded-lg font-bold text-black">Verify</button></form>)} {step === 3 && (<form onSubmit={handleRegister} className="space-y-4"><div className="relative group"><User className="absolute left-3 top-3.5 text-gray-500 transition" size={18} /><input type="text" placeholder="Full Name" className="w-full bg-gray-100 dark:bg-black/40 border border-gray-300 dark:border-gray-700 rounded-lg py-3 pl-10 text-gray-900 dark:text-white focus:border-blue-500 outline-none" value={details.name} onChange={e => setDetails({...details, name: e.target.value})} required /></div><div className="relative group"><Key className="absolute left-3 top-3.5 text-gray-500 transition" size={18} /><input type="password" placeholder="Create Password" className="w-full bg-gray-100 dark:bg-black/40 border border-gray-300 dark:border-gray-700 rounded-lg py-3 pl-10 text-gray-900 dark:text-white focus:border-blue-500 outline-none" value={details.password} onChange={e => setDetails({...details, password: e.target.value})} required /></div><button disabled={loading} className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 rounded-lg font-bold text-black">{loading ? <Loader className="animate-spin mx-auto"/> : 'Complete Signup'}</button></form>)} <div className="text-gray-500 dark:text-gray-400 text-sm mt-4">Already have an account? <span onClick={() => setMode('login')} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">Login Here</span></div> </motion.div> )} </AnimatePresence> </div> </motion.div> </div> ); };

// FIX: Added alt prop to img
const ProductCard = ({ product, onOpenLogin }) => {
  const { addToCart, cart, decreaseQty, user, toast } = useContext(AppContext);
  const navigate = useNavigate();
  const cartItem = cart.find(item => item.id === product.id);
  const quantity = cartItem ? cartItem.qty : 0;
  
  const handleDirectBuy = async () => {
      if(!user) { onOpenLogin(); return; }
      const res = await loadRazorpay();
      if (!res) { toast('Razorpay SDK failed', 'error'); return; }
      try {
        const result = await fetch(`${API_URL}/payment/create`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ amount: product.price }) });
        const order = await result.json();
        const options = {
            key: "rzp_test_YOUR_KEY_ID_HERE", 
            amount: order.amount, currency: "INR", name: "Umang Hardware", description: `Buying ${product.name}`, order_id: order.id,
            handler: async function (response) {
                const verifyRes = await fetch(`${API_URL}/payment/verify`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ ...response }) });
                if((await verifyRes.json()).success) {
                    const dbOrderRes = await fetch(`${API_URL}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, items: [{...product, qty:1}], total: product.price, paymentId: response.razorpay_payment_id }) });
                    generateInvoice((await dbOrderRes.json()).orderId, user, [{...product, qty:1}], product.price, response.razorpay_payment_id, Date.now());
                    toast("Purchase Successful!", "success");
                }
            },
            prefill: { name: user.name, email: user.email, contact: user.phone || '9999999999' }, theme: { color: "#3b82f6" },
        };
        const paymentObject = new window.Razorpay(options);
        paymentObject.open();
      } catch(e) { toast("Error starting payment", "error"); }
  };

  return (
    <motion.div whileHover={{ y: -5 }} className="bg-white dark:bg-slate-800/40 backdrop-blur-sm border border-gray-200 dark:border-white/5 rounded-xl overflow-hidden hover:shadow-xl transition-all group flex flex-col justify-between cursor-pointer" onClick={() => navigate(`/product/${product.id}`)}>
        <div>
            <div className="relative h-48 sm:h-56 bg-white overflow-hidden p-4 flex items-center justify-center">
                <img src={product.image || 'https://via.placeholder.com/300'} alt={product.name} className="w-full h-full object-contain group-hover:scale-105 transition duration-500" />
                {product.stock < 5 && <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Low Stock</div>}
                {user?.isPrime && <div className="absolute top-2 left-2 bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"><Crown size={10} fill="currentColor"/> PRIME</div>}
            </div>
            <div className="p-4">
                <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white leading-tight line-clamp-2 mb-1 hover:text-blue-600 dark:hover:text-blue-400">{product.name}</h3>
                <div className="flex text-yellow-400 text-xs gap-0.5 mb-2"><Star size={14} fill="currentColor"/><Star size={14} fill="currentColor"/><Star size={14} fill="currentColor"/><Star size={14} fill="currentColor"/><Star size={14}/> <span className="text-gray-400 ml-1 text-xs">(120)</span></div>
                <div className="flex items-baseline gap-2 mb-3"><span className="text-xs align-top relative top-[-4px] text-gray-900 dark:text-white">₹</span><span className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{product.price}</span><span className="text-xs text-gray-500 line-through">₹{Math.round(product.price * 1.2)}</span></div>
            </div>
        </div>
        <div className="p-4 pt-0 grid grid-cols-2 gap-2" onClick={(e)=>e.stopPropagation()}>
            {quantity > 0 ? (<div className="col-span-1 flex items-center justify-between bg-gray-100 dark:bg-slate-700 rounded-lg px-2 py-2"><button onClick={() => decreaseQty(product.id)}><Minus size={14} className="text-gray-600 dark:text-white"/></button><span className="font-bold text-sm text-gray-900 dark:text-white">{quantity}</span><button onClick={() => addToCart(product)}><Plus size={14} className="text-gray-600 dark:text-white"/></button></div>) : (<button onClick={()=>!user?onOpenLogin():addToCart(product)} className="col-span-1 py-2 bg-yellow-400 hover:bg-yellow-500 text-black font-medium text-sm rounded-full transition shadow-sm">Add to Cart</button>)}
            <button onClick={handleDirectBuy} className="col-span-1 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium text-sm rounded-full transition shadow-sm">Buy Now</button>
        </div>
    </motion.div>
  );
};

// --- 7. PAGES ---

const HeroBanner = () => {
    const [current, setCurrent] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    
    const banners = [
        { id: 1, title: "Industrial Power Tools", subtitle: "Up to 40% OFF this week", image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&q=80", color: "from-blue-900 via-slate-900 to-black" },
        { id: 2, title: "Premium Asian Paints", subtitle: "Color your world | Buy 2 Get 1 Free", image: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&q=80", color: "from-purple-900 via-indigo-900 to-black" },
        { id: 3, title: "Plumbing Essentials", subtitle: "Leak-proof solutions for your home", image: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&q=80", color: "from-emerald-900 via-green-900 to-black" }
    ];

    // FIX: Added banners.length to dependency array
    useEffect(() => {
        if (isHovered) return;
        const interval = setInterval(() => {
            setCurrent((prev) => (prev === banners.length - 1 ? 0 : prev + 1));
        }, 5000);
        return () => clearInterval(interval);
    }, [isHovered, banners.length]);

    const scrollToProducts = () => {
        const productSection = document.getElementById('product-grid');
        if(productSection) productSection.scrollIntoView({ behavior: 'smooth' });
    };

    const next = () => setCurrent(current === banners.length - 1 ? 0 : current + 1);
    const prev = () => setCurrent(current === 0 ? banners.length - 1 : current - 1);

    return (
        <div 
            className="relative w-full h-[250px] md:h-[400px] overflow-hidden mb-8 rounded-b-2xl shadow-2xl group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="w-full h-full relative">
                <AnimatePresence mode='wait'>
                    <motion.div key={current} initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -100 }} transition={{ duration: 0.5 }} className={`absolute inset-0 w-full h-full bg-gradient-to-r ${banners[current].color}`}>
                        <img src={banners[current].image} alt="Banner" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay"/>
                        <div className="relative z-10 max-w-7xl mx-auto h-full flex flex-col justify-center px-6 md:px-12">
                            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
                                <span className="bg-yellow-400 text-black text-xs font-bold px-3 py-1 rounded-full mb-4 inline-block shadow-lg">FEATURED DEAL</span>
                                <h1 className="text-3xl md:text-6xl font-bold text-white mb-2 leading-tight drop-shadow-lg">{banners[current].title}</h1>
                                <p className="text-gray-200 text-sm md:text-xl mb-8 font-medium drop-shadow-md">{banners[current].subtitle}</p>
                                <button onClick={scrollToProducts} className="bg-white text-slate-900 font-bold px-8 py-3 rounded-full hover:bg-gray-100 transition shadow-xl hover:scale-105 transform flex items-center gap-2">
                                    Shop Now <ArrowLeft className="rotate-180" size={20}/>
                                </button>
                            </motion.div>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
            <button onClick={prev} className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/30 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition opacity-0 group-hover:opacity-100"><ChevronLeft size={32}/></button>
            <button onClick={next} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/30 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition opacity-0 group-hover:opacity-100"><ChevronRight size={32}/></button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {banners.map((_, i) => ( <button key={i} onClick={() => setCurrent(i)} className={`w-2.5 h-2.5 rounded-full transition-all shadow-sm ${current === i ? 'bg-white w-8' : 'bg-white/50 hover:bg-white/80'}`}/> ))}
            </div>
        </div>
    );
};

const Categories = () => {
    const { setSelectedCategory, selectedCategory } = useContext(AppContext);
    const cats = ['All', 'Power Tools', 'Hand Tools', 'Plumbing', 'Electrical', 'Safety', 'Fasteners', 'Paints'];
    return (
        <div className="flex gap-4 overflow-x-auto pb-4 mb-8 scrollbar-hide px-4">
            {cats.map((cat, i) => (
                <div key={i} onClick={() => setSelectedCategory(cat)} 
                     className={`min-w-[100px] md:min-w-[120px] h-[90px] md:h-[100px] border rounded-xl flex flex-col items-center justify-center cursor-pointer transition group ${selectedCategory === cat ? 'bg-blue-600 border-blue-400' : 'bg-white dark:bg-slate-800/50 border-gray-200 dark:border-white/5 hover:border-blue-500'}`}>
                    <Box size={24} className={`mb-2 transition group-hover:scale-110 ${selectedCategory === cat ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}/>
                    <span className={`text-xs md:text-sm font-medium ${selectedCategory === cat ? 'text-white' : 'text-gray-700 dark:text-gray-300'}`}>{cat}</span>
                </div>
            ))}
        </div>
    );
};

const MembershipPage = ({ onOpenLogin }) => {
    const { user, joinPrime, toast } = useContext(AppContext);
    const benefits = [
        { icon: <Truck size={32}/>, title: "Free Fast Delivery", desc: "Get unlimited free One-Day and Two-Day delivery on eligible items." },
        { icon: <Zap size={32}/>, title: "Exclusive Deals", desc: "Early access to Lightning Deals and exclusive member-only discounts." },
        { icon: <RotateCcw size={32}/>, title: "Easy Returns", desc: "No questions asked returns with instant refund processing." },
        { icon: <Star size={32}/>, title: "Priority Support", desc: "Dedicated 24/7 customer support line for Prime members." }
    ];

    const handleJoin = async () => {
        if(!user) return onOpenLogin();
        const res = await loadRazorpay();
        if(!res) return toast("Error loading Razorpay", "error");
        const options = { key: "rzp_test_YOUR_KEY_ID_HERE", amount: 99900, currency: "INR", name: "Umang Prime", description: "1 Year", handler: function(response){joinPrime();}, theme: { color: "#EAB308" }};
        const rzp = new window.Razorpay(options); rzp.open();
    };

    return (
        <div className="pt-20 pb-12 min-h-screen bg-gray-50 dark:bg-slate-950">
            <div className="bg-slate-900 text-white py-16 text-center px-4">
                <Crown size={64} className="mx-auto text-yellow-400 mb-4 animate-bounce"/>
                <h1 className="text-3xl md:text-5xl font-bold mb-4">Join <span className="text-blue-400">Umang Prime</span></h1>
                <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto mb-8">The best of shopping and entertainment. Cancel anytime.</p>
                {user?.isPrime ? ( <div className="bg-green-600 text-white px-8 py-3 rounded-full font-bold inline-block shadow-lg">You are a Prime Member</div> ) : ( <button onClick={handleJoin} className="bg-yellow-500 hover:bg-yellow-400 text-black px-10 py-4 rounded-full font-bold text-lg shadow-lg hover:scale-105 transition">Start your 30-day free trial</button> )}
                <p className="text-sm text-gray-400 mt-4">Then ₹999/year.</p>
            </div>
            <div className="max-w-7xl mx-auto px-4 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {benefits.map((b, i) => ( <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} delay={i*0.1} key={i} className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl text-center border border-gray-100 dark:border-gray-800"> <div className="w-16 h-16 mx-auto bg-blue-50 dark:bg-slate-800 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6">{b.icon}</div> <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{b.title}</h3> <p className="text-gray-600 dark:text-gray-400 text-sm">{b.desc}</p> </motion.div> ))}
            </div>
        </div>
    );
};

// FIX: Removed unused variables
const ProductDetailPage = ({ onOpenLogin }) => {
    const { id } = useParams();
    const { addToCart, user, toast } = useContext(AppContext);
    const [product, setProduct] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
    
    useEffect(() => {
        fetch(`${API_URL}/products/${id}`).then(r=>r.json()).then(setProduct);
        fetch(`${API_URL}/products/${id}/reviews`).then(r=>r.json()).then(setReviews);
    }, [id]);

    const submitReview = async (e) => {
        e.preventDefault();
        if(!user) return onOpenLogin();
        const res = await fetch(`${API_URL}/products/${id}/reviews`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId: user.id, userName: user.name, ...newReview }) });
        const data = await res.json();
        setReviews([data, ...reviews]);
        setNewReview({ rating: 5, comment: '' });
        toast("Review Submitted!", "success");
    };

    if(!product) return <div className="min-h-screen pt-24 text-center dark:text-white">Loading...</div>;

    return (
        <div className="pt-24 pb-12 px-4 max-w-7xl mx-auto min-h-screen dark:text-white">
            <div className="grid md:grid-cols-2 gap-12 mb-16">
                <div className="bg-white p-8 rounded-2xl flex items-center justify-center sticky top-24 h-fit border border-gray-200 dark:border-none">
                    <img src={product.image} className="max-h-[500px] w-full object-contain" alt={product.name}/>
                </div>
                <div>
                    <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
                    <div className="flex items-center gap-2 mb-4 text-sm"><div className="flex text-yellow-400"><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/><Star size={16} fill="currentColor"/><Star size={16}/></div><span className="text-blue-500 hover:underline cursor-pointer">{reviews.length} ratings</span></div>
                    <div className="border-b border-gray-200 dark:border-white/10 pb-6 mb-6">
                        <div className="flex items-baseline gap-3 mb-2"><span className="text-3xl font-light text-red-500">-20%</span><span className="text-4xl font-bold">₹{product.price}</span></div>
                        <p className="text-gray-500 text-sm">M.R.P.: <span className="line-through">₹{Math.round(product.price * 1.2)}</span></p>
                        <p className="text-sm text-gray-500">Inclusive of all taxes</p>
                    </div>
                    <div className="space-y-4 mb-8">
                        <div className="flex items-center gap-3"><Truck className="text-gray-500"/><span className="text-sm">Free Delivery <b>Tomorrow</b></span></div>
                        <div className="flex items-center gap-3"><RotateCcw className="text-gray-500"/><span className="text-sm">10 Days Returnable</span></div>
                        <div className="flex items-center gap-3"><ShieldCheck className="text-gray-500"/><span className="text-sm">1 Year Warranty</span></div>
                    </div>
                    <div className="flex gap-4 mb-8"><button onClick={() => addToCart(product)} className="flex-1 py-3 bg-yellow-400 hover:bg-yellow-500 text-black font-bold rounded-full shadow-lg">Add to Cart</button><button className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-full shadow-lg">Buy Now</button></div>
                    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300"><p><b>Brand:</b> Umang Hardware</p><p><b>Category:</b> {product.category}</p><p><b>Stock:</b> {product.stock > 0 ? 'In Stock' : 'Out of Stock'}</p><p className="mt-4 leading-relaxed">{product.description || "High quality industrial tool designed for professional use. Durable, reliable, and efficient."}</p></div>
                </div>
            </div>
            <div className="border-t border-gray-200 dark:border-white/10 pt-12">
                <h2 className="text-2xl font-bold mb-6">Customer Reviews</h2>
                <div className="grid md:grid-cols-3 gap-12">
                    <div className="md:col-span-1">
                        <h3 className="font-bold mb-4">Write a Review</h3>
                        <form onSubmit={submitReview} className="space-y-4 bg-gray-50 dark:bg-slate-800 p-6 rounded-xl">
                            <div><label className="block text-sm mb-1">Rating</label><select className="w-full p-2 rounded dark:bg-slate-900 border" value={newReview.rating} onChange={e=>setNewReview({...newReview, rating: e.target.value})}><option value="5">5 Stars</option><option value="4">4 Stars</option><option value="3">3 Stars</option></select></div>
                            <div><label className="block text-sm mb-1">Comment</label><textarea className="w-full p-2 rounded dark:bg-slate-900 border" rows="3" value={newReview.comment} onChange={e=>setNewReview({...newReview, comment: e.target.value})} required/></div>
                            <button className="w-full py-2 bg-blue-600 text-white font-bold rounded">Submit Review</button>
                        </form>
                    </div>
                    <div className="md:col-span-2 space-y-6">
                        {reviews.length === 0 && <p className="text-gray-500">No reviews yet.</p>}
                        {reviews.map(r => ( <div key={r.id} className="border-b border-gray-200 dark:border-white/10 pb-6"><div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center font-bold text-black">{r.userName[0]}</div><span className="font-bold text-sm">{r.userName}</span></div><div className="flex text-yellow-400 text-xs mb-2">{[...Array(parseInt(r.rating))].map((_,i)=><Star key={i} size={12} fill="currentColor"/>)}</div><p className="text-sm text-gray-700 dark:text-gray-300">{r.comment}</p></div> ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// FIX: Added alt attribute to image
const AdminDashboard = () => { 
    const { user, toast } = useContext(AppContext); 
    const [activeTab, setActiveTab] = useState('inventory'); 
    const [products, setProducts] = useState([]); 
    const [users, setUsers] = useState([]); 
    const [callRequests, setCallRequests] = useState([]);
    const [chats, setChats] = useState([]);
    const [form, setForm] = useState({ id: null, name: '', category: '', price: '', stock: '', image: '' }); 
    const [selectedChatUser, setSelectedChatUser] = useState(null);
    const [adminMessages, setAdminMessages] = useState([]);
    const [replyText, setReplyText] = useState("");

    const refreshData = async () => { 
        setProducts(await (await fetch(`${API_URL}/products`)).json()); 
        setUsers(await (await fetch(`${API_URL}/users`)).json()); 
        setCallRequests(await (await fetch(`${API_URL}/admin/call-requests`)).json());
        setChats(await (await fetch(`${API_URL}/admin/chats`)).json());
    }; 
    
    useEffect(() => { refreshData(); }, []); 
    
    if (!user?.isAdmin) return <Navigate to="/" />; 

    const handleSaveProduct = async (e) => { e.preventDefault(); const url = form.id ? `${API_URL}/products/${form.id}` : `${API_URL}/products`; await fetch(url, { method: form.id ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(form)}); setForm({ id: null, name: '', category: '', price: '', stock: '', image: '' }); refreshData(); toast("Product Saved", "success"); }; 
    const handleDelete = async (id, type) => { if(!window.confirm("Sure?")) return; await fetch(`${API_URL}/${type}/${id}`, { method: 'DELETE' }); refreshData(); toast("Deleted", "info"); }; 
    const resolveCall = async (id) => { await fetch(`${API_URL}/admin/call-requests/${id}`, { method: 'PUT' }); refreshData(); toast("Marked as Called", "success"); };

    const openChat = async (chatUser) => {
        setSelectedChatUser(chatUser);
        const res = await fetch(`${API_URL}/chat/${chatUser.id}`);
        setAdminMessages(await res.json());
    };

    const sendAdminReply = async () => {
        if(!replyText.trim()) return;
        await fetch(`${API_URL}/chat/send`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ userId: selectedChatUser.id, text: replyText, sender: 'admin' })
        });
        setAdminMessages([...adminMessages, { text: replyText, sender: 'admin', createdAt: new Date() }]);
        setReplyText("");
        toast("Reply Sent", "success");
    };

    return (
        <div className="pt-24 px-4 max-w-7xl mx-auto min-h-screen dark:text-white">
            <h1 className="text-3xl font-bold mb-6">Admin Command Center</h1>
            <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
                <button onClick={() => setActiveTab('inventory')} className={`px-6 py-2 rounded-full font-bold transition ${activeTab==='inventory'?'bg-blue-600 text-white':'bg-gray-200 dark:bg-slate-800'}`}>Inventory</button>
                <button onClick={() => setActiveTab('customers')} className={`px-6 py-2 rounded-full font-bold transition ${activeTab==='customers'?'bg-blue-600 text-white':'bg-gray-200 dark:bg-slate-800'}`}>Customers</button>
                <button onClick={() => setActiveTab('communications')} className={`px-6 py-2 rounded-full font-bold transition ${activeTab==='communications'?'bg-blue-600 text-white':'bg-gray-200 dark:bg-slate-800'}`}>Communications</button>
            </div>
            {activeTab === 'inventory' && (
                <div className="grid md:grid-cols-3 gap-8">
                    <form onSubmit={handleSaveProduct} className="bg-white dark:bg-slate-800 p-6 rounded shadow space-y-4">
                        <h3 className="font-bold">Add / Edit Product</h3>
                        <input placeholder="Name" className="w-full border p-2 rounded dark:bg-slate-900" value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
                        <input placeholder="Category" className="w-full border p-2 rounded dark:bg-slate-900" value={form.category} onChange={e=>setForm({...form, category:e.target.value})}/>
                        <input placeholder="Price" className="w-full border p-2 rounded dark:bg-slate-900" value={form.price} onChange={e=>setForm({...form, price:e.target.value})}/>
                        <input placeholder="Stock" className="w-full border p-2 rounded dark:bg-slate-900" value={form.stock} onChange={e=>setForm({...form, stock:e.target.value})}/>
                        <input placeholder="Image URL" className="w-full border p-2 rounded dark:bg-slate-900" value={form.image} onChange={e=>setForm({...form, image:e.target.value})}/>
                        <button className="w-full bg-green-600 text-white py-2 rounded font-bold">Save Product</button>
                    </form>
                    <div className="md:col-span-2 space-y-2 max-h-[600px] overflow-y-auto">
                        {products.map(p=>(
                            <div key={p.id} className="flex justify-between items-center bg-white dark:bg-slate-800 p-4 rounded shadow border dark:border-white/10">
                                <div className="flex gap-4 items-center">
                                    <img src={p.image} className="w-12 h-12 object-cover rounded" alt={p.name}/>
                                    <div><div className="font-bold">{p.name}</div><div className="text-sm text-gray-500">₹{p.price} | Stock: {p.stock}</div></div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={()=>setForm(p)} className="p-2 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={18}/></button>
                                    <button onClick={()=>handleDelete(p.id, 'products')} className="p-2 text-red-500 hover:bg-red-50 rounded"><Trash2 size={18}/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {activeTab === 'customers' && (
                <div className="bg-white dark:bg-slate-800 rounded shadow overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-100 dark:bg-slate-700"><tr><th className="p-4">Name</th><th className="p-4">Email</th><th className="p-4">Role</th><th className="p-4">Action</th></tr></thead>
                        <tbody>
                            {users.map(u=>(
                                <tr key={u.id} className="border-t dark:border-gray-700">
                                    <td className="p-4 flex items-center gap-2"><div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">{u.name[0]}</div> {u.name}</td>
                                    <td className="p-4">{u.email}</td>
                                    <td className="p-4"><span className={`px-2 py-1 rounded text-xs font-bold ${u.is_admin ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{u.is_admin ? 'ADMIN' : 'USER'}</span></td>
                                    <td className="p-4">{!u.is_admin && <button onClick={()=>handleDelete(u.id, 'users')} className="text-red-500 hover:underline">Ban User</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {activeTab === 'communications' && (
                <div className="grid md:grid-cols-2 gap-8">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded shadow h-[500px] overflow-y-auto">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><Phone size={20}/> Call Requests</h3>
                        <div className="space-y-3">
                            {callRequests.map(r => (
                                <div key={r.id} className="flex justify-between items-center p-3 border rounded bg-gray-50 dark:bg-slate-900">
                                    <div><div className="font-bold">{r.phone}</div><div className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleString()}</div></div>
                                    <div className="flex gap-2">
                                        <a href={`tel:${r.phone}`} className="p-2 bg-green-100 text-green-600 rounded hover:bg-green-200"><Phone size={16}/></a>
                                        {r.status !== 'Called' && <button onClick={()=>resolveCall(r.id)} className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"><CheckCircle size={16}/></button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded shadow h-[500px] overflow-y-auto">
                        <h3 className="font-bold mb-4 flex items-center gap-2"><MessageSquare size={20}/> Active Chats</h3>
                        <div className="space-y-3">
                            {chats.map(c => (
                                <div key={c.id} onClick={() => openChat(c)} className="flex justify-between items-center p-3 border rounded bg-gray-50 dark:bg-slate-900 cursor-pointer hover:border-blue-500">
                                    <div className="flex items-center gap-3"><div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold">{c.name[0]}</div><div><div className="font-bold">{c.name}</div><div className="text-xs text-gray-500">{c.email}</div></div></div>
                                    <button className="text-blue-600 font-bold text-sm">Reply</button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            <AnimatePresence>
                {selectedChatUser && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[600px] border dark:border-white/10">
                            <div className="bg-blue-600 p-4 flex justify-between items-center text-white"><h3 className="font-bold">Chat with {selectedChatUser.name}</h3><button onClick={()=>setSelectedChatUser(null)}><X size={20}/></button></div>
                            <div className="flex-1 p-4 overflow-y-auto bg-gray-50 dark:bg-slate-950/50 space-y-3">
                                {adminMessages.map((m, i) => (
                                    <div key={i} className={`flex ${m.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`p-3 rounded-xl max-w-[80%] text-sm ${m.sender === 'admin' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 rounded-bl-none border'}`}>{m.text}<div className="text-[10px] opacity-70 mt-1 text-right">{new Date(m.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div></div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 border-t dark:border-white/10 flex gap-2">
                                <input className="flex-1 bg-gray-100 dark:bg-slate-800 p-3 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" placeholder="Type a reply..." value={replyText} onChange={e=>setReplyText(e.target.value)} onKeyPress={e=>e.key==='Enter' && sendAdminReply()}/>
                                <button onClick={sendAdminReply} className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Send size={20}/></button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

const MapPage = () => { 
  const SHOP_POSITION = [25.5941, 85.1376]; 
  const [status, setStatus] = useState({ open: false, text: "Checking...", color: "text-gray-400" }); 
  useEffect(() => { const check = () => { const h = new Date().getHours(); const open = h >= 9 && h < 21; setStatus({ open, text: open ? "OPEN" : "CLOSED", color: open ? "text-green-500" : "text-red-500" }); }; check(); const t = setInterval(check, 60000); return () => clearInterval(t); }, []); 
  const nav = () => { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition((p) => { const url = `https://www.google.com/maps/dir/?api=1&origin=${p.coords.latitude},${p.coords.longitude}&destination=${SHOP_POSITION[0]},${SHOP_POSITION[1]}`; window.open(url, '_blank'); }, () => { window.open(`https://www.google.com/maps/search/?api=1&query=${SHOP_POSITION[0]},${SHOP_POSITION[1]}`, '_blank'); }); } else { alert("Geolocation is not supported by this browser."); } }; 
  return (
    <div className="pt-20 h-screen flex flex-col md:flex-row">
        <div className="flex-1 h-1/2 md:h-full"><MapContainer center={SHOP_POSITION} zoom={15} style={{height:"100%"}}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Marker position={SHOP_POSITION}><Popup>Umang Hardware</Popup></Marker></MapContainer></div>
        <div className="bg-white dark:bg-slate-900 p-8 md:w-96 flex flex-col justify-center border-l dark:border-white/10"> 
            <h2 className="text-3xl font-bold dark:text-white mb-6">Location Hub</h2> 
            <div className="space-y-6"> <div className="flex gap-4"><MapPin className="text-blue-500"/><div className="dark:text-gray-300"><h4 className="font-bold">Address</h4><p className="text-sm">Main Road, Kankarbagh, Patna</p></div></div> <div className="flex gap-4"><Clock className={status.color}/><div className="dark:text-gray-300"><h4 className="font-bold">Status: {status.text}</h4><p className="text-sm">9:00 AM - 9:00 PM</p></div></div> <div className="flex gap-4"><Phone className="text-purple-500"/><div className="dark:text-gray-300"><h4 className="font-bold">Contact</h4><p className="text-sm">+91 98765 43210</p></div></div> </div> 
            <button onClick={nav} className="mt-8 w-full bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-transform">Start Navigation</button> 
        </div>
    </div>
  ); 
};

const TrackingModal = ({ order, onClose }) => {
    if (!order) return null;
    const steps = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
    const currentStep = order.status === 'Processing' ? 1 : 2; 
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-slate-900 border border-white/10 p-8 rounded-2xl max-w-md w-full relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X /></button>
                <h3 className="text-xl font-bold text-white mb-6">Tracking Order #{order.id}</h3>
                <div className="space-y-6">
                    {steps.map((step, i) => (
                        <div key={i} className="flex gap-4 relative">
                            <div className="flex flex-col items-center">
                                <div className={`w-4 h-4 rounded-full z-10 ${i <= currentStep ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-slate-700'}`}></div>
                                {i < steps.length - 1 && <div className={`w-0.5 h-full absolute top-4 ${i < currentStep ? 'bg-green-500' : 'bg-slate-700'}`}></div>}
                            </div>
                            <div>
                                <h4 className={`text-sm font-bold ${i <= currentStep ? 'text-white' : 'text-gray-500'}`}>{step}</h4>
                                <p className="text-xs text-gray-500">{i <= currentStep ? 'Completed' : 'Pending'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </div>
    );
};

// FIX: Added alt attribute to image
const ProfileDashboard = () => {
    const { user, toast } = useContext(AppContext);
    const [view, setView] = useState('orders'); 
    const [orders, setOrders] = useState([]);
    const [profile, setProfile] = useState({ name: user?.name || '', password: '' });
    const [trackOrder, setTrackOrder] = useState(null);

    useEffect(() => { 
        if (user) fetch(`${API_URL}/orders/${user.id}`).then(r => r.json()).then(d => Array.isArray(d) ? setOrders(d) : setOrders([])); 
        if (user) setProfile({ name: user.name, password: '' });
    }, [user]);

    const updateProfile = async (e) => { e.preventDefault(); const res = await fetch(`${API_URL}/users/${user.id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(profile)}); if(res.ok) toast("Profile Updated", "success"); };

    return (
        <div className="pt-24 px-4 min-h-screen max-w-[1600px] mx-auto dark:text-white pb-12">
            <h1 className="text-3xl font-bold mb-8">Your Account</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div onClick={() => setView('orders')} className={`border dark:border-white/10 p-6 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition flex items-center gap-4 ${view==='orders'?'ring-2 ring-blue-500':''}`}><Truck size={32} className="text-blue-500"/><div><h3 className="font-bold">Your Orders</h3><p className="text-sm text-gray-500">Track & Buy Again</p></div></div>
                <div onClick={() => setView('security')} className={`border dark:border-white/10 p-6 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition flex items-center gap-4 ${view==='security'?'ring-2 ring-purple-500':''}`}><Lock size={32} className="text-purple-500"/><div><h3 className="font-bold">Login & Security</h3><p className="text-sm text-gray-500">Edit Name, Password</p></div></div>
                <div className="border dark:border-white/10 p-6 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition flex items-center gap-4"><Crown size={32} className="text-yellow-500"/><div><h3 className="font-bold">Prime</h3><p className="text-sm text-gray-500">Manage Membership</p></div></div>
            </div>

            {view === 'orders' && (
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold">Order History</h2>
                    {orders.length === 0 && <p className="text-gray-500">No orders yet.</p>}
                    {orders.map(o => (
                        <div key={o.id} className="border dark:border-white/10 rounded-xl p-6 bg-white dark:bg-slate-900 shadow-sm">
                            <div className="flex justify-between mb-4 border-b dark:border-white/10 pb-4">
                                <div><span className="text-xs text-gray-500 uppercase">Order Placed</span><div className="font-bold">{new Date(o.date).toLocaleDateString()}</div></div>
                                <div><span className="text-xs text-gray-500 uppercase">Total</span><div className="font-bold">₹{o.total_amount}</div></div>
                                <div><span className="text-xs text-gray-500 uppercase">Order #</span><div className="font-bold">{o.id}</div></div>
                            </div>
                            <div className="space-y-4">{o.order_items.map(i => (<div key={i.id} className="flex gap-4"><img src={i.image} className="w-16 h-16 object-cover rounded" alt={i.product_name}/><div><div className="font-bold">{i.product_name}</div><div className="text-sm text-gray-500">Qty: {i.quantity}</div></div></div>))}</div>
                            <div className="mt-6 flex gap-3">
                                <button onClick={() => setTrackOrder(o)} className="px-4 py-2 bg-yellow-400 text-black font-bold rounded shadow text-sm hover:bg-yellow-500">Track Package</button>
                                <button onClick={()=>generateInvoice(o.id, user, o.order_items, o.total_amount, 'PAID', o.date)} className="px-4 py-2 border dark:border-white/20 rounded font-bold text-sm hover:bg-gray-100 dark:hover:bg-slate-800">Invoice</button>
                            </div>
                        </div>
                    ))}
                    {trackOrder && <TrackingModal order={trackOrder} onClose={() => setTrackOrder(null)} />}
                </div>
            )}

            {view === 'security' && (
                <div className="max-w-md mx-auto">
                    <h2 className="text-2xl font-bold mb-6">Login & Security</h2>
                    <form onSubmit={updateProfile} className="space-y-4 bg-white dark:bg-slate-900 p-6 rounded-xl border dark:border-white/10 shadow-sm">
                        <div><label className="text-sm font-bold">Your Name</label><input className="w-full border p-2 rounded dark:bg-slate-800" value={profile.name} onChange={e=>setProfile({...profile, name:e.target.value})}/></div>
                        <div><label className="text-sm font-bold">New Password</label><input type="password" className="w-full border p-2 rounded dark:bg-slate-800" value={profile.password} onChange={e=>setProfile({...profile, password:e.target.value})} placeholder="Leave blank to keep current"/></div>
                        <button className="w-full bg-yellow-400 py-3 font-bold rounded text-black shadow hover:bg-yellow-500">Save Changes</button>
                    </form>
                </div>
            )}
        </div>
    );
};

const SupportPage = () => {
    const { user, toast, setIsChatWidgetOpen } = useContext(AppContext);
    const [faqOpen, setFaqOpen] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [siteFeedback, setSiteFeedback] = useState({ rating: 5, comment: '' });
    const [callRequest, setCallRequest] = useState({ phone: '' });

    useEffect(() => { fetch(`${API_URL}/site-reviews`).then(r => r.json()).then(setReviews); }, []);

    const submitFeedback = async (e) => {
        e.preventDefault();
        const res = await fetch(`${API_URL}/site-reviews`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId: user?.id, userName: user?.name || 'Guest', ...siteFeedback })});
        await res.json();
        const data = await (await fetch(`${API_URL}/site-reviews`)).json();
        setReviews(data);
        setSiteFeedback({ rating: 5, comment: '' });
        toast("Thanks for your feedback!", "success");
    };

    const requestCallback = async () => {
        if(!callRequest.phone) return toast("Enter phone number", "error");
        await fetch(`${API_URL}/support/call-request`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId: user?.id, name: user?.name || 'Guest', phone: callRequest.phone })});
        toast("Request Sent! We'll call shortly.", "success");
        setCallRequest({ phone: '' });
    };

    const toggleFaq = (idx) => setFaqOpen(faqOpen === idx ? null : idx);

    return (
        <div className="pt-24 px-4 min-h-screen max-w-[1600px] mx-auto dark:text-white pb-12">
            <h1 className="text-3xl font-bold mb-8">Customer Service</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border dark:border-white/10 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 p-4 opacity-5 group-hover:opacity-10 transition"><MessageSquare size={120} className="text-blue-500"/></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 mb-4"><MessageSquare size={24}/></div>
                        <h3 className="text-lg font-bold dark:text-white mb-1">Live Chat</h3>
                        <p className="text-sm text-gray-500 mb-4">Chat with our support team.</p>
                        <button onClick={() => setIsChatWidgetOpen(true)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition shadow-lg shadow-blue-500/20">Chat Now ↘</button>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border dark:border-white/10 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 p-4 opacity-5 group-hover:opacity-10 transition"><Phone size={120} className="text-green-500"/></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 mb-4"><Phone size={24}/></div>
                        <h3 className="text-lg font-bold dark:text-white mb-1">Talk to Us</h3>
                        <p className="text-sm text-gray-500 mb-4">Instant call or request callback.</p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                             <a href="tel:+919876543210" className="flex items-center justify-center gap-1 py-2 bg-green-100 text-green-700 rounded-lg font-bold text-xs hover:bg-green-200 transition"><Phone size={14}/> Call Now</a>
                             <div className="text-center py-2 text-xs text-gray-400 flex items-center justify-center">OR</div>
                        </div>
                        <div className="space-y-2">
                            <input type="text" placeholder="Your Number" className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none dark:text-white placeholder-gray-400" value={callRequest.phone} onChange={e=>setCallRequest({phone:e.target.value})}/>
                            <button onClick={requestCallback} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition shadow-lg shadow-green-500/20">Request Call</button>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border dark:border-white/10 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 p-4 opacity-5 group-hover:opacity-10 transition"><Mail size={120} className="text-purple-500"/></div>
                    <div className="relative z-10">
                        <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-600 mb-4"><Mail size={24}/></div>
                        <h3 className="text-lg font-bold dark:text-white mb-1">Email Us</h3>
                        <p className="text-sm text-gray-500 mb-4">Send us a detailed query.</p>
                        <a href="mailto:help@umang.com" className="block w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-sm transition text-center shadow-lg shadow-purple-500/20">Compose Email</a>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-12">
                <div className="lg:col-span-2">
                    <h2 className="text-2xl font-bold dark:text-white mb-6">Frequently Asked Questions</h2>
                    <div className="space-y-4">
                        {[
                            {q:"Where is my order?",a:"You can track your order status in the 'Your Orders' section of your profile."},
                            {q:"How do I cancel an order?",a:"Go to 'Your Orders', select the item you wish to cancel, and click the 'Cancel' button."},
                            {q:"What is the return policy?",a:"We accept returns within 10 days of delivery for defective or damaged items."},
                            {q:"Do you offer international shipping?",a:"Currently, we only ship within India. Stay tuned for updates!"}
                        ].map((f, i) => (
                            <div key={i} className="bg-white dark:bg-slate-800/50 border dark:border-white/5 rounded-lg overflow-hidden">
                                <button onClick={() => toggleFaq(i)} className="w-full flex justify-between items-center p-4 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition">
                                    <span className="font-medium dark:text-white">{f.q}</span>
                                    <ChevronDown className={`transform transition-transform ${faqOpen === i ? 'rotate-180 text-blue-500' : 'text-gray-500'}`} />
                                </button>
                                <AnimatePresence>{faqOpen === i && (<motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden"><div className="p-4 pt-0 text-gray-500 text-sm">{f.a}</div></motion.div>)}</AnimatePresence>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <h2 className="text-2xl font-bold mb-6">Rate Our Service</h2>
                    <form onSubmit={submitFeedback} className="space-y-4 bg-white dark:bg-slate-800/50 p-6 rounded-xl shadow border dark:border-white/10">
                        <div><label className="block text-sm mb-1">Rating</label><select className="w-full p-2 rounded dark:bg-slate-900 border" value={siteFeedback.rating} onChange={e=>setSiteFeedback({...siteFeedback, rating: e.target.value})}><option value="5">5 Stars - Excellent</option><option value="4">4 Stars - Good</option><option value="3">3 Stars - Average</option><option value="2">2 Stars - Poor</option><option value="1">1 Star - Bad</option></select></div>
                        <div><label className="block text-sm mb-1">Feedback</label><textarea className="w-full p-2 rounded dark:bg-slate-900 border" rows="4" value={siteFeedback.comment} onChange={e=>setSiteFeedback({...siteFeedback, comment: e.target.value})} placeholder="Tell us about your experience..." required/></div>
                        <button className="w-full py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">Submit</button>
                    </form>
                </div>
            </div>
            <div className="mt-12">
                <h3 className="font-bold text-xl mb-4">Recent Customer Feedback</h3>
                <div className="grid md:grid-cols-3 gap-4">
                    {reviews.length === 0 && <p className="text-gray-500">No feedback yet.</p>}
                    {reviews.slice(0, 3).map(r => ( 
                        <div key={r.id} className="border border-gray-200 dark:border-white/10 p-4 rounded-lg bg-white dark:bg-slate-800">
                            <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 bg-gray-200 dark:bg-slate-700 rounded-full flex items-center justify-center font-bold text-xs">{r.userName[0]}</div><span className="font-bold text-sm">{r.userName}</span></div>
                            <div className="flex text-yellow-400 text-xs mb-2">{[...Array(parseInt(r.rating))].map((_,i)=><Star key={i} size={12} fill="currentColor"/>)}</div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">"{r.comment}"</p>
                        </div> 
                    ))}
                </div>
            </div>
        </div>
    );
};

const HomePage = ({ onOpenLogin }) => {
  const { searchTerm, selectedCategory } = useContext(AppContext);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetch(`${API_URL}/products`).then(async res => { const data = await res.json(); if(Array.isArray(data)) setProducts(data); setLoading(false); }).catch(()=>setLoading(false)); }, []);
  const filtered = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) && (selectedCategory === 'All' || p.category === selectedCategory));

  return (
    <div className="pt-16 md:pt-24 pb-12 px-4 max-w-[1600px] mx-auto min-h-screen" id="product-grid">
      {!searchTerm && <HeroBanner />}
      <Categories />
      <h2 className="text-2xl font-bold dark:text-white mb-6 pl-2 border-l-4 border-blue-500">
          {searchTerm ? `Results for "${searchTerm}"` : selectedCategory !== 'All' ? `${selectedCategory} Products` : 'Recommended For You'}
      </h2>
      {loading ? <div className="flex justify-center py-20"><Loader className="animate-spin text-blue-500 w-12 h-12" /></div> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {filtered.map(p=><ProductCard key={p.id} product={p} onOpenLogin={onOpenLogin}/>)}
        </div>
      )}
    </div>
  );
};

// --- 10. APP ---
const App = () => {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  return (
    <ToastProvider>
        <AppContext.Provider>
            <Router>
                <AppProvider>
                    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 font-sans text-gray-900 dark:text-gray-100 transition-colors duration-300 flex flex-col">
                    <BackgroundVideo />
                    <Navbar onOpenLogin={() => setIsLoginOpen(true)} />
                    <CartDrawer />
                    <div className="flex-1">
                        <Routes>
                            <Route path="/" element={<HomePage onOpenLogin={() => setIsLoginOpen(true)} />} />
                            <Route path="/product/:id" element={<ProductDetailPage onOpenLogin={() => setIsLoginOpen(true)} />} />
                            <Route path="/map" element={<MapPage />} />
                            <Route path="/admin" element={<AdminDashboard />} />
                            <Route path="/support" element={<SupportPage />} />
                            <Route path="/profile" element={<ProfileDashboard />} />
                            <Route path="/prime" element={<MembershipPage onOpenLogin={() => setIsLoginOpen(true)} />} />
                        </Routes>
                    </div>
                    <AuthModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
                    <ChatWidget />
                    <Footer />
                    </div>
                </AppProvider>
            </Router>
        </AppContext.Provider>
    </ToastProvider>
  );
};
export default App;
