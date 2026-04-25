const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/**
 * Force all packages to share the same three.js instance.
 * stats-gl (pulled by @react-three/drei) bundles its own three@0.170
 * which triggers THREE's "Multiple instances" warning.
 */
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "three") {
    return {
      filePath: require.resolve("three"),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
