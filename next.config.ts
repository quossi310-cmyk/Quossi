/** @type {import('next').NextConfig} */
const config = {
  // allow the Android emulator + Capacitor webview to access dev assets
  allowedDevOrigins: [
    '10.0.2.2',              // Android emulator host loopback
    'localhost',
    '*.localhost',
    'capacitor://localhost'
  ],

  experimental: {
    // if you use Server Actions anywhere, also allow these origins
    serverActions: {
      allowedOrigins: ['capacitor://localhost', '10.0.2.2', 'localhost', '*.localhost'],
    },
  },
};

module.exports = config;
