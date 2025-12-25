import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { randomUUID } from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/* ================================
   DATABASE
================================ */
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(client => {
    console.log('✅ Database connected (Neon)');
    client.release();
  })
  .catch(err => {
    console.error('❌ DB error:', err.message);
  });

/* ================================
   MIDDLEWARE
================================ */
app.use(cors());
app.use(express.json());

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });
  if (token !== ADMIN_TOKEN) return res.status(403).json({ message: 'Invalid token' });
  next();
};

/* ================================
   HEALTH
================================ */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

/* ================================
   SERVICES
================================ */
app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, category
      FROM services
      WHERE active = true
      ORDER BY category, name
    `);
    res.json({ services: result.rows });
  } catch (err) {
    console.error('❌ SERVICES:', err.message);
    res.status(500).json({ message: 'Service fetch failed' });
  }
});

/* ================================
   PROFESSIONAL SIGNUP ✅ FIXED
================================ */
app.post('/api/professionals/signup', async (req, res) => {
  try {
    const { name, phone, serviceIds } = req.body;

    if (!name || !phone || !Array.isArray(serviceIds) || !serviceIds.length) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    const professionalId = randomUUID(); // ✅ UUID

    await pool.query(
      `INSERT INTO professionals (id, name, phone, approved)
       VALUES ($1,$2,$3,false)`,
      [professionalId, name, phone]
    );

    for (const serviceId of serviceIds) {
      await pool.query(
        `INSERT INTO professional_services (professional_id, service_id)
         VALUES ($1,$2)`,
        [professionalId, Number(serviceId)]
      );
    }

    res.status(201).json({
      message: 'Signup successful. Waiting for approval.'
    });

  } catch (err) {
    console.error('❌ SIGNUP ERROR:', err.message);
    res.status(500).json({ message: 'Signup failed' });
  }
});

/* ================================
   FETCH APPROVED PROFESSIONALS
================================ */
app.get('/api/professionals/all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.phone,
        p.approved,
        s.name AS service
      FROM professionals p
      JOIN professional_services ps ON ps.professional_id = p.id
      JOIN services s ON s.id = ps.service_id
      WHERE p.approved = true
      ORDER BY s.name, p.name
    `);

    res.json({ professionals: result.rows });
  } catch (err) {
    console.error('❌ FETCH ALL:', err.message);
    res.status(500).json({ message: 'Fetch failed' });
  }
});
   /* ================================
   ADMIN – PENDING APPROVALS
================================ */
app.get('/api/admin/pending', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.phone,
        s.name AS service
      FROM professionals p
      JOIN professional_services ps ON ps.professional_id = p.id
      JOIN services s ON s.id = ps.service_id
      WHERE p.approved = false
      ORDER BY p.created_at DESC
    `);

    res.json({ pending: result.rows });
  } catch (err) {
    console.error('❌ PENDING FETCH ERROR:', err.message);
    res.status(500).json({ message: 'Failed to load pending approvals' });
  }
});
/* ================================
   ADMIN – GET PENDING APPROVALS
================================ */
app.get('/api/admin/pending', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.name,
        p.phone,
        s.name AS service
      FROM professionals p
      JOIN professional_services ps ON ps.professional_id = p.id
      JOIN services s ON s.id = ps.service_id
      WHERE p.approved = false
      ORDER BY p.created_at DESC
    `);

    res.json({ pending: result.rows });

  } catch (err) {
    console.error('❌ PENDING FETCH ERROR:', err.message);
    res.status(500).json({ message: 'Failed to fetch pending approvals' });
  }
});


/* ================================
   ADMIN APPROVE
================================ */
app.put('/api/admin/approve/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE professionals SET approved = true
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Not found' });
    }

    res.json({ professional: result.rows[0] });
  } catch (err) {
    console.error('❌ APPROVE:', err.message);
    res.status(500).json({ message: 'Approval failed' });
  }
});

/* ================================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 CitySetu backend running on port ${PORT}`);
});
