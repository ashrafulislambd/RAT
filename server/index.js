const WebSocket = require('ws');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 8080;
const WEB_PORT = process.env.WEB_PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Hash the admin password
const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// Express app setup
const app = express();
const server = http.createServer(app);

// Session middleware
app.use(session({
  secret: 'ultrarat-secret-key-' + Math.random().toString(36).slice(2),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(express.json());

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// API routes
app.post('/api/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (bcrypt.compareSync(password, passwordHash)) {
    req.session.authenticated = true;
    return res.json({ success: true });
  } else {
    return res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

app.get('/api/clients', requireAuth, (req, res) => {
  const clientList = Array.from(clients.entries()).map(([id, ws]) => ({
    id,
    status: ws.readyState === WebSocket.OPEN ? 'online' : 'offline',
    connectedAt: clientData.get(id)?.connectedAt || null,
    lastActivity: clientData.get(id)?.lastActivity || null,
    ip: clientData.get(id)?.ip || null
  }));
  res.json({ clients: clientList, count: clientList.length });
});

// Serve dashboard (public route, dashboard checks auth via JS)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serve terminal
app.get('/terminal/:clientId', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terminal.html'));
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Create WebSocket server attached to HTTP server
const wss = new WebSocket.Server({ server });

// Store connected clients with metadata
const clients = new Map();
const clientData = new Map();
let clientIdCounter = 0;

console.log(`Server starting on port ${PORT}...`);
console.log(`Web interface on http://localhost:${WEB_PORT}`);
console.log(`Admin password: ${ADMIN_PASSWORD}`);

wss.on('connection', (ws, req) => {
  const clientId = `client_${++clientIdCounter}`;
  const ip = req.socket.remoteAddress;

  clients.set(clientId, ws);
  clientData.set(clientId, {
    connectedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    ip,
    shellProcess: null
  });

  console.log(`[${clientId}] Client connected from ${ip}. Total clients: ${clients.size}`);

  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    message: 'Connected to server'
  }));

  ws.on('message', (data) => {
    const dataObj = clientData.get(clientId);
    if (dataObj) {
      dataObj.lastActivity = new Date().toISOString();
    }

    try {
      const message = JSON.parse(data.toString());
      handleMessage(clientId, ws, message);
    } catch (err) {
      console.error(`[${clientId}] Invalid message format:`, err.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    const dataObj = clientData.get(clientId);
    if (dataObj?.shellProcess) {
      try {
        dataObj.shellProcess.kill();
      } catch (e) {}
    }

    clients.delete(clientId);
    clientData.delete(clientId);
    console.log(`[${clientId}] Client disconnected. Total clients: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error(`[${clientId}] WebSocket error:`, err.message);
  });
});

function handleMessage(senderId, ws, message) {
  console.log(`[${senderId}] Received:`, message.type);

  switch (message.type) {
    case 'chat':
      handleChat(senderId, message);
      break;
    case 'broadcast':
      handleBroadcast(senderId, message);
      break;
    case 'list_clients':
      handleListClients(senderId);
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    case 'shell_init':
      handleShellInit(senderId, ws);
      break;
    case 'shell_data':
      handleShellData(senderId, ws, message);
      break;
    case 'resize':
      handleResize(senderId, ws, message);
      break;
    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${message.type}`
      }));
  }
}

function handleChat(senderId, message) {
  const { target, content } = message;

  if (!clients.has(target)) {
    clients.get(senderId).send(JSON.stringify({
      type: 'error',
      message: `Client ${target} not found`
    }));
    return;
  }

  const payload = JSON.stringify({
    type: 'chat',
    from: senderId,
    content,
    timestamp: new Date().toISOString()
  });

  clients.get(target).send(payload);
  console.log(`[${senderId}] -> [${target}]: ${content}`);
}

function handleBroadcast(senderId, message) {
  const { content } = message;

  const payload = JSON.stringify({
    type: 'broadcast',
    from: senderId,
    content,
    timestamp: new Date().toISOString()
  });

  clients.forEach((client, id) => {
    if (id !== senderId && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });

  console.log(`[${senderId}] broadcast: ${content}`);
}

function handleListClients(senderId) {
  const clientList = Array.from(clients.keys());
  clients.get(senderId).send(JSON.stringify({
    type: 'client_list',
    clients: clientList,
    count: clientList.length
  }));
}

function handleShellInit(clientId, ws) {
  const pty = require('node-pty');

  // Use node-pty for proper terminal emulation (like SSH)
  const shell = process.platform === 'win32'
    ? pty.spawn('powershell.exe', [
        '-NoLogo',
        '-NoExit',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        'Set-PSReadLineOption -EditMode Emacs; $env:PROMPT = "$P$G"'
      ], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: process.cwd()
      })
    : pty.spawn('bash', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: process.cwd()
      });

  const sessionData = clientData.get(clientId);
  if (sessionData) {
    sessionData.shellProcess = shell;
  }

  // node-pty uses 'data' event instead of stdout
  shell.on('data', (data) => {
    ws.send(JSON.stringify({
      type: 'shell_output',
      data: data.toString()
    }));
  });

  shell.on('exit', (code) => {
    ws.send(JSON.stringify({
      type: 'shell_closed',
      code
    }));
    if (sessionData) {
      sessionData.shellProcess = null;
    }
  });

  ws.send(JSON.stringify({
    type: 'shell_ready',
    message: 'Shell initialized'
  }));

  console.log(`[${clientId}] PTY shell session started`);
}

function handleShellData(clientId, ws, message) {
  const sessionData = clientData.get(clientId);
  if (!sessionData?.shellProcess) {
    return;
  }
  // Write raw terminal data directly to PTY
  sessionData.shellProcess.write(message.data);
}

function handleResize(clientId, ws, message) {
  const sessionData = clientData.get(clientId);
  if (!sessionData?.shellProcess) {
    return;
  }
  // Resize the PTY to match terminal
  sessionData.shellProcess.resize(message.cols, message.rows);
}

function broadcast(message, excludeId = null) {
  const payload = JSON.stringify(message);
  clients.forEach((client, id) => {
    if (id !== excludeId && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('error', (err) => {
  console.error('Server error:', err.message);
});

server.listen(WEB_PORT, () => {
  console.log(`Web interface running on http://localhost:${WEB_PORT}`);
  console.log(`Dashboard: http://localhost:${WEB_PORT}/dashboard`);
});
