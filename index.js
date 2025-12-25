import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

/* ================================
   DATABASE (Neon PostgreSQL)
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
    console.error('❌ DB connection error:', err.message);
  });

/* ================================
   MIDDLEWARE
================================ */
app.use(cors());
app.use(express.json());

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  if (token !== ADMIN_TOKEN)
    return res.status(403).json({ message: 'Invalid token' });
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
    const result = await pool.query(
      `SELECT id, name, category FROM services WHERE active = true ORDER BY name`
    );
    res.json({ services: result.rows });
  } catch (err) {
    console.error('❌ SERVICES ERROR:', err.message);
    res.status(500).json({ message: 'Failed to fetch services' });
  }
});

/* ================================
   PROFESSIONAL SIGNUP (FIXED)
================================ */
app.post('/api/professionals/signup', async (req, res) => {
  try {
    const { name, phone, serviceIds } = req.body;

    if (!name || !phone || !Array.isArray(serviceIds) || !serviceIds.length) {
      return res.status(400).json({ message: 'Missing fields' });
    }

    // ✅ Let PostgreSQL generate UUID
    const insertProfessional = await pool.query(
      `INSERT INTO professionals (name, phone, approved)
       VALUES ($1, $2, false)
       RETURNING id`,
      [name, phone]
    );

    const professionalId = insertProfessional.rows[0].id;

    for (const serviceId of serviceIds) {
      await pool.query(
        `INSERT INTO professional_services (professional_id, service_id)
         VALUES ($1, $2)`,
        [professionalId, serviceId]
      );
    }

    res.status(201).json({
      message: 'Signup successful. Waiting for admin approval.'
    });

  } catch (err) {
    console.error('❌ SIGNUP ERROR:', err.message);
    res.status(500).json({ message: 'Signup failed' });
  }
});

/* ================================
   GET ALL APPROVED PROFESSIONALS
================================ */
app.get('/api/professionals/all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.phone,
        p.approved,
        json_agg(
          json_build_object(
            'id', s.id,
            'name', s.name
          )
        ) AS services
      FROM professionals p
      JOIN professional_services ps ON ps.professional_id = p.id
      JOIN services s ON s.id = ps.service_id
      WHERE p.approved = true
      GROUP BY p.id
      ORDER BY p.name
    `);

    res.json({ professionals: result.rows });

  } catch (err) {
    console.error('❌ FETCH ALL ERROR:', err.message);
    res.status(500).json({ message: 'Failed to fetch professionals' });
  }
});

/* ================================
   PROFESSIONALS BY SERVICE
================================ */
app.get('/api/professionals/:serviceId', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT p.id, p.name, p.phone
      FROM professionals p
      JOIN professional_services ps ON ps.professional_id = p.id
      WHERE ps.service_id = $1 AND p.approved = true
      `,
      [req.params.serviceId]
    );

    res.json({ professionals: result.rows });
  } catch (err) {
    console.error('❌ BY SERVICE ERROR:', err.message);
    res.status(500).json({ message: 'Failed to fetch professionals' });
  }
});

/* ================================
   ADMIN DASHBOARD STATS
================================ */
app.get('/api/admin/data', authMiddleware, async (req, res) => {
  try {
    const [leads, approved, pending] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM leads'),
      pool.query('SELECT COUNT(*) FROM professionals WHERE approved = true'),
      pool.query('SELECT COUNT(*) FROM professionals WHERE approved = false')
    ]);

    res.json({
      stats: {
        totalLeads: Number(leads.rows[0].count),
        approvedProfessionals: Number(approved.rows[0].count),
        pendingSignups: Number(pending.rows[0].count)
      }
    });
  } catch (err) {
    console.error('❌ ADMIN DATA ERROR:', err.message);
    res.status(500).json({ message: 'Admin data failed' });
  }
});

/* ================================
   ADMIN APPROVE
================================ */
app.put('/api/admin/approve/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE professionals SET approved = true WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Professional not found' });
    }

    res.json({ professional: result.rows[0] });
  } catch (err) {
    console.error('❌ APPROVAL ERROR:', err.message);
    res.status(500).json({ message: 'Approval failed' });
  }
});

/* ================================
   CREATE LEAD
================================ */
app.post('/api/leads', async (req, res) => {
  try {
    const {
      service_id,
      professional_id,
      customer_name,
      customer_phone,
      requirement
    } = req.body;

    await pool.query(
      `
      INSERT INTO leads
      (service_id, professional_id, customer_name, customer_phone, requirement, assigned_by_platform)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [
        service_id,
        professional_id || null,
        customer_name,
        customer_phone,
        requirement,
        !professional_id
      ]
    );

    res.status(201).json({ message: 'Lead created successfully' });
  } catch (err) {
    console.error('❌ LEAD ERROR:', err.message);
    res.status(500).json({ message: 'Lead creation failed' });
  }
});

/* ================================
   CHAT
================================ */
app.post('/api/chat', async (req, res) => {
  try {
    const { lead_id, sender, message } = req.body;

    await pool.query(
      `INSERT INTO chats (lead_id, sender, message)
       VALUES ($1,$2,$3)`,
      [lead_id, sender, message]
    );

    res.json({ message: 'Message saved' });
  } catch (err) {
    console.error('❌ CHAT ERROR:', err.message);
    res.status(500).json({ message: 'Chat failed' });
  }
});

/* ================================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 CitySetu backend running on port ${PORT}`);
});
