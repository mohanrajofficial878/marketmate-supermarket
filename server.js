const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'marketmate.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 phone TEXT DEFAULT '', password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer',
 created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL,
 description TEXT DEFAULT '', price REAL NOT NULL CHECK(price >= 0),
 cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0), stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
 unit TEXT NOT NULL DEFAULT 'each', image TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_code TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL,
 customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
 fulfillment TEXT NOT NULL CHECK(fulfillment IN ('delivery','pickup')),
 payment_method TEXT NOT NULL CHECK(payment_method IN ('cod','online')),
 payment_status TEXT NOT NULL DEFAULT 'pending', status TEXT NOT NULL DEFAULT 'pending',
 subtotal REAL NOT NULL, delivery_fee REAL NOT NULL DEFAULT 0, total REAL NOT NULL,
 notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER,
 product_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, unit_cost REAL NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
 FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS expenses (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, amount REAL NOT NULL CHECK(amount >= 0),
 expense_date TEXT NOT NULL DEFAULT (date('now','localtime')), created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

const seedProducts = [
 ['Tomato','Vegetables','Fresh local tomatoes',32,22,80,'kg',''],
 ['Potato','Vegetables','Everyday cooking potatoes',38,27,100,'kg',''],
 ['Onion','Vegetables','Fresh onions',45,33,90,'kg',''],
 ['Banana','Fruits','Ripe bananas',60,42,45,'dozen',''],
 ['Apple','Fruits','Crisp apples',180,135,30,'kg',''],
 ['Milk','Dairy','Full cream milk',32,27,60,'500 ml',''],
 ['Curd','Dairy','Fresh curd',35,28,35,'500 g',''],
 ['Rice','Staples','Everyday rice',62,48,120,'kg',''],
 ['Toor Dal','Staples','Premium toor dal',145,118,40,'kg',''],
 ['Sunflower Oil','Staples','Refined cooking oil',155,132,28,'litre',''],
 ['Bread','Bakery','Fresh sandwich bread',40,30,24,'pack',''],
 ['Eggs','Dairy','Farm eggs',72,60,35,'6 pack',''],
 ['Biscuits','Snacks','Tea-time biscuits',20,14,70,'pack',''],
 ['Dishwash Liquid','Household','Kitchen cleaning liquid',99,72,18,'bottle','']
];
const productCount = db.prepare('SELECT COUNT(*) n FROM products').get().n;
if (!productCount) {
 const ins = db.prepare('INSERT INTO products(name,category,description,price,cost_price,stock,unit,image) VALUES(?,?,?,?,?,?,?,?)');
 const tx = db.transaction(() => seedProducts.forEach(p => ins.run(...p)));
 tx();
}
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const adminPin = String(process.env.ADMIN_PIN || '4146');
if (!db.prepare('SELECT id FROM users WHERE role=?').get('admin')) {
 db.prepare('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)')
   .run(process.env.ADMIN_NAME || 'Supermarket Admin', adminEmail, '', bcrypt.hashSync(adminPassword, 12), 'admin');
 console.log(`Initial admin created: ${adminEmail}. Change the default password before public deployment.`);
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
 secret: process.env.SESSION_SECRET || 'development-only-change-this-session-secret-please',
 resave: false, saveUninitialized: false,
 cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000*60*60*8 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const safeUser = u => ({ id:u.id, name:u.name, email:u.email, phone:u.phone, role:u.role });
function auth(req,res,next){ if(!req.session.user) return res.status(401).json({error:'Please sign in first.'}); next(); }
function admin(req,res,next){ if(!req.session.user || req.session.user.role!=='admin') return res.status(403).json({error:'Admin access required.'}); next(); }
function cleanText(v,max=200){ return String(v ?? '').trim().slice(0,max); }
function validEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function money(v){ return Math.round((Number(v)+Number.EPSILON)*100)/100; }

app.get('/api/health',(req,res)=>res.json({ok:true,service:'MarketMate Supermarket'}));
app.get('/api/me',(req,res)=>res.json({user:req.session.user || null}));
app.post('/api/register', async (req,res)=>{
 const name=cleanText(req.body.name,100), email=cleanText(req.body.email,160).toLowerCase(), phone=cleanText(req.body.phone,30), password=String(req.body.password||'');
 if(name.length<2 || !validEmail(email) || password.length<8) return res.status(400).json({error:'Enter a name, valid email, and password with at least 8 characters.'});
 try {
  const hash=await bcrypt.hash(password,12);
  const r=db.prepare('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)').run(name,email,phone,hash,'customer');
  const u=db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  req.session.user=safeUser(u); res.json({user:req.session.user});
 } catch(e){ res.status(409).json({error:'An account with this email may already exist.'}); }
});
app.post('/api/login', async (req,res)=>{
 const email=cleanText(req.body.email,160).toLowerCase(), password=String(req.body.password||'');
 const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);
 if(!u || !(await bcrypt.compare(password,u.password_hash))) return res.status(401).json({error:'Email or password is incorrect.'});
 req.session.regenerate(err=>{ if(err) return res.status(500).json({error:'Could not start session.'}); req.session.user=safeUser(u); res.json({user:req.session.user}); });
});
app.post('/api/admin/pin-login',(req,res)=>{
 const pin=String(req.body.pin||'');
 if(pin.length!==4 || pin!==adminPin) return res.status(401).json({error:'Admin PIN is incorrect.'});
 const u=db.prepare('SELECT * FROM users WHERE role=? ORDER BY id LIMIT 1').get('admin');
 if(!u) return res.status(500).json({error:'Admin account is not configured.'});
 req.session.regenerate(err=>{ if(err) return res.status(500).json({error:'Could not start session.'}); req.session.user=safeUser(u); res.json({user:req.session.user}); });
});
app.post('/api/guest-login',(req,res)=>{
 const name=cleanText(req.body.name,100), phone=cleanText(req.body.phone,30);
 if(name.length<2 || phone.replace(/\D/g,'').length<6) return res.status(400).json({error:'Enter your name and a valid phone number.'});
 const email=`guest-${Date.now()}-${Math.random().toString(36).slice(2,8)}@marketmate.local`;
 const hash=bcrypt.hashSync(require('crypto').randomBytes(24).toString('hex'),10);
 const r=db.prepare('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)').run(name,email,phone,hash,'customer');
 const u=db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
 req.session.regenerate(err=>{ if(err) return res.status(500).json({error:'Could not start guest session.'}); req.session.user=safeUser(u); res.json({user:req.session.user,guest:true}); });
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/products',(req,res)=>{
 const {q='',category=''}=req.query;
 let sql='SELECT id,name,category,description,price,stock,unit,image FROM products WHERE active=1', args=[];
 if(q){sql+=' AND (name LIKE ? OR description LIKE ?)';args.push(`%${cleanText(q,80)}%`,`%${cleanText(q,80)}%`);}
 if(category && category!=='All'){sql+=' AND category=?';args.push(cleanText(category,80));}
 sql+=' ORDER BY category,name';
 res.json({products:db.prepare(sql).all(...args),categories:['All',...db.prepare('SELECT DISTINCT category FROM products WHERE active=1 ORDER BY category').all().map(x=>x.category)]});
});
app.get('/api/orders',auth,(req,res)=>{
 const rows=req.session.user.role==='admin'
  ? db.prepare(`SELECT o.*,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC`).all()
  : db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(req.session.user.id);
 const itemStmt=db.prepare('SELECT product_name,quantity,unit_price FROM order_items WHERE order_id=?');
 res.json({orders:rows.map(o=>({...o,items:itemStmt.all(o.id)}))});
});
app.post('/api/orders',auth,(req,res)=>{
 const {items,customerName,phone,address,fulfillment,paymentMethod,notes}=req.body;
 if(!Array.isArray(items)||!items.length||items.length>50) return res.status(400).json({error:'Your cart is empty or too large.'});
 if(cleanText(customerName,100).length<2 || cleanText(phone,30).length<6) return res.status(400).json({error:'Enter your name and a valid contact number.'});
 if(fulfillment==='delivery' && cleanText(address,300).length<8) return res.status(400).json({error:'Enter your full delivery address.'});
 if(!['delivery','pickup'].includes(fulfillment)||!['cod','online'].includes(paymentMethod)) return res.status(400).json({error:'Select a valid delivery and payment option.'});
 try {
  const create=db.transaction(()=>{
   let subtotal=0, normalized=[];
   for(const item of items){
    const id=Number(item.productId), qty=Number(item.quantity);
    if(!Number.isInteger(id)||!Number.isInteger(qty)||qty<1||qty>99) throw new Error('Invalid product or quantity.');
    const p=db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(id);
    if(!p) throw new Error('A product is no longer available.');
    if(p.stock<qty) throw new Error(`${p.name}: only ${p.stock} ${p.unit} available.`);
    subtotal+=p.price*qty; normalized.push({p,qty});
   }
   subtotal=money(subtotal); const deliveryFee=fulfillment==='delivery'?(subtotal>=499?0:35):0;
   const total=money(subtotal+deliveryFee);
   const code='MM-'+Date.now().toString().slice(-8)+'-'+Math.floor(Math.random()*90+10);
   const r=db.prepare(`INSERT INTO orders(order_code,user_id,customer_name,phone,address,fulfillment,payment_method,payment_status,status,subtotal,delivery_fee,total,notes)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(code,req.session.user.id,cleanText(customerName,100),cleanText(phone,30),cleanText(address,300),fulfillment,paymentMethod,'pending','pending',subtotal,deliveryFee,total,cleanText(notes,500));
   const itemIns=db.prepare('INSERT INTO order_items(order_id,product_id,product_name,quantity,unit_price,unit_cost) VALUES(?,?,?,?,?,?)');
   for(const {p,qty} of normalized){itemIns.run(r.lastInsertRowid,p.id,p.name,qty,p.price,p.cost_price);db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(qty,p.id);}
   return {id:r.lastInsertRowid,orderCode:code,total};
  });
  res.status(201).json({order:create()});
 } catch(e){res.status(400).json({error:e.message||'Could not create order.'});}
});
app.get('/api/admin/summary',admin,(req,res)=>{
 const sales=db.prepare(`SELECT COALESCE(SUM(total),0) total, COUNT(*) count FROM orders WHERE status!='cancelled' AND payment_status IN ('paid','pending')`).get();
 const today=db.prepare(`SELECT COALESCE(SUM(total),0) total, COUNT(*) count FROM orders WHERE date(created_at)=date('now','localtime') AND status!='cancelled'`).get();
 const inventory=db.prepare('SELECT COUNT(*) count, COALESCE(SUM(stock),0) units, SUM(CASE WHEN stock<=5 THEN 1 ELSE 0 END) low FROM products WHERE active=1').get();
 const costs=db.prepare(`SELECT COALESCE(SUM(oi.quantity*oi.unit_cost),0) cost FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status!='cancelled' AND o.payment_status IN ('paid','pending')`).get();
 const expenses=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM expenses').get().total;
 res.json({sales:{total:money(sales.total),count:sales.count},today:{total:money(today.total),count:today.count},inventory,profitEstimate:money(sales.total-costs.cost-expenses),expenses:money(expenses),pending:db.prepare("SELECT COUNT(*) n FROM orders WHERE status='pending'").get().n});
});
app.get('/api/admin/products',admin,(req,res)=>res.json({products:db.prepare('SELECT * FROM products ORDER BY category,name').all()}));
app.post('/api/admin/products',admin,(req,res)=>{
 const p=productInput(req.body); if(p.error)return res.status(400).json({error:p.error});
 const r=db.prepare('INSERT INTO products(name,category,description,price,cost_price,stock,unit,image,active) VALUES(?,?,?,?,?,?,?,?,1)').run(...p.values);
 res.status(201).json({product:db.prepare('SELECT * FROM products WHERE id=?').get(r.lastInsertRowid)});
});
app.put('/api/admin/products/:id',admin,(req,res)=>{
 const p=productInput(req.body); if(p.error)return res.status(400).json({error:p.error});
 const r=db.prepare('UPDATE products SET name=?,category=?,description=?,price=?,cost_price=?,stock=?,unit=?,image=? WHERE id=?').run(...p.values,Number(req.params.id));
 if(!r.changes)return res.status(404).json({error:'Product not found.'});
 res.json({product:db.prepare('SELECT * FROM products WHERE id=?').get(Number(req.params.id))});
});
function productInput(b){
 const name=cleanText(b.name,100),category=cleanText(b.category,80),description=cleanText(b.description,300),unit=cleanText(b.unit,30)||'each',image=cleanText(b.image,500);
 const price=Number(b.price),cost=Number(b.cost_price),stock=Number(b.stock);
 if(!name||!category||!Number.isFinite(price)||price<0||!Number.isFinite(cost)||cost<0||!Number.isInteger(stock)||stock<0)return {error:'Enter valid product details, prices, and whole-number stock.'};
 return {values:[name,category,description,price,cost,stock,unit,image]};
}
app.delete('/api/admin/products/:id',admin,(req,res)=>{
 const r=db.prepare('UPDATE products SET active=0 WHERE id=?').run(Number(req.params.id));
 if(!r.changes)return res.status(404).json({error:'Product not found.'});res.json({ok:true});
});
app.patch('/api/admin/orders/:id',admin,(req,res)=>{
 const status=cleanText(req.body.status,30), paymentStatus=cleanText(req.body.payment_status,30);
 if(!['pending','confirmed','packing','ready','out_for_delivery','completed','cancelled'].includes(status))return res.status(400).json({error:'Invalid order status.'});
 if(!['pending','paid','failed','refunded'].includes(paymentStatus))return res.status(400).json({error:'Invalid payment status.'});
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(Number(req.params.id));
 if(!order)return res.status(404).json({error:'Order not found.'});
 if(order.status==='cancelled' && status!=='cancelled')return res.status(400).json({error:'Cancelled orders cannot be reopened automatically.'});
 const tx=db.transaction(()=>{
  if(status==='cancelled' && order.status!=='cancelled'){
   for(const i of db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(order.id)){if(i.product_id)db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(i.quantity,i.product_id);}
  }
  db.prepare('UPDATE orders SET status=?,payment_status=? WHERE id=?').run(status,paymentStatus,order.id);
 });tx();res.json({ok:true});
});
app.get('/api/admin/expenses',admin,(req,res)=>res.json({expenses:db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC,id DESC').all()}));
app.post('/api/admin/expenses',admin,(req,res)=>{
 const title=cleanText(req.body.title,120),amount=Number(req.body.amount),date=cleanText(req.body.expense_date,10);
 if(!title||!Number.isFinite(amount)||amount<0)return res.status(400).json({error:'Enter an expense name and valid amount.'});
 const r=db.prepare('INSERT INTO expenses(title,amount,expense_date) VALUES(?,?,?)').run(title,amount,/^\d{4}-\d{2}-\d{2}$/.test(date)?date:new Date().toISOString().slice(0,10));
 res.status(201).json({expense:db.prepare('SELECT * FROM expenses WHERE id=?').get(r.lastInsertRowid)});
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`MarketMate Supermarket running at http://localhost:${PORT}`));
