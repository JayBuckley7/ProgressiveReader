import type { CapacitorConfig } from '@capacitor/cli';

// Optional live-reload URL (e.g., http://10.0.2.2:5175 for Android emulator or http://YOUR_LAN_IP:5175 for device)
const liveReloadUrl = process.env.LIVE_RELOAD_URL;

const allowNavigationHosts = [
  'localhost',
  '*.clerk.com',
  '*.clerk.services',
  '*.clerkstage.dev',
  'accounts.google.com',
  'appleid.apple.com',
];

const config: CapacitorConfig = {
  appId: 'com.progressivereader.app',
  appName: 'ProgressiveReader',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: liveReloadUrl
    ? {
        url: liveReloadUrl,
        cleartext: true,
        allowNavigation: allowNavigationHosts,
        androidScheme: 'http',
      }
    : {
        androidScheme: 'https',
        allowNavigation: allowNavigationHosts,
      },
};

export default config;
