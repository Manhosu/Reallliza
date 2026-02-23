import os from 'os';
const ifaces = os.networkInterfaces();
for (const name of Object.keys(ifaces)) {
  for (const iface of ifaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      console.log(`${name}: ${iface.address}`);
    }
  }
}
