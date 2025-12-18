import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ================================
// 1. INITIAL SETUP
// ================================
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// ================================
// 2. DATABASE (Neon PostgreSQL)
// ================================
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(client => {
    console.log('✅ Database connected successfully (Neon)');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
  });

// ================================
// 3. MIDDLEWARE
// ================================
app.use(cors());
app.use(express.json());

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  if (token !== ADMIN_TOKEN) return res.status(403).json({ message: 'Invalid token' });
  next();
};

// ================================
// 4. BASIC ROUTES
// ================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ================================
// 5. SERVICES
// ================================
app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, category FROM services WHERE active = true ORDER BY id"
    );
    res.json({ services: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch services' });
  }
});

// ================================
// 6. PROFESSIONAL SIGNUP
// ================================
app.post('/api/professionals/signup', async (req, res) => {
  try {
    const { name, phone, serviceIds } = req.body;

    if (!name || !phone || !serviceIds?.length) {
      return res.status(400).json({ message: 'Missing fields' });
    }

    const professionalId = uuidv4();

    await pool.query(
      "INSERT INTO professionals (id, name, phone) VALUES ($1,$2,$3)",
      [professionalId, name, phone]
    );

    for (const serviceId of serviceIds) {
      await pool.query(
        "INSERT INTO professional_services (professional_id, service_id) VALUES ($1,$2)",
        [professionalId, serviceId]
      );
    }

    res.status(201).json({
      message: 'Signup successful. Waiting for admin approval.'
    });

  } catch (err) {
    res.status(500).json({ message: 'Signup failed' });
  }
});

// ================================
// 7. ADMIN – APPROVE PROFESSIONAL
// ================================
app.put('/api/admin/approve/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE professionals SET approved = true WHERE id = $1 RETURNING *",
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    res.json({ professional: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Approval failed' });
  }
});

// ================================
// 8. LIST APPROVED PROFESSIONALS BY SERVICE
// ================================
app.get('/api/professionals/:serviceId', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT p.id, p.name
      FROM professionals p
      JOIN professional_services ps ON p.id = ps.professional_id
      WHERE ps.service_id = $1 AND p.approved = true
      `,
      [req.params.serviceId]
    );

    res.json({ professionals: result.rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch professionals' });
  }
});

// ================================
// 9. CREATE LEAD (Customer Request)
// ================================
app.post('/api/leads', async (req, res) => {
  try {
    const {
      service_id,
      professional_id,
      customer_name,
      customer_phone,
      requirement
    } = req.body;

    const leadId = uuidv4();
    const assignedByPlatform = !professional_id;

    await pool.query(
      `
      INSERT INTO leads
      (id, service_id, professional_id, customer_name, customer_phone, requirement, assigned_by_platform)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        leadId,
        service_id,
        professional_id || null,
        customer_name,
        customer_phone,
        requirement,
        assignedByPlatform
      ]
    );

    res.status(201).json({ message: 'Lead created successfully' });

  } catch (err) {
    res.status(500).json({ message: 'Lead creation failed' });
  }
});

// ================================
// 10. PLATFORM CHAT (LOG ONLY)
// ================================
app.post('/api/chat', async (req, res) => {
  try {
    const { lead_id, sender, message } = req.body;

    await pool.query(
      `
      INSERT INTO chats (id, lead_id, sender, message)
      VALUES ($1,$2,$3,$4)
      `,
      [uuidv4(), lead_id, sender, message]
    );

    res.json({ message: 'Message saved' });
  } catch (err) {
    res.status(500).json({ message: 'Chat failed' });
  }
});

// ================================
// 11. START SERVER
// ================================
app.listen(PORT, () => {
  console.log(`🚀 CitySetu backend running on port ${PORT}`);
});
