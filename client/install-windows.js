'use strict';
/**
 * install-windows.js — DEPRECATED
 *
 * This file is superseded by install-windows.ps1 which uses sc.exe (built
 * into every Windows) and requires NO Node.js on the target machine.
 *
 * On the target machine, run:
 *   Right-click install-windows.ps1 → "Run with PowerShell as Administrator"
 * Or from an elevated PowerShell prompt:
 *   .\install-windows.ps1
 *   .\install-windows.ps1 -ServerUrl "ws://1.2.3.4:3000"
 */
console.error('');
console.error('  [!] Please use install-windows.ps1 instead.');
console.error('      It requires no Node.js on the target machine.');
console.error('');
console.error('  Run from an elevated PowerShell:');
console.error('    .\\install-windows.ps1');
console.error('');
process.exit(1);


const cfg = (() => {
  try { return require('./config.json'); } catch (_) { return {}; }
})();

const svc = new Service({
  name:        'UltraRAT-Client',
  description: 'UltraRAT remote administration client agent. Connects to the RAT server and awaits commands.',
  script:      path.join(__dirname, 'service.js'),
  nodeOptions: [],
  // Pass the server URL as an environment variable so you can override
  // the value in config.json without reinstalling the service.
  env: [
    {
      name:  'RAT_SERVER_URL',
      value: process.env.RAT_SERVER_URL || cfg.serverUrl || 'ws://localhost:3000',
    },
    {
      name:  'NODE_ENV',
      value: 'production',
    },
  ],
});

svc.on('install', () => {
  console.log('[✓] Service installed successfully.');
  svc.start();
});

svc.on('start', () => {
  console.log('[✓] Service started.');
  console.log('');
  console.log('Manage the service:');
  console.log('  • Open services.msc and look for "UltraRAT-Client"');
  console.log('  • Or use: sc query UltraRAT-Client');
  console.log('  • To stop:      sc stop UltraRAT-Client');
  console.log('  • To uninstall: node uninstall-windows.js  (as Administrator)');
});

svc.on('alreadyinstalled', () => {
  console.warn('[!] Service is already installed. Uninstall first with: node uninstall-windows.js');
});

svc.on('invalidinstallation', () => {
  console.error('[ERROR] Invalid installation. Try uninstalling first.');
});

svc.on('error', (err) => {
  console.error('[ERROR]', err);
});

console.log(`Installing UltraRAT-Client service (server: ${cfg.serverUrl || 'ws://localhost:3000'}) ...`);
svc.install();
