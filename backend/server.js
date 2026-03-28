// INTENTIONALLY VULNERABLE — FOR CYBERSECURITY LAB USE ONLY

const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');
const app = express();
const path = require('path'); // Import path module
const port = process.env.PORT || 3000;

// Configure CORS to allow your Vercel frontend
const corsOptions = {
    origin: 'https://dumdum-roan.vercel.app',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Serve static files from the 'frontend' directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Vulnerability: Poor Logging Practices - Logs full request headers
app.use((req, res, next) => {
    console.log('Request Headers:', req.headers);
    next();
});

// --- Hardcoded Data (No Database) ---
const users = {
    '1': { id: '1', name: 'Alice', email: 'alice@example.com', password: 'password123' },
    '2': { id: '2', name: 'Bob', email: 'bob@example.com', password: 'password456' },
    '3': { id: '3', name: 'Charlie (Admin)', email: 'admin@example.com', password: 'supersecretpassword' }
};

let comments = [
    { username: 'Guest', text: 'This is the first comment.' },
    { username: 'AnotherGuest', text: "I can't believe it's not a real database!" }
];

// --- VULNERABLE ENDPOINTS ---

// Vulnerability: Stored Cross-Site Scripting (XSS)
app.get('/api/comments', (req, res) => {
    res.json(comments);
});

app.post('/api/comments', (req, res) => {
    const { username, text } = req.body;
    if (text) {
        comments.push({ username: username || 'Anonymous', text: text });
        res.status(201).json({ message: 'Comment added.' });
    } else {
        res.status(400).json({ error: 'Comment text cannot be empty.' });
    }
});

// Vulnerability: Command Injection
app.post('/api/ping', (req, res) => {
    const { host } = req.body;
    exec(`ping -c 3 ${host}`, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).send(`<pre>Error: ${error.message}</pre>`);
        }
        if (stderr) {
            return res.status(500).send(`<pre>Stderr: ${stderr}</pre>`);
        }
        res.send(`<pre>--- PING RESULTS ---\n${stdout}</pre>`);
    });
});

// Vulnerability: Insecure Direct Object Reference (IDOR)
app.get('/api/users/:id', (req, res) => {
    const user = users[req.params.id];
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// Vulnerability: Simulated SQL Injection (Authentication Bypass)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username.includes("'" ) || password.includes("'" )) {
        const simulatedSuccess = (username.includes(' OR ') || password.includes(' OR '));
        if (simulatedSuccess) {
            console.log(`[SECURITY EVENT] Potential SQLi simulation login bypass for user: ${username}`);
            res.json({ message: 'Login successful!', user: users['3'] });
            return;
        }
    }
    const user = Object.values(users).find(u => u.name === username && u.password === password);
    if (user) {
        res.json({ message: 'Login successful!', user });
    } else {
        res.status(401).json({ error: 'Invalid credentials.' });
    }
});

// --- SENSITIVE DATA ENDPOINTS ---

// Vulnerability: Unauthenticated sensitive data exposure (User list)
app.get('/api/users', (req, res) => {
    const fakeUsers = [
        { id: 'u1', name: 'John Doe', email: 'john.doe@example.com', role: 'user', password_hash: '$2a$10$abcdefghijklmnopqrstuvw.xyz0123456789' },
        { id: 'u2', name: 'Jane Smith', email: 'jane.smith@example.com', role: 'admin', password_hash: '$2a$10$abcdefghijklmnopqrstuvw.xyz0123456789' },
        { id: 'u3', name: 'Peter Jones', email: 'peter.jones@example.com', role: 'moderator', password_hash: '$2a$10$abcdefghijklmnopqrstuvw.xyz0123456789' },
        { id: 'u4', name: 'Mary Green', email: 'mary.green@example.com', role: 'user', password_hash: '$2a$10$abcdefghijklmnopqrstuvw.xyz0123456789' },
        { id: 'u5', name: 'Robert Blue', email: 'robert.blue@example.com', role: 'guest', password_hash: '$2a$10$abcdefghijklmnopqrstuvw.xyz0123456789' }
    ];
    res.json(fakeUsers);
});

// Vulnerability: Unauthenticated sensitive data exposure (Admin credentials/config)
app.get('/api/admin', (req, res) => {
    const adminInfo = {
        admin_email: 'admin@fakedemo.internal',
        internal_token: 'eyFAKETOKENabc123xyz',
        api_key: 'sk-FAKE-1234567890abcdef',
        debug_mode: true,
        server_version: 'Express 4.x on Node 18'
    };
    res.json(adminInfo);
});

// Vulnerability: Unauthenticated sensitive data exposure (Database/System config)
app.get('/api/config', (req, res) => {
    const configInfo = {
        database_password: 'FAKE_DB_PASS_9876',
        jwt_secret: 'FAKE_JWT_SECRET_DO_NOT_USE',
        environment: 'production',
        s3_bucket: 'fake-company-backups',
        smtp_password: 'FAKE_SMTP_PASS'
    };
    res.json(configInfo);
});

// Vulnerability: Unauthenticated sensitive data exposure (Internal network info)
app.get('/api/internal', (req, res) => {
    const internalInfo = {
        server_uptime: '14 days',
        internal_ip: '192.168.1.100',
        deploy_key: 'FAKE_DEPLOY_KEY_XYZ',
        employee_count: 42,
        active_sessions: 7
    };
    res.json(internalInfo);
});

// Vulnerability: Reflected injection surface (XSS/injection)
app.get('/api/search', (req, res) => {
    const query = req.query.q;
    res.json({ query: query, results: [] });
});

// --- Server Start ---
app.listen(port, () => {
    console.log(`Vulnerable app listening at http://localhost:${port}`);
});
