import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import { Buffer } from 'buffer';

// --- 1. INITIAL SETUP ---
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const appStartTime = Date.now();

// --- 2. GITHUB API CONFIGURATION ---
// These are your environment variables from Render
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER;
const REPO_NAME = process.env.GITHUB_REPO_NAME;
const REPO_BRANCH = process.env.GITHUB_REPO_BRANCH || 'main';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/`;

// --- 3. MIDDLEWARE ---

// CORS Middleware: Allow your frontend(s) to make requests
const allowedOrigins = [
  'https://citysetu.github.io',
  'https://citysetu-admin.vercel.app',
  'https://dhruvilthewebhost.github.io',
  'http://127.0.0.1:5500', // For local testing
  'http://localhost:5173'  // For local React dev
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: "Content-Type, Authorization"
}));

// Body Parser Middleware: Allow server to read JSON from requests
app.use(express.json());

// Admin Authentication Middleware: Protects sensitive routes
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer YOUR_TOKEN"

  if (token == null) {
    return res.status(401).json({ message: 'Error: No token provided.' });
  }
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ message: 'Error: Invalid token.' });
  }
  next(); // Token is valid, proceed to the route
};

// --- 4. GITHUB API HELPER FUNCTIONS ---

/**
 * Reads a JSON file from your GitHub data repository.
 * @param {string} filePath - Path to file, e.g., "data/workers.json"
 */
const readFromGitHub = async (filePath) => {
  const url = `${GITHUB_API_URL}${filePath}?ref=${REPO_BRANCH}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3.raw' // Get raw content
      }
    });

    if (!response.ok) {
      // If file not found, return empty array (for POST routes)
      if (response.status === 404) {
        console.log(`File not found: ${filePath}. Returning empty array.`);
        return { sha: null, data: [] };
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // To update a file, we need its "SHA"
    // So we make a second call to get metadata
    const metaResponse = await fetch(`${GITHUB_API_URL}${filePath}?ref=${REPO_BRANCH}`, {
        headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    const meta = await metaResponse.json();

    return { sha: meta.sha, data: data };

  } catch (error) {
    console.error(`Error reading from GitHub (${filePath}):`, error.message);
    // If any error (e.g., repo not found), return empty
    return { sha: null, data: [] };
  }
};

/**
 * Writes data to a JSON file in your GitHub data repository.
 * @param {string} filePath - Path to file, e.g., "data/workers.json"
 * @param {object} data - The new JSON data to write.
 * @param {string} sha - The 'SHA' of the *old* file (required for updates).
 * @param {string} commitMessage - A commit message.
 */
const writeToGitHub = async (filePath, data, sha, commitMessage) => {
  const url = `${GITHUB_API_URL}${filePath}`;
  
  // Data must be in Base64
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

  const body = {
    message: commitMessage,
    content: content,
    branch: REPO_BRANCH,
    sha: sha // Include SHA if updating, omit if creating new
  };
  
  // If file didn't exist (sha is null), don't send sha
  if (!sha) delete body.sha;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${JSON.stringify(errorData)}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error writing to GitHub (${filePath}):`, error.message);
    throw error; // Re-throw to be caught by route handler
  }
};

// --- 5. PUBLIC API ROUTES (For index.html) ---

// GET: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor((Date.now() - appStartTime) / 1000) // Uptime in seconds
  });
});

// GET: All *available* workers for the public frontend
app.get('/api/workers', async (req, res) => {
  try {
    // 1. Read all workers from GitHub
    const { data: allWorkers } = await readFromGitHub('data/workers.json');

    // 2. Filter for only 'available' workers (as your frontend expects)
    const availableWorkers = allWorkers.filter(worker => worker.status === 'available');

    // 3. Send them in the format the frontend expects
    res.json({
      status: 'success',
      workers: availableWorkers 
    });

  } catch (error) {
    console.error("Error fetching workers:", error.message);
    res.status(500).json({ status: 'error', message: "Error fetching worker data", error: error.message });
  }
});

// GET: Public data (Workers & Services) - This is for other uses, like the admin panel
app.get('/api/public-data', async (req, res) => {
  try {
    // We only expose approved workers publicly
    const { data: allWorkers } = await readFromGitHub('data/workers.json');
    const { data: allServices } = await readFromGitHub('data/services.json'); // Assumes you have services.json

    // Group workers by service
    const groupedWorkers = {};
    allWorkers.forEach(worker => {
      if (worker.status === 'available') {
        const service = worker.service || 'Uncategorized';
        if (!groupedWorkers[service]) groupedWorkers[service] = [];
        groupedWorkers[service].push(worker);
      }
    });

    res.json({
      services: allServices,
      workers: groupedWorkers
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching public data", error: error.message });
  }
});

// POST: New Chat Booking (from /api/chats to /api/log/chat)
app.post('/api/log/chat', async (req, res) => {
  try {
    const { sha, data: chats } = await readFromGitHub('data/chats.json');
    const newBooking = {
      id: `CHAT-${nanoid(6).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      status: "Pending",
      workerAssigned: "",
      ...req.body
    };
    chats.push(newBooking);
    await writeToGitHub('data/chats.json', chats, sha, `New chat booking: ${newBooking.id}`);
    res.status(201).json({ status: 'success', message: 'Booking logged', data: newBooking });
  } catch (error) {
    res.status(500).json({ message: "Error saving chat booking", error: error.message });
  }
});

