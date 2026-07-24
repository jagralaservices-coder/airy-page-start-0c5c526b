import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ezymydocs.paystorepos',
  appName: 'PayStore POS',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
    captureInput: true,
    // Enable full-screen mode for native app experience
    backgroundColor: '#00335c',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#00335c",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    Camera: {
      // Camera permissions will be requested at runtime
    },
    Geolocation: {
      // Location permissions will be requested at runtime
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  },
  server: {
    url: "https://5809fbdb-bd72-4f7e-949b-2caa284ac9da.lovableproject.com?forceHideBadge=true",
    cleartext: true,
    androidScheme: "https",
    // Only allow navigation to necessary domains for API calls
    allowNavigation: [
      "*.supabase.co",
      "*.supabase.in"
    ]
  }
};

export default config;
