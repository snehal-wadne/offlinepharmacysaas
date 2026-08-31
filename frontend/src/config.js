import { Platform } from 'react-native';

// Dynamically select the API server host based on active platform.
// - Web browsers connect to localhost.
// - Android emulators use the 10.0.2.2 gateway to access the host loopback.
// - iOS Simulators connect to localhost directly.
export const API_URL = Platform.select({
  android: 'http://10.0.2.2:5000',
  ios: 'http://localhost:5000',
  default: 'http://localhost:5000',
});
