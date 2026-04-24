/**
 * withEvanWidget — Expo Config Plugin
 *
 * Usage in app.json:
 *   ["./plugins/withEvanWidget", {
 *     "bundleIdentifier": "com.evanai.app.EvanWidget",
 *     "targetName": "EvanWidget"
 *   }]
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withDangerousMod,
} = require("@expo/config-plugins");
const path = require("path");
const fs   = require("fs");

const APP_GROUP  = "group.com.evanbyon.evanai.widget";
const DEPLOYMENT = "17.0";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Extract plain UUID from either "string" or { value, comment } object
function uuidOf(ref) {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && ref.value) return ref.value;
  return null;
}

// ─── Xcode project mutations ──────────────────────────────────────────────────

function addWidgetTarget(xcodeProject, widgetBundleId, targetName, appVersion) {
  const pbx = xcodeProject;

  // Guard: don't add twice
  const nativeTargets = pbx.pbxNativeTargetSection();
  const existing = Object.values(nativeTargets).find(
    (t) => typeof t === "object" && t.name === targetName
  );
  if (existing) {
    console.log(`[withEvanWidget] Target "${targetName}" already exists — skipping.`);
    return;
  }

  // Add the widget extension target
  const target = pbx.addTarget(targetName, "app_extension", targetName, widgetBundleId);
  if (!target) {
    console.warn("[withEvanWidget] addTarget returned null.");
    return;
  }
  const targetKey = target.uuid;

  // Add Swift source to Sources build phase
  pbx.addBuildPhase(
    [`${targetName}/EvanWidget.swift`],
    "PBXSourcesBuildPhase",
    "Sources",
    targetKey
  );

  // ── Patch build settings ──────────────────────────────────────────────────
  // nativeTarget.buildConfigurationList may be a plain UUID string
  // or a { value, comment } object — handle both.
  const nativeTarget = pbx.pbxNativeTargetSection()[targetKey];
  if (!nativeTarget) {
    console.warn("[withEvanWidget] Native target entry not found.");
    return;
  }

  const configListKey = uuidOf(nativeTarget.buildConfigurationList);
  if (!configListKey) {
    console.warn("[withEvanWidget] Could not resolve configListKey.");
    return;
  }

  const configList = pbx.pbxXCConfigurationList()[configListKey];
  if (!configList || !Array.isArray(configList.buildConfigurations)) {
    console.warn("[withEvanWidget] buildConfigurationList not found.");
    return;
  }

  const allBuildConfigs = pbx.pbxXCBuildConfigurationSection();
  configList.buildConfigurations.forEach((ref) => {
    const cfgKey = uuidOf(ref);
    const cfg = cfgKey && allBuildConfigs[cfgKey];
    if (!cfg || !cfg.buildSettings) return;

    const bs = cfg.buildSettings;
    bs.ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = "NO";
    bs.CODE_SIGN_ENTITLEMENTS               = `${targetName}/EvanWidget.entitlements`;
    bs.CURRENT_PROJECT_VERSION              = "1";
    bs.GENERATE_INFOPLIST_FILE              = "NO";
    bs.INFOPLIST_FILE                       = `${targetName}/Info.plist`;
    bs.IPHONEOS_DEPLOYMENT_TARGET           = DEPLOYMENT;
    bs.MARKETING_VERSION                    = appVersion;
    bs.PRODUCT_BUNDLE_IDENTIFIER            = widgetBundleId;
    bs.PRODUCT_NAME                         = '"$(TARGET_NAME)"';
    bs.SKIP_INSTALL                         = "YES";
    bs.SWIFT_EMIT_LOC_STRINGS              = "YES";
    bs.SWIFT_VERSION                        = "5.0";
    bs.TARGETED_DEVICE_FAMILY              = '"1,2"';
  });

  // ── Add target dependency: main app must build EvanWidget first ───────────
  const mainAppTarget = Object.entries(pbx.pbxNativeTargetSection()).find(
    ([, t]) =>
      typeof t === "object" &&
      t.productType === '"com.apple.product-type.application"'
  );
  if (mainAppTarget) {
    pbx.addTargetDependency(mainAppTarget[0], [targetKey]);
    console.log(`[withEvanWidget] Added target dependency: ${mainAppTarget[1].name} → ${targetName}`);
  } else {
    console.warn("[withEvanWidget] Could not find main app target for dependency.");
  }

  console.log(`[withEvanWidget] Added target "${targetName}" → ${widgetBundleId}`);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

const withEvanWidget = (config, options = {}) => {
  const targetName     = options.targetName     ?? "EvanWidget";
  const widgetBundleId = options.bundleIdentifier
    ?? `${config.ios?.bundleIdentifier ?? "com.evanai.app"}.${targetName}`;

  // 1. App Group entitlement on the main app
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

  // 2. Write widget files into ios/<targetName>/
  //    Info.plist is GENERATED here (not just copied) so CFBundleIdentifier
  //    is always present and can't be clobbered by Expo's plist mods.
  config = withDangerousMod(config, [
    "ios",
    async (cfg) => {
      const iosRoot     = cfg.modRequest.platformProjectRoot;
      const projectRoot = cfg.modRequest.projectRoot;
      const widgetDir   = path.join(iosRoot, targetName);
      const sourceDir   = path.join(projectRoot, "widget-source", targetName);

      if (!fs.existsSync(widgetDir)) fs.mkdirSync(widgetDir, { recursive: true });

      // Copy Swift source and entitlements from widget-source/
      for (const f of ["EvanWidget.swift", "EvanWidget.entitlements"]) {
        const src  = path.join(sourceDir, f);
        const dest = path.join(widgetDir, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`[withEvanWidget] Copied ${f} → ios/${targetName}/${f}`);
        } else {
          console.warn(`[withEvanWidget] Missing: widget-source/${targetName}/${f}`);
        }
      }

      // Generate Info.plist directly — never copy so CFBundleIdentifier
      // can't be lost to Expo's post-processing of plist files.
      const infoPlistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDisplayName</key>
\t<string>Evan AI</string>
\t<key>CFBundleExecutable</key>
\t<string>$(EXECUTABLE_NAME)</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundlePackageType</key>
\t<string>XPC!</string>
\t<key>CFBundleShortVersionString</key>
\t<string>$(MARKETING_VERSION)</string>
\t<key>CFBundleVersion</key>
\t<string>$(CURRENT_PROJECT_VERSION)</string>
\t<key>NSExtension</key>
\t<dict>
\t\t<key>NSExtensionPointIdentifier</key>
\t\t<string>com.apple.widgetkit-extension</string>
\t</dict>
</dict>
</plist>
`;
      fs.writeFileSync(path.join(widgetDir, "Info.plist"), infoPlistContent, "utf8");
      console.log(`[withEvanWidget] Generated ios/${targetName}/Info.plist with CFBundleIdentifier`);

      return cfg;
    },
  ]);

  // 3. Wire the target into the Xcode project + add target dependency
  config = withXcodeProject(config, (cfg) => {
    addWidgetTarget(cfg.modResults, widgetBundleId, targetName, config.version ?? "1.0.0");
    return cfg;
  });

  return config;
};

module.exports = withEvanWidget;
