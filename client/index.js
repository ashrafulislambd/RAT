const WebSocket = require('ws');

class RemoteClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl || 'ws://localhost:3000';
    this.ws = null;
    this.clientId = null;
    this.connected = false;
    this.messageHandlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to ${this.serverUrl}...`);
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        console.log('Connected to server');
        this.connected = true;
      });

      this.ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      });

      this.ws.on('close', () => {
        console.log('Disconnected from server');
        this.connected = false;
      });

      this.ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        reject(err);
      });

      this.ws.on('open', () => {
        resolve();
      });
    });
  }

  handleMessage(message) {
    console.log('Received:', message.type, message);

    switch (message.type) {
      case 'connected':
        this.clientId = message.clientId;
        console.log(`Assigned client ID: ${this.clientId}`);
        break;
      case 'chat':
        console.log(`[Chat from ${message.from}]: ${message.content}`);
        break;
      case 'broadcast':
        console.log(`[Broadcast from ${message.from}]: ${message.content}`);
        break;
      case 'client_joined':
        console.log(`Client joined: ${message.clientId}`);
        break;
      case 'client_left':
        console.log(`Client left: ${message.clientId}`);
        break;
      case 'client_list':
        console.log(`Connected clients (${message.count}):`, message.clients);
        break;
      case 'pong':
        console.log(`Pong! Latency: ${Date.now() - message.timestamp}ms`);
        break;
      case 'shell_ready':
        console.log('[Shell] Shell session ready');
        break;
      case 'shell_output':
        console.log('[Shell Output]', message.data);
        break;
      case 'shell_closed':
        console.log(`[Shell] Shell closed (code: ${message.code})`);
        break;
      case 'error':
        console.error('Server error:', message.message);
        break;
    }

    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    }
  }

  on(eventType, callback) {
    this.messageHandlers.set(eventType, callback);
    return this;
  }

  sendChat(target, content) {
    return this.send({ type: 'chat', target, content });
  }

  broadcast(content) {
    return this.send({ type: 'broadcast', content });
  }

  listClients() {
    return this.send({ type: 'list_clients' });
  }

  ping() {
    return this.send({ type: 'ping' });
  }

  initShell() {
    return this.send({ type: 'shell_init' });
  }

  sendShellCommand(command) {
    return this.send({ type: 'shell_command', command });
  }

  send(message) {
    if (!this.connected) {
      console.error('Not connected to server');
      return false;
    }
    this.ws.send(JSON.stringify(message));
    return true;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}

// CLI mode when run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const serverUrl = args[0] || 'ws://localhost:3000';

  const client = new RemoteClient(serverUrl);

  client
    .on('chat', (msg) => console.log(`\n[DM from ${msg.from}]: ${msg.content}`))
    .on('broadcast', (msg) => console.log(`\n[Broadcast from ${msg.from}]: ${msg.content}`));

  client.connect().then(() => {
    console.log('\nCommands:');
    console.log('  /chat <client_id> <message> - Send direct message');
    console.log('  /broadcast <message> - Send to all clients');
    console.log('  /list - List connected clients');
    console.log('  /ping - Check latency');
    console.log('  /shell - Start remote shell session');
    console.log('  /quit - Disconnect\n');

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.on('line', (input) => {
      const parts = input.trim().split(' ');
      const cmd = parts[0];

      switch (cmd) {
        case '/chat':
          if (parts.length < 3) {
            console.log('Usage: /chat <client_id> <message>');
            return;
          }
          client.sendChat(parts[1], parts.slice(2).join(' '));
          break;
        case '/broadcast':
          if (parts.length < 2) {
            console.log('Usage: /broadcast <message>');
            return;
          }
          client.broadcast(parts.slice(1).join(' '));
          break;
        case '/list':
          client.listClients();
          break;
        case '/ping':
          client.ping();
          break;
        case '/shell':
          console.log('[Shell] Initializing shell session...');
          client.initShell();
          break;
        case '/quit':
          client.disconnect();
          readline.close();
          process.exit(0);
        default:
          console.log('Unknown command');
      }
    });
  }).catch(console.error);
}

module.exports = RemoteClient;
