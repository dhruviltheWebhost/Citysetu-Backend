import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import pg from 'pg'; // Import the new 'pg' library

// --- 1. INITIAL SETUP ---
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const appStartTime = Date.now();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// --- 2. DATABASE CONFIGURATION ---
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // REQUIRED for Neon
  },
});

// Test the database connection
pool
  .connect()
  .then(client => {
    console.log('✅ Database connected successfully (Neon)');
    client.release();
  })
  .catch(err => {
    console.error('⚠️ Database connection error:', err.message);
  });


// --- 3. MIDDLEWARE ---
const allowedOrigins = [
  'https://citysetu.github.io',
  'https://citysetu-admin.vercel.app',
  'https://dhruvilthewebhost.github.io',
  'http://127.0.0.1:5500',
  'http://localhost:5173'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy violation'), false);
    }
  },
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: "Content-Type, Authorization"
}));

app.use(express.json());

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.status(401).json({ message: 'Error: No token provided.' });
  if (token !== ADMIN_TOKEN) return res.status(403).json({ message: 'Error: Invalid token.' });
  next();
};

// --- 5. PUBLIC API ROUTES (For index.html) ---

// GET: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor((Date.now() - appStartTime) / 1000)
  });
});

// GET: All *available* workers
app.get('/api/workers', async (req, res) => {
  try {
    const query = "SELECT * FROM workers WHERE status = 'available'";
    const result = await pool.query(query);
    res.json({
      status: 'success',
      workers: result.rows
    });
  } catch (error) {
    console.error("Error fetching workers:", error.message);
    res.status(500).json({ status: 'error', message: "Error fetching worker data" });
  }
});

