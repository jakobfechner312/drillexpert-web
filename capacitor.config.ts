import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.drillexpert.mobile',
  appName: 'Drillexpert',
  webDir: 'out',
  server: {
    url: 'https://drillexpert.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