// POST: New Worker Signup (from /api/signups to /api/workers/signup)
app.post('/api/workers/signup', async (req, res) => {
  try {
    const { sha, data: signups } = await readFromGitHub('data/signups.json');
    const newSignup = {
      id: `SIGNUP-${nanoid(6).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      status: "Pending Review",
      ...req.body
    };
    signups.push(newSignup);
    await writeToGitHub('data/signups.json', signups, sha, `New worker signup: ${newSignup.name}`);
    res.status(201).json({ status: 'success', message: 'Signup successful!', data: newSignup });
  } catch (error) {
    res.status(500).json({ message: "Error saving signup", error: error.message });
  }
});

// POST: New Call Log (from /api/calls to /api/log/call)
app.post('/api/log/call', async (req, res) => {
    try {
    const { sha, data: calls } = await readFromGitHub('data/calls.json');
    const newCall = {
      timestamp: new Date().toISOString(),
      ...req.body
    };
    calls.push(newCall);
    await writeToGitHub('data/calls.json', calls, sha, `New call log: ${newCall.workerName}`);
    res.status(201).json({ status: 'success', message: 'Call logged', data: newCall });
  } catch (error)
 {
    res.status(500).json({ message: "Error saving call log", error: error.message });
  }
});


// --- 6. ADMIN API ROUTES (For admin-dashboard.html) ---

// GET: All data for Admin
app.get('/api/admin/data', authMiddleware, async (req, res) => {
  try {
    const { data: workers } = await readFromGitHub('data/workers.json');
    const { data: chats } = await readFromGitHub('data/chats.json');
    const { data: calls } = await readFromGitHub('data/calls.json');
    const { data: signups } = await readFromGitHub('data/signups.json');
    
    res.json({ workers, chats, calls, signups });
  } catch (error) {
    res.status(500).json({ message: "Error fetching admin data", error: error.message });
  }
});

// GET: Stats for Admin
app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const { data: workers } = await readFromGitHub('data/workers.json');
    const { data: chats } = await readFromGitHub('data/chats.json');
    const { data: calls } = await readFromGitHub('data/calls.json');
    const { data: signups } = await readFromGitHub('data/signups.json');
    
    res.json({
      totalWorkers: workers.length,
      totalChats: chats.length,
      totalCalls: calls.length,
      pendingSignups: signups.filter(s => s.status === 'Pending Review').length
    });
  } catch (error) {
    // *** THIS IS THE FIRST FIX ***
    res.status(500).json({ message: "Error fetching stats", error: error.message });
  }
});

// POST: Add a new Worker
app.post('/api/workers', authMiddleware, async (req, res) => {
  try {
    const { sha, data: workers } = await readFromGitHub('data/workers.json');
    const newWorker = {
      id: `WORKER-${nanoid(5).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      ...req.body
    };
    workers.push(newWorker);
    await writeToGitHub('data/workers.json', workers, sha, `Admin added worker: ${newWorker.name}`);
    res.status(201).json({ status: "success", message: "Worker added successfully!", data: newWorker });
  } catch (error) {
    res.status(500).json({ message: "Error adding worker", error: error.message });
  }
});

// PUT: Update a Chat Booking (Assign Worker/Status)
app.put('/api/update-status/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { newStatus, workerName } = req.body;
    
    const { sha, data: chats } = await readFromGitHub('data/chats.json');
    const chatIndex = chats.findIndex(c => c.id === id);

    if (chatIndex === -1) {
      // *** THIS IS THE SECOND FIX ***
      return res.status(404).json({ message: "Booking not found" });
    }
    
    // Update data
    if (newStatus) chats[chatIndex].status = newStatus;
    if (workerName) chats[chatIndex].workerAssigned = workerName;

    await writeToGitHub('data/chats.json', chats, sha, `Admin updated booking: ${id}`);
    res.json({ status: "success", message: "Booking updated", data: chats[chatIndex] });
  } catch (error) {
    res.status(500).json({ message: "Error updating booking", error: error.message });
  }
});

// We can add DELETE routes for signups/workers later

// --- 7. GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ message: 'Something broke!', error: err.message });
});

// --- 8. START SERVER ---
app.listen(PORT, () => {
  console.log(`CitySetu Backend is live on port ${PORT}`);
  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME || !ADMIN_TOKEN) {
    console.warn('⚠️ WARNING: Missing one or more critical .env variables (GITHUB_TOKEN, REPO_OWNER, REPO_NAME, ADMIN_TOKEN). API will not function correctly.');
  }
});
