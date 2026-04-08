# UltraRAT - WebSocket Remote Administration Tool

A WebSocket-based remote administration tool with a password-protected web interface for managing clients and shell access.

## Structure

```
UltraRAT/
├── server/
│   ├── index.js          # WebSocket + Express server
│   ├── package.json
│   └── public/
│       ├── dashboard.html    # Admin dashboard
│       └── terminal.html     # Shell terminal UI
└── client/
    ├── index.js          # Client module
    └── package.json
```

## Setup

### Server
```bash
cd server
npm install
```

### Client
```bash
cd client
npm install
```

## Running

### Start Server
```bash
cd server
npm start
```

Environment variables:
- `PORT` - WebSocket port (default: 8080)
- `WEB_PORT` - Web interface port (default: 3000)
- `ADMIN_PASSWORD` - Admin password (default: `admin123`)

### Start Clients
```bash
cd client
npm start
# Or specify server: npm start ws://your-server:8080
```

## Web Interface

1. Open `http://localhost:3000/dashboard`
2. Login with password (default: `admin123`)
3. View connected clients with status
4. Click "Terminal" for shell access to any client

## Features

### Messaging
- Direct chat between clients
- Broadcast to all clients
- Client join/leave notifications

### Web Dashboard
- Password-protected authentication
- Real-time client monitoring (online/offline status)
- Connection timestamps and IP tracking
- Auto-refresh every 5 seconds

### Shell Access
- Browser-based terminal (AWS Instance Connect-style)
- Full interactive shell session
- Command history (up/down arrows)

### Client Commands (CLI)
```
/chat <client_id> <message>  - Send direct message
/broadcast <message>         - Send to all clients
/list                        - List connected clients
/ping                        - Check latency
/shell                       - Start remote shell
/quit                        - Disconnect
```

## Programmatic Usage

```javascript
const RemoteClient = require('./client');
const client = new RemoteClient('ws://localhost:8080');

await client.connect();

// Messaging
client.sendChat('client_2', 'Hello!');
client.broadcast('Hello everyone!');

// Shell access
client.initShell();
client.sendShellCommand('ls -la');

// Events
client.on('chat', (msg) => console.log(msg.content));
client.on('shell_output', (msg) => console.log(msg.data));
```

## Security Notes

- Change the default `ADMIN_PASSWORD` in production
- Use HTTPS/WSS for production deployments
- Consider adding client authentication
