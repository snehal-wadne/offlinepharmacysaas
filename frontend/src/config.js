// Dynamically select the API server host based on active platform.
// - Web browsers connect to localhost.
// - Android emulators use the 10.0.2.2 gateway to access the host loopback.
// - iOS Simulators connect to localhost directly.
// - Node.js test runners safely fall back to localhost:5000.
let selectedUrl = "http://localhost:5000";

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RN = require("react-native");
  if (RN && RN.Platform && RN.Platform.select) {
    selectedUrl = RN.Platform.select({
      android: "http://10.0.2.2:5000",
      ios: "http://localhost:5000",
      default: "http://localhost:5000",
    });
  }
} catch (e) {
  if (typeof process !== "undefined" && process.env && process.env.API_URL) {
    selectedUrl = process.env.API_URL;
  }
}

export const API_URL = selectedUrl;
