const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "expo-router": path.resolve(__dirname, "src/shims/expo-router"),
  dexie: path.resolve(__dirname, "src/shims/dexie"),
};

module.exports = config;

