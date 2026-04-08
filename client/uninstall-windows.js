'use strict';
/**
 * uninstall-windows.js — DEPRECATED
 *
 * Use uninstall-windows.ps1 instead (no Node.js required on target).
 *
 * From an elevated PowerShell prompt:
 *   .\uninstall-windows.ps1
 */
console.error('');
console.error('  [!] Please use uninstall-windows.ps1 instead.');
console.error('');
console.error('  Run from an elevated PowerShell:');
console.error('    .\\uninstall-windows.ps1');
console.error('');
process.exit(1);


const svc = new Service({
  name:   'UltraRAT-Client',
  script: path.join(__dirname, 'service.js'),
});

svc.on('uninstall', () => {
  console.log('[✓] Service uninstalled successfully.');
});

svc.on('notinstalled', () => {
  console.warn('[!] Service is not currently installed.');
});

svc.on('error', (err) => {
  console.error('[ERROR]', err);
});

console.log('Uninstalling UltraRAT-Client service ...');
svc.uninstall();
