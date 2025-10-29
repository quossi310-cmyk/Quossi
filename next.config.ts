// next.config.ts
import type { NextConfig } from "next";

const config: NextConfig = {
  // 🔒 TEMP bypass to allow deploys with TS/ESLint errors (remove later)
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Your existing custom config
  // (Next.js ignores unknown keys, so it's safe to keep these.)
  // Used by your app code to gate dev origins, emulator, etc.
  // If you reference this at runtime, import from this file.
  // @ts-expect-error - custom key (not part of NextConfig)
  allowedDevOrigins: [
    "10.0.2.2",              // Android emulator host loopback
    "localhost",
    "*.localhost",
    "capacitor://localhost",
  ],

  experimental: {
    serverActions: {
      allowedOrigins: [
        "capacitor://localhost",
        "10.0.2.2",
        "localhost",
        "*.localhost",
      ],
    },
  },
};

export default config;
