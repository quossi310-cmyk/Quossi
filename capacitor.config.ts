// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const DEV = process.env.CAP_ENV !== 'prod'; // set CAP_ENV=prod for production builds

const DEV_SERVER_URL = 'http://10.0.2.2:3000';
const PROD_SERVER_URL = 'https://quossi.com';

const config: CapacitorConfig = {
  appId: 'com.quossi.app',            // use all-lowercase reverse-DNS
  appName: 'Quossi',
  webDir: 'out',                      // used only if you bundle assets
  server: DEV
    ? {
        // DEV: load from your local Next.js server
        url: DEV_SERVER_URL,
        cleartext: true,
        allowNavigation: ['10.0.2.2', 'localhost'],
      }
    : {
        // PROD: load your live site
        url: PROD_SERVER_URL,
        androidScheme: 'https',
        cleartext: false,
        allowNavigation: ['quossi.com', 'www.quossi.com'],
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