// POST: New Chat Booking (This is the one we updated)
app.post('/api/log/chat', async (req, res) => {
  try {
    const { customerName, customerPhone, service, preferredWorker } = req.body;
    
    const newBooking = {
      id: `CHAT-${nanoid(6).toUpperCase()}`,
      customerName,
      customerPhone,
      service,
      preferredWorker 
    };

    const query = `
      INSERT INTO chats (id, customerName, customerPhone, service, preferredWorker)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
        newBooking.id, 
        newBooking.customerName, 
        newBooking.customerPhone, 
        newBooking.service, 
        newBooking.preferredWorker
    ];
    
    const result = await pool.query(query, values);
    
    res.status(201).json({ status: 'success', message: 'Booking logged', data: result.rows[0] });
  } catch (error) {
    console.error("Error saving chat booking:", error.message);
    res.status(500).json({ message: "Error saving chat booking" });
  }
});

// POST: New Worker Signup
app.post('/api/workers/signup', async (req, res) => {
  try {
    const { name, phone, service, city, pincode, address } = req.body;
    const newSignup = {
      id: `SIGNUP-${nanoid(6).toUpperCase()}`,
      name, phone, service, city, pincode, address
    };

    const query = `
      INSERT INTO signups (id, name, phone, service, city, pincode, address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [newSignup.id, newSignup.name, newSignup.phone, newSignup.service, newSignup.city, newSignup.pincode, newSignup.address];
    const result = await pool.query(query, values);
    res.status(201).json({ status: 'success', message: 'Signup successful!', data: result.rows[0] });
  } catch (error) {
    console.error("Error saving signup:", error.message);
    res.status(500).json({ message: "Error saving signup" });
  }
});

// POST: New Call Log
app.post('/api/log/call', async (req, res) => {
  try {
    const { workerId, workerName, customerPhone } = req.body;
    const query = `
      INSERT INTO calls (workerId, workerName, customerPhone)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [workerId, workerName, customerPhone];
    const result = await pool.query(query, values);
    res.status(201).json({ status: 'success', message: 'Call logged', data: result.rows[0] });
  } catch (error) {
    console.error("Error saving call log:", error.message);
    res.status(500).json({ message: "Error saving call log" });
  }
});

// --- [NEW] ADMIN LOGIN ROUTE ---
app.post('/api/admin/login', (req, res) => {
  try {
    const { password } = req.body;

    // 1. Check for the ADMIN_PASSWORD from your .env file
    if (!process.env.ADMIN_PASSWORD) {
      console.error('CRITICAL: ADMIN_PASSWORD is not set in .env');
      return res.status(500).json({ message: 'Admin password not set on server' });
    }

    // 2. Check if the password is correct
    if (!password || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // 3. Send back the ADMIN_TOKEN
    res.json({ 
      status: 'success', 
      message: 'Login successful',
      token: ADMIN_TOKEN 
    });

  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({ message: "Server error during login" });
  }
});


// --- 6. ADMIN API ROUTES (For admin-dashboard.html) ---
app.get('/api/admin/data', authMiddleware, async (req, res) => {
  try {
    const [workers, chats, calls, signups] = await Promise.all([
      pool.query('SELECT * FROM workers ORDER BY timestamp DESC'),
      pool.query('SELECT * FROM chats ORDER BY timestamp DESC'),
      pool.query('SELECT * FROM calls ORDER BY timestamp DESC'),
      pool.query("SELECT * FROM signups WHERE status = 'Pending Review' ORDER BY timestamp DESC") // Only get pending
    ]);
    
    res.json({
      workers: workers.rows,
      chats: chats.rows,
      calls: calls.rows,
      signups: signups.rows
    });
  } catch (error) {
    console.error("Error fetching admin data:", error.message);
    res.status(500).json({ message: "Error fetching admin data" });
  }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const [workers, chats, calls, signups] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM workers"),
      pool.query("SELECT COUNT(*) FROM chats"),
      pool.query("SELECT COUNT(*) FROM calls"),
      pool.query("SELECT COUNT(*) FROM signups WHERE status = 'Pending Review'")
    ]);
    
    res.json({
      totalWorkers: parseInt(workers.rows[0].count, 10),
      totalChats: parseInt(chats.rows[0].count, 10),
      totalCalls: parseInt(calls.rows[0].count, 10),
      pendingSignups: parseInt(signups.rows[0].count, 10)
    });
  } catch (error) {
    console.error("Error fetching stats:", error.message);
    res.status(500).json({ message: "Error fetching stats" });
  }
});

app.post('/api/workers', authMiddleware, async (req, res) => {
  try {
    const { name, phone, service, city, pincode, status } = req.body;
    const newWorker = {
      id: `WORKER-${nanoid(5).toUpperCase()}`,
      name, phone, service, city, pincode, status
    };

    const query = `
      INSERT INTO workers (id, name, phone, service, city, pincode, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [newWorker.id, newWorker.name, newWorker.phone, newWorker.service, newWorker.city, newWorker.pincode, newWorker.status];
    const result = await pool.query(query, values);
    res.status(201).json({ status: "success", message: "Worker added successfully!", data: result.rows[0] });
  } catch (error) {
    console.error("Error adding worker:", error.message);
    if (error.code === '23505' && error.constraint === 'workers_phone_key') {
      return res.status(409).json({ message: "Error: A worker with this phone number already exists." });
    }
    res.status(500).json({ message: "Error adding worker" });
  }
});

app.put('/api/update-status/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, workerName } = req.body;

    const fields = [];
    const values = [];
    let argCount = 1;

    if (newStatus) {
      fields.push(`status = $${argCount++}`);
      values.push(newStatus);
    }
    if (workerName) {
      fields.push(`workerAssigned = $${argCount++}`);
      values.push(workerName);
    }

    if (fields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    values.push(id); 
    const query = `
      UPDATE chats
      SET ${fields.join(', ')}
      WHERE id = $${argCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.json({ status: "success", message: "Booking updated", data: result.rows[0] });
  } catch (error) {
    console.error("Error updating booking:", error.message);
    res.status(500).json({ message: "Error updating booking" });
  }
});

// --- [NEW] DELETE SIGNUP ROUTE ---
app.delete('/api/signups/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM signups WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Signup not found" });
    }
    
    res.json({ status: 'success', message: 'Signup deleted successfully' });
  
  } catch (error) {
    console.error("Error deleting signup:", error.message);
    res.status(500).json({ message: "Error deleting signup" }); 
  }
});

// --- [NEW] EDIT WORKER ROUTE ---
app.put('/api/workers/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    // Get all fields from the body
    const { name, phone, service, city, pincode, status } = req.body;

    const query = `
      UPDATE workers 
      SET name = $1, phone = $2, service = $3, city = $4, pincode = $5, status = $6
      WHERE id = $7
      RETURNING *
    `;
    const values = [name, phone, service, city, pincode, status, id];
    
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Worker not found" });
    }
    
    res.json({ status: "success", message: "Worker updated!", data: result.rows[0] });

  } catch (error) {
    console.error("Error updating worker:", error.message);
    res.status(500).json({ message: "Error updating worker" });
  }
});

// --- [NEW] DELETE WORKER ROUTE ---
app.delete('/api/workers/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM workers WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Worker not found" });
    }
    
    res.json({ status: 'success', message: 'Worker deleted successfully' });
  
  } catch (error) {
    console.error("Error deleting worker:", error.message);
    res.status(500).json({ message: "Error deleting worker" });
  }
});


// --- 7. GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: 'Something broke!', error: err.message });
});

// --- 8. START SERVER ---
app.listen(PORT, () => {
  console.log(`CitySetu Backend is live on port ${PORT}`);
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ WARNING: Missing DATABASE_URL. API will not connect to database.');
  }
  if (!ADMIN_TOKEN) {
    console.warn('⚠️ WARNING: Missing ADMIN_TOKEN. Admin routes will be locked.');
  }
  // --- [NEW] ADDED PASSWORD CHECK ---
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('⚠️ WARNING: Missing ADMIN_PASSWORD. Admin login will fail.');
  }
});
