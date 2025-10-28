import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.Quossi.app',
  appName: 'Quossi',
  webDir: 'out',
  server: {
    url: 'http://10.0.2.2:3000',   // Local dev URL for emulator
    cleartext: true,
    androidScheme: 'http'
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,       // Ensures UI isn't under status bar
      style: 'DARK',                // Options: 'DARK' | 'LIGHT'
      backgroundColor: '#000000'    // Match your topbar background
    }
  }
};

export default config;
