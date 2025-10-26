import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { Buffer } from 'buffer';
import { customAlphabet } from 'nanoid';

// --- 1. INITIAL SETUP ---
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const startTime = Date.now();

// --- 2. ENVIRONMENT & GITHUB CONFIG ---
// These are your secret keys from Render's .env settings
const {
  ADMIN_TOKEN,
  GITHUB_TOKEN,
  GITHUB_REPO_OWNER, // e.g., "DhruvilBarot"
  GITHUB_REPO_NAME,  // e.g., "citysetu-data-repo"
  GITHUB_REPO_BRANCH // e.g., "main"
} = process.env;

// GitHub API URLs
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents`;
const GITHUB_HEADERS = {
  Authorization: `token ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json',
};

// --- 3. CORS CONFIGURATION ---
// URLs that are allowed to access your API
const allowedOrigins = [
  'https://citysetu-admin.vercel.app',
  'https://citysetu.github.io',
  'http://127.0.0.1:5500', // For local testing
  'http://localhost:3000'  // For local React dev
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: "Content-Type, Authorization"
}));

// Handle pre-flight OPTIONS requests
app.options('*', cors());
app.use(express.json()); // Allow server to read JSON from requests

// --- 4. GITHUB API HELPER FUNCTIONS ---

/**
 * Reads a JSON file from your GitHub repository.
 * @param {string} filePath - Path in the repo (e.g., "data/workers.json")
 * @returns {Promise<{data: Array<any>, sha: string|null}>}
 */
const getFileFromRepo = async (filePath) => {
  try {
    const url = `${GITHUB_API_URL}/${filePath}?ref=${GITHUB_REPO_BRANCH}`;
    const response = await axios.get(url, { headers: GITHUB_HEADERS });
    const content = Buffer.from(response.data.content, 'base64').toString('utf8');
    return { data: JSON.parse(content), sha: response.data.sha };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      // File doesn't exist, return empty state
      return { data: [], sha: null };
    }
    // Other error
    throw error;
  }
};

/**
 * Creates or updates a JSON file in your GitHub repository.
 * @param {string} filePath - Path in the repo (e.g., "data/workers.json")
 * @param {Array<any>} newData - The new array to save.
 * @param {string|null} sha - The 'sha' of the file you are updating.
 */
const updateFileInRepo = async (filePath, newData, sha) => {
  const content = Buffer.from(JSON.stringify(newData, null, 2)).toString('base64');
  const url = `${GITHUB_API_URL}/${filePath}`;
  
  const payload = {
    message: `[CitySetu API] Updated ${filePath} at ${new Date().toISOString()}`,
    content: content,
    branch: GITHUB_REPO_BRANCH,
    sha: sha // If sha is null, GitHub API creates a new file
  };

  await axios.put(url, payload, { headers: GITHUB_HEADERS });
};

// --- 5. SECURITY MIDDLEWARE ---

/**
 * Checks if the request has the valid ADMIN_TOKEN.
 */
const protect = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // "Bearer <TOKEN>"
    if (!token || token !== ADMIN_TOKEN) {
      return res.status(401).json({ message: 'Error: Unauthorized. Invalid admin token.' });
    }
    next();
  } catch (error) {
    res.status(401).json({ message: 'Error: Unauthorized.' });
  }
};

// --- 6. ID & TIMESTAMP GENERATOR ---
const generateId = (prefix) => {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nanoid = customAlphabet(alphabet, 6);
  return `${prefix.toUpperCase()}-${nanoid()}`; // e.g., CHAT-B245A1
};
const addTimestamp = (data) => {
  return { ...data, timestamp: new Date().toISOString() };
};

// --- 7. PUBLIC API ROUTES (No auth needed) ---

// Health check route
app.get('/api/health', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  res.json({ status: "ok", uptime_seconds: uptime });
});

// GET all public data (Workers, Services, etc.)
app.get('/api/workers', async (req, res) => {
  try {
    const { data } = await getFileFromRepo('data/workers.json');
    // Group workers by service for the index page
    const groupedWorkers = {};
    data.forEach(worker => {
      const service = worker.service || 'Uncategorized';
      if (!groupedWorkers[service]) groupedWorkers[service] = [];
      groupedWorkers[service].push(worker);
    });
    res.json(groupedWorkers);
  } catch (error) {
    res.status(500).json({ message: "Error fetching workers", error: error.message });
  }
});

