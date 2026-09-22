// Dynamically select the API server host based on active platform and environment variables.
// - Explicit environment variable EXPO_PUBLIC_API_URL or API_URL takes precedence.
// - Web browsers connect to localhost.
// - Android emulators use the 10.0.2.2 gateway to access the host loopback.
// - iOS Simulators connect to localhost directly.
// - Node.js test runners safely fall back to localhost:5000.
let envUrl = "";
if (typeof process !== "undefined" && process.env) {
  envUrl = process.env.EXPO_PUBLIC_API_URL || process.env.API_URL || "";
}

let selectedUrl = envUrl || "http://localhost:5000";

if (!envUrl) {
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
  } catch (e) {}
}

const API_URL = selectedUrl;

if (typeof exports !== "undefined") {
  exports.API_URL = API_URL;
  exports.default = API_URL;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = exports || { API_URL, default: API_URL };
}

