const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// ---------------------
// Folders and storage
// ---------------------
const UPLOAD_DIR = path.join(__dirname, '../frontend/assets/uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ts = Date.now();
        const safeName = file.originalname.replace(/[^a-z0-9.\-\_]/gi, '_');
        cb(null, `${ts}_${safeName}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }
});
// helpers for file type validation
function audioFilter(file) { return file.mimetype && file.mimetype.startsWith('audio/'); }
function imageFilter(file) { return file.mimetype && file.mimetype.startsWith('image/'); }

// Safe JSON read and write helpers
function safeReadJson(filePath, fallback = []) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (err) {
        console.warn(`Failed to parse ${filePath}: ${err.message}`);
        return fallback;
    }
}

function safeWriteJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`Failed to write JSON to ${filePath}: ${err.message}`);
        return false;
    }
}

// ---------------------
// Memories API
// ---------------------
const memoriesPath = path.join(__dirname, 'memories.json');

app.post('/add-memory', (req, res) => {
    const newMemory = req.body; // {id?, name, caption, details, imageUrl}
    const id = newMemory.id || Date.now().toString();
    const payload = Object.assign({}, newMemory, { id });
    let memories = [];
    if (fs.existsSync(memoriesPath)) {
        memories = safeReadJson(memoriesPath, []);
    }
    memories.push(payload);
    fs.writeFileSync(memoriesPath, JSON.stringify(memories, null, 2));
    res.send({ message: 'Memory added', count: memories.length, id });
});

app.get('/memories', requireMemoriesAuth, (req, res) => {
    let memories = [];
    if (fs.existsSync(memoriesPath)) {
            memories = safeReadJson(memoriesPath, []);
    }
    res.send(memories);
});

// Update a memory by id (partial update for caption/details/name)
app.put('/memories/:id', requireMemoriesAuth, (req, res) => {
    const id = String(req.params.id);
    if (!fs.existsSync(memoriesPath)) return res.status(404).send({ error: 'No memories store' });
    const raw = fs.readFileSync(memoriesPath, 'utf8');
    let memories = [];
        memories = safeReadJson(memoriesPath, []);
    const idx = memories.findIndex(m => String(m.id) === id);
    if (idx === -1) return res.status(404).send({ error: 'Memory not found' });
    const existing = memories[idx];
    const updated = Object.assign({}, existing, req.body);
    memories[idx] = updated;
    fs.writeFileSync(memoriesPath, JSON.stringify(memories, null, 2));
    res.send({ message: 'Memory updated', memory: updated });
});

// Delete memory by id
app.delete('/memories/:id', requireMemoriesAuth, (req, res) => {
    const id = String(req.params.id);
    if (!fs.existsSync(memoriesPath)) return res.status(404).send({ error: 'No memories store' });
    const raw = fs.readFileSync(memoriesPath, 'utf8');
    let memories = [];
        memories = safeReadJson(memoriesPath, []);
    const idx = memories.findIndex(m => String(m.id) === id);
    if (idx === -1) return res.status(404).send({ error: 'Memory not found' });
    const [removed] = memories.splice(idx, 1);
    fs.writeFileSync(memoriesPath, JSON.stringify(memories, null, 2));
    // try to remove file if it's a local upload
    try {
        if (removed.imageUrl) {
            const filename = path.basename(removed.imageUrl);
            const filePath = path.join(UPLOAD_DIR, filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.warn('Failed to delete memory file:', err);
    }
    res.send({ message: 'Memory deleted', removed });
});

// ---------------------
// Playlist API
// ---------------------
const songsPath = path.join(__dirname, 'songs.json');

app.get('/songs', (req, res) => {
    let songs = safeReadJson(songsPath, []);
    res.send(songs);
});

app.post('/upload-song', upload.single('file'), (req, res) => {
    const file = req.file;
    const title = req.body.title || (file && file.originalname) || 'Unknown';
    if (!file) return res.status(400).send({ error: 'No file uploaded or wrong file type' });

    let songs = safeReadJson(songsPath, []);
    const song = {
        title,
        filename: path.basename(file.filename),
        url: `/assets/uploads/${path.basename(file.filename)}`
    };
    songs.push(song);
    safeWriteJson(songsPath, songs);

    res.send({ message: 'Song uploaded', song });
});

// Delete a song by filename and remove file from uploads
app.delete('/songs/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    if (!filename) return res.status(400).send({ error: 'Missing filename' });
    let songs = safeReadJson(songsPath, []);
    const idx = songs.findIndex(s => s.filename === filename);
    if (idx === -1) return res.status(404).send({ error: 'Song not found' });
    const [song] = songs.splice(idx, 1);
    safeWriteJson(songsPath, songs);
    const filePath = path.join(UPLOAD_DIR, filename);
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
        console.error('Failed to delete file:', filePath, err);
    }
    res.send({ message: 'Song deleted', song });
});

// Simple dates store
const datesPath = path.join(__dirname, 'dates.json');
const sessionsPath = path.join(__dirname, 'sessions.json');
const passwordPath = path.join(__dirname, 'password.json');
app.get('/dates', (req, res) => {
    let data = safeReadJson(datesPath, {});
    res.send(data);
});
app.post('/dates', (req, res) => {
    const body = req.body || {};
    let existing = {};
    if (fs.existsSync(datesPath)) {
        try {
            const raw = fs.readFileSync(datesPath, 'utf8').trim();
            if (raw) existing = JSON.parse(raw);
        } catch (e) { existing = {}; }
    }
    const merged = Object.assign({}, existing, body);
    safeWriteJson(datesPath, merged);
    res.send({ message: 'Dates stored', dates: merged });
});

// Password check
app.post('/check-password', (req, res) => {
    const body = req.body || {};
    const candidate = String(body.password || '');
    let stored = { password: '' };
    if (fs.existsSync(passwordPath)) stored = safeReadJson(passwordPath, { password: '' });
    const ok = (candidate === stored.password);
    if (!ok) return res.send({ ok: false });
    // generate a token and save session
    const token = require('crypto').randomUUID();
    let sessions = safeReadJson(sessionsPath, []);
    const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
    sessions.push({ token, expires });
    safeWriteJson(sessionsPath, sessions);
    res.send({ ok: true, token });
});

function isValidMemoriesToken(req) {
    const header = req.headers.authorization || req.headers['x-mem-token'];
    if (!header) return false;
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    const sessions = safeReadJson(sessionsPath, []);
    const found = sessions.find(s => s.token === token && (!s.expires || s.expires > Date.now()));
    return !!found;
}

function requireMemoriesAuth(req, res, next) {
    if (isValidMemoriesToken(req)) return next();
    return res.status(401).send({ error: 'Unauthorized' });
}

// upload memory (image + metadata)
app.post('/upload-memory', requireMemoriesAuth, upload.single('file'), (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).send({ error: 'No file uploaded' });
    // ensure it's an image
    if (!imageFilter(file)) return res.status(400).send({ error: 'Only image files allowed' });

    const title = req.body.caption || req.body.title || file.originalname;
    const details = req.body.details || '';
    const name = req.body.name || 'Anonymous';

    let memories = [];
    if (fs.existsSync(memoriesPath)) {
        try {
            const raw = fs.readFileSync(memoriesPath, 'utf8').trim();
            if (raw) memories = JSON.parse(raw);
        } catch (err) { memories = []; }
    }
    // ensure unique id for memory
    const id = Date.now().toString();
    const mem = { id, name, caption: title, details, imageUrl: `/assets/uploads/${path.basename(file.filename)}` };
    memories.push(mem);
    fs.writeFileSync(memoriesPath, JSON.stringify(memories, null, 2));
    res.send({ message: 'Memory uploaded', mem });
});

// ---------------------
// Serve frontend
// ---------------------
const staticRoot = path.join(__dirname, '../frontend');
app.use(express.static(staticRoot));
app.use('/assets/uploads', express.static(UPLOAD_DIR));

// ---------------------
// Health check
// ---------------------
app.get('/ping', (req, res) => res.send({ uptime: process.uptime(), status: 'ok' }));

// ---------------------
// Start server
// ---------------------
// Start server with retry on EADDRINUSE
function startServer(port, attempt = 0) {
    const maxAttempts = 10;
    const server = app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
        console.log(`Serving static files from ${staticRoot}`);
    });
    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
            console.warn(`Port ${port} in use. Attempting to start on port ${port + 1} (attempt ${attempt + 1}/${maxAttempts})`);
            if (attempt + 1 < maxAttempts) {
                setTimeout(() => startServer(port + 1, attempt + 1), 500);
            } else {
                console.error('Unable to find an open port. Please free a port and retry (tried ports around configured port).');
                process.exit(1);
            }
        } else {
            console.error('Server failed:', err);
            process.exit(1);
        }
    });
    return server;
}

startServer(PORT);

// Global error handlers so the server process doesn't crash on unexpected JSON parse errors etc.
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
