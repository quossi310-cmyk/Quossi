// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quossi.app',
  appName: 'Quossi',
  webDir: 'out',
  server: {
    url: 'https://quossi.com',   // <-- force prod site
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: ['quossi.com','www.quossi.com'],
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#000000',
    },
  },
};

export default config;
