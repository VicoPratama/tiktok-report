require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  PORT = 3000,
  DASHBOARD_PASSWORD
} = process.env;

const ACCOUNTS_TO_TRACK = ['@summer.on.repeat1', '@somewhere.coastal'];

/* ---------- Database Storage (JSON File) ---------- */
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'report.json');

fs.mkdirSync(DB_DIR, { recursive: true });

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (e) {}
  }
  return { accounts: [], posts: [] };
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/* ---------- Web Server ---------- */
const app = express();
app.use(express.json());

// Optional Basic Auth password gate
if (DASHBOARD_PASSWORD && DASHBOARD_PASSWORD !== 'change-me') {
  app.use((req, res, next) => {
    const [scheme, b64] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Basic' && b64) {
      const pass = Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':');
      const a = Buffer.from(pass);
      const b = Buffer.from(DASHBOARD_PASSWORD);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="TikTok Report"').status(401).send('Authentication required');
  });
}

/* ---------- API Endpoints ---------- */
app.get('/api/accounts', (req, res) => {
  const dbData = loadDb();
  res.json(dbData.accounts || []);
});

const getRows = () => {
  const dbData = loadDb();
  return (dbData.posts || []).map(r => ({
    id: 'post_' + r.post_id,
    postId: r.post_id,
    date: r.date,
    page: r.page,
    song: r.song_manual || r.song_auto || "Surfin'",
    views: r.views || 0,
    shares: r.shares || 0,
    saves: r.saves || 0,
    tiktokUrl: r.tiktok_url
  })).sort((a, b) => b.date.localeCompare(a.date));
};

app.get('/api/posts', (req, res) => res.json(getRows()));
app.get('/api/performance', (req, res) => res.json(getRows()));

app.post('/api/refresh', async (req, res) => {
  const dbData = loadDb();
  const now = Math.floor(Date.now() / 1000);
  if (dbData.accounts) {
    dbData.accounts.forEach(a => {
      a.last_synced_at = now;
      a.connected = true;
    });
    saveDb(dbData);
  }
  res.json({ accounts: dbData.accounts, posts: getRows(), at: new Date() });
});

// Manual song tagging endpoint
app.put('/api/posts/:postId/song', (req, res) => {
  const song = String(req.body.song || '').trim() || null;
  const dbData = loadDb();
  const post = dbData.posts.find(p => p.post_id === req.params.postId);
  if (post) {
    post.song_manual = song;
    saveDb(dbData);
    return res.json({ ok: true });
  }
  res.status(404).json({ ok: false, message: 'Post not found' });
});

// Serve frontend HTML directly
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'TikTok Report.html');
  res.sendFile(htmlPath);
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`\n🚀 TikTok Report Dashboard running on http://localhost:${PORT}`);
  console.log(`   Connected accounts: ${ACCOUNTS_TO_TRACK.join(', ')}\n`);
});
