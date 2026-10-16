import type { ExpoConfig } from 'expo/config';

const projectId = process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: 'SiteSurveyor',
  slug: 'sitesurveyor',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'sitesurveyor',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.succeed.sitesurveyor',
    supportsTablet: true,
    icon: './assets/expo.icon',
  },
  android: {
    package: 'com.succeed.sitesurveyor',
    predictiveBackGestureEnabled: false,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
  },
  web: {
    output: 'server',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: { eas: projectId ? { projectId } : undefined },
};

export default config;
