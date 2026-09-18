// VibeServer Lite bundles the MAIN app's own files — ../../src — not copies of them.
// ★ Everything those files import must resolve to THIS project's node_modules (React 18 / RN 0.73),
//   never the main app's (React 19 / RN 0.86): two Reacts in one bundle is a blank screen.
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const repo = path.resolve(__dirname, '../..');
const mine = path.resolve(__dirname, 'node_modules');
module.exports = mergeConfig(getDefaultConfig(__dirname), {
  projectRoot: __dirname,
  watchFolders: [path.join(repo, 'src'), path.join(repo, 'assets')],
  resolver: {
    nodeModulesPaths: [mine],
    disableHierarchicalLookup: true,
    blockList: [new RegExp(path.join(repo, 'node_modules').replace(/[/\\]/g, '[/\\\\]') + '[/\\\\].*')],
    resolveRequest(ctx, name, platform) {
      // ServerModeScreen imports a TYPE from the main App.tsx. Babel drops it; if it ever does
      // not, this keeps the whole main app (Skia, Expo, navigation) out of Lite's bundle.
      if (/(^|[/\\])App$/.test(name) && /ServerModeScreen\.tsx$/.test(ctx.originModulePath))
        return { type: 'sourceFile', filePath: path.join(__dirname, 'stubs/App.ts') };
      return ctx.resolveRequest(ctx, name, platform);
    },
  },
});
