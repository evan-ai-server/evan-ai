/**
 * withEvanWidget — Expo Config Plugin
 *
 * Wires the EvanWidget extension into the iOS Xcode project:
 *   1. Adds App Group entitlement to the main app target
 *   2. Creates the widget extension target (EvanWidget) with correct build settings
 *   3. Adds EvanWidget.swift, Info.plist, and EvanWidget.entitlements to the target
 *   4. Adds EvanWidgetBridge.swift + .m to the main app target
 *
 * Run:  npx expo prebuild --platform ios
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs   = require("fs");

const WIDGET_NAME  = "EvanWidget";
const APP_GROUP    = "group.com.evanbyon.evanai.widget";
const DEPLOYMENT   = "16.0";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateUuid() {
  return "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    .replace(/x/g, () => Math.floor(Math.random() * 16).toString(16).toUpperCase())
    .slice(0, 24);
}

function addWidgetTarget(xcodeProject, bundleId) {
  const pbx = xcodeProject;

  // Guard: don't add twice
  const existing = Object.values(pbx.pbxNativeTargetSection() || {}).find(
    (t) => typeof t === "object" && t.name === WIDGET_NAME
  );
  if (existing) {
    console.log(`[withEvanWidget] Target "${WIDGET_NAME}" already exists — skipping.`);
    return;
  }

  const widgetBundleId = `${bundleId}.${WIDGET_NAME}`;

  // ── Add widget target via xcode's helper ──────────────────────────────────
  const target = pbx.addTarget(
    WIDGET_NAME,
    "app_extension",
    WIDGET_NAME,
    widgetBundleId
  );

  if (!target) {
    console.warn("[withEvanWidget] addTarget returned null — check xcode version compatibility.");
    return;
  }

  const targetKey = target.uuid;

  // ── Source files ──────────────────────────────────────────────────────────
  pbx.addBuildPhase(
    ["EvanWidget.swift"],
    "PBXSourcesBuildPhase",
    "Sources",
    targetKey
  );

  // ── Resources (Info.plist is handled via build settings, not resources) ───
  // Assets would go here if we had them.

  // ── Build settings ────────────────────────────────────────────────────────
  const configurations = pbx.pbxXCBuildConfigurationSection();
  Object.entries(configurations).forEach(([key, cfg]) => {
    if (typeof cfg !== "object" || !cfg.buildSettings) return;
    // Only patch configs belonging to the new target
    const targetConfigs = pbx.pbxXCConfigurationList();
    let isWidgetConfig = false;
    Object.values(targetConfigs).forEach((cl) => {
      if (typeof cl === "object" && cl.buildConfigurations) {
        const hasCfg = cl.buildConfigurations.some((ref) => ref.value === key);
        if (hasCfg) {
          const ownerTarget = Object.values(pbx.pbxNativeTargetSection()).find(
            (t) => typeof t === "object" && t.buildConfigurationList === cl
          );
          if (ownerTarget && ownerTarget.name === WIDGET_NAME) {
            isWidgetConfig = true;
          }
        }
      }
    });
    if (!isWidgetConfig) return;

    const bs = cfg.buildSettings;
    bs.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = "NO";
    bs.CODE_SIGN_ENTITLEMENTS = `"${WIDGET_NAME}/EvanWidget.entitlements"`;
    bs.CURRENT_PROJECT_VERSION = "1";
    bs.GENERATE_INFOPLIST_FILE = "NO";
    bs.INFOPLIST_FILE = `"${WIDGET_NAME}/Info.plist"`;
    bs.IPHONEOS_DEPLOYMENT_TARGET = DEPLOYMENT;
    bs.MARKETING_VERSION = "1.0";
    bs.PRODUCT_BUNDLE_IDENTIFIER = `"${widgetBundleId}"`;
    bs.PRODUCT_NAME = `"$(TARGET_NAME)"`;
    bs.SKIP_INSTALL = "YES";
    bs.SWIFT_EMIT_LOC_STRINGS = "YES";
    bs.SWIFT_VERSION = "5.0";
    bs.TARGETED_DEVICE_FAMILY = '"1,2"';
  });

  console.log(`[withEvanWidget] Added target "${WIDGET_NAME}" (${widgetBundleId})`);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

const withEvanWidget = (config) => {
  const bundleId = config.ios?.bundleIdentifier ?? "com.anonymous.evanai";

  // 1. App Group in main app entitlements
  config = withEntitlementsPlist(config, (cfg) => {
    const ents = cfg.modResults;
    if (!Array.isArray(ents["com.apple.security.application-groups"])) {
      ents["com.apple.security.application-groups"] = [];
    }
    if (!ents["com.apple.security.application-groups"].includes(APP_GROUP)) {
      ents["com.apple.security.application-groups"].push(APP_GROUP);
    }
    return cfg;
  });

  // 2. Copy widget source files from widget-source/ into ios/EvanWidget/
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const projectRoot = cfg.modRequest.projectRoot;
      const widgetDir = path.join(iosRoot, WIDGET_NAME);
      const sourceDir = path.join(projectRoot, "widget-source", WIDGET_NAME);

      if (!fs.existsSync(widgetDir)) {
        fs.mkdirSync(widgetDir, { recursive: true });
      }

      const required = ["EvanWidget.swift", "Info.plist", "EvanWidget.entitlements"];
      for (const f of required) {
        const src  = path.join(sourceDir, f);
        const dest = path.join(widgetDir, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`[withEvanWidget] Copied ${f} → ios/${WIDGET_NAME}/${f}`);
        } else {
          console.warn(`[withEvanWidget] Missing source file: widget-source/${WIDGET_NAME}/${f}`);
        }
      }

      return cfg;
    },
  ]);

  // 3. Add widget target to Xcode project
  config = withXcodeProject(config, (cfg) => {
    addWidgetTarget(cfg.modResults, bundleId);
    return cfg;
  });

  return config;
};

module.exports = withEvanWidget;