// POST a new Chat Booking
app.post('/api/chats', async (req, res) => {
  try {
    const { data, sha } = await getFileFromRepo('data/chats.json');
    const newBooking = { 
      id: generateId('CHAT'), 
      ...addTimestamp(req.body),
      status: "Pending",
      workerAssigned: ""
    };
    data.push(newBooking);
    await updateFileInRepo('data/chats.json', data, sha);
    res.status(201).json(newBooking);
  } catch (error) {
    res.status(500).json({ message: "Error creating booking", error: error.message });
  }
});

// POST a new Call Log
app.post('/api/calls', async (req, res) => {
  try {
    const { data, sha } = await getFileFromRepo('data/calls.json');
    const newCall = addTimestamp(req.body); // Just add timestamp
    data.push(newCall);
    await updateFileInRepo('data/calls.json', data, sha);
    res.status(201).json(newCall);
  } catch (error) {
    res.status(500).json({ message: "Error logging call", error: error.message });
  }
});

// POST a new Worker Signup
app.post('/api/signups', async (req, res) => {
  try {
    const { data, sha } = await getFileFromRepo('data/signups.json');
    const newSignup = { 
      id: generateId('SIGNUP'), 
      ...addTimestamp(req.body),
      status: "Pending Review"
    };
    data.push(newSignup);
    await updateFileInRepo('data/signups.json', data, sha);
    res.status(201).json(newSignup);
  } catch (error) {
    res.status(500).json({ message: "Error creating signup", error: error.message });
  }
});


// --- 8. ADMIN API ROUTES (Auth required) ---

// GET all data for the dashboard
app.get('/api/admin/data', protect, async (req, res) => {
  try {
    const chats = (await getFileFromRepo('data/chats.json')).data;
    const calls = (await getFileFromRepo('data/calls.json')).data;
    const workers = (await getFileFromRepo('data/workers.json')).data;
    const signups = (await getFileFromRepo('data/signups.json')).data;
    res.json({ chats, calls, workers, signups });
  } catch (error) {
     res.status(500).json({ message: "Error fetching admin data", error: error.message });
  }
});

// GET stats for the dashboard
app.get('/api/stats', protect, async (req, res) => {
  try {
    const chats = (await getFileFromRepo('data/chats.json')).data.length;
    const calls = (await getFileFromRepo('data/calls.json')).data.length;
    const workers = (await getFileFromRepo('data/workers.json')).data.length;
    const signups = (await getFileFromRepo('data/signups.json')).data.length;
    res.json({ chats, calls, workers, signups });
  } catch (error) {
     res.status(500).json({ message: "Error fetching stats", error: error.message });
  }
});

// POST a new Worker
app.post('/api/workers', protect, async (req, res) => {
  try {
    const { data, sha } = await getFileFromRepo('data/workers.json');
    const newWorker = { 
      id: generateId('WORKER'), 
      ...addTimestamp(req.body)
    };
    data.push(newWorker);
    await updateFileInRepo('data/workers.json', data, sha);
    res.status(201).json(newWorker);
  } catch (error) {
    res.status(500).json({ message: "Error adding worker", error: error.message });
  }
});

// PUT (Update) a Booking's Status/Worker
app.put('/api/update-status/:id', protect, async (req, res) => {
  const { id } = req.params;
  const { status, workerAssigned } = req.body;
  
  // This route can update EITHER a chat or a signup
  let filePath;
  if (id.startsWith('CHAT-')) filePath = 'data/chats.json';
  else if (id.startsWith('SIGNUP-')) filePath = 'data/signups.json';
  else return res.status(400).json({ message: "Invalid ID prefix" });

  try {
    const { data, sha } = await getFileFromRepo(filePath);
    const itemIndex = data.findIndex(item => item.id === id);

    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Update fields
    if (status) data[itemIndex].status = status;
    if (workerAssigned) data[itemIndex].workerAssigned = workerAssigned;

    await updateFileInRepo(filePath, data, sha);
    res.json(data[itemIndex]);
  } catch (error) {
    res.status(500).json({ message: "Error updating status", error: error.message });
  }
});

// GET (Bonus) Backup route
app.get('/api/backup', protect, async (req, res) => {
   try {
    const { data: chatsData } = await getFileFromRepo('data/chats.json');
    const backupPath = `backup/chats-${new Date().toISOString().split('T')[0]}.json`;
    // Pass null for SHA to create a new file
    await updateFileInRepo(backupPath, chatsData, null); 
    res.json({ message: `Backup created at ${backupPath}` });
  } catch (error) {
     res.status(500).json({ message: "Error creating backup", error: error.message });
  }
});


// --- 9. START SERVER ---
app.listen(PORT, () => {
  console.log(`CitySetu API listening on port ${PORT}`);
  console.log('Repo Owner:', GITHUB_REPO_OWNER);
  console.log('Repo Name:', GITHUB_REPO_NAME);
});
