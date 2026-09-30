import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'jp.kakitori.app',
  appName: 'かきとり',
  webDir: 'dist',
  ios: { contentInset: 'automatic' },
};

export default config;
