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
// We now use 'pg.Pool' to connect to our PostgreSQL database
// Render provides the DATABASE_URL environment variable for us.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // If your app is in a different region than your DB, you might need SSL
  // ssl: { rejectUnauthorized: false } 
});

// Test the database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('⚠️ Database connection error:', err.stack);
  } else {
    console.log('✅ Database connected successfully at', res.rows[0].now);
  }
});


// --- 3. MIDDLEWARE ---

// CORS Middleware
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

// Body Parser Middleware
app.use(express.json());

// Admin Auth Middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.status(401).json({ message: 'Error: No token provided.' });
  if (token !== ADMIN_TOKEN) return res.status(403).json({ message: 'Error: Invalid token.' });
  next();
};

// --- 4. GITHUB HELPER FUNCTIONS ---
//
// We no longer need readFromGitHub() or writeToGitHub()!
// They are replaced with fast SQL queries.
//
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
    // 1. Run a SQL query to get available workers
    const query = "SELECT * FROM workers WHERE status = 'available'";
    const result = await pool.query(query);

    // 2. Send them in the format the frontend expects
    res.json({
      status: 'success',
      workers: result.rows // 'rows' contains the array of data
    });

  } catch (error) {
    console.error("Error fetching workers:", error.message);
    res.status(500).json({ status: 'error', message: "Error fetching worker data" });
  }
});

// GET: Public data (Not used in your current frontend, but good to have)
app.get('/api/public-data', async (req, res) => {
  try {
    const workersResult = await pool.query("SELECT * FROM workers WHERE status = 'available'");
    // You'll need to create a 'services' table if you want this
    // const servicesResult = await pool.query("SELECT * FROM services");

    const groupedWorkers = {};
    workersResult.rows.forEach(worker => {
      const service = worker.service || 'Uncategorized';
      if (!groupedWorkers[service]) groupedWorkers[service] = [];
      groupedWorkers[service].push(worker);
    });

    res.json({
      // services: servicesResult.rows,
      services: [], // Placeholder
      workers: groupedWorkers
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching public data", error: error.message });
  }
});

// POST: New Chat Booking
// POST: New Chat Booking
app.post('/api/log/chat', async (req, res) => {
  try {
    // 1. Get 'preferredWorker' from the request body
    const { customerName, customerPhone, service, preferredWorker } = req.body;
    
    const newBooking = {
      id: `CHAT-${nanoid(6).toUpperCase()}`,
      customerName,
      customerPhone,
      service,
      preferredWorker // 2. Add it to the new booking object
    };

    // 3. Update the SQL query to include the new column
    const query = `
      INSERT INTO chats (id, customerName, customerPhone, service, preferredWorker)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    // 4. Add the new value to the 'values' array
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

    // SQL query to INSERT data. We use $1, $2, $3 to prevent SQL injection.
    const query = `
      INSERT INTO chats (id, customerName, customerPhone, service)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [newBooking.id, newBooking.customerName, newBooking.customerPhone, newBooking.service];
    
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


// --- 6. ADMIN API ROUTES (For admin-dashboard.html) ---

// GET: All data for Admin
app.get('/api/admin/data', authMiddleware, async (req, res) => {
  try {
    // We run all queries in parallel for speed
    const [workers, chats, calls, signups] = await Promise.all([
      pool.query('SELECT * FROM workers ORDER BY timestamp DESC'),
      pool.query('SELECT * FROM chats ORDER BY timestamp DESC'),
      pool.query('SELECT * FROM calls ORDER BY timestamp DESC'),
      pool.query('SELECT * FROM signups ORDER BY timestamp DESC')
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

// GET: Stats for Admin
app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    // We can get counts directly from the database, which is very fast
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

// POST: Add a new Worker
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
    // Handle specific error for duplicate phone number
    if (error.code === '23505' && error.constraint === 'workers_phone_key') {
      return res.status(409).json({ message: "Error: A worker with this phone number already exists." });
    }
    res.status(500).json({ message: "Error adding worker" });
  }
});

// PUT: Update a Chat Booking (Assign Worker/Status)
app.put('/api/update-status/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, workerName } = req.body;

    // Build the query dynamically based on what's provided
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

    values.push(id); // Add the 'id' for the WHERE clause
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

// We can add DELETE routes later, e.g.:
// app.delete('/api/workers/:id', authMiddleware, async (req, res) => { ... })
// app.delete('/api/signups/:id', authMiddleware, async (req, res) => { ... })


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
});
