const { getDefaultConfig, getDefaultConfigWithCacheStores } = require("expo/metro-config");
const path = require('path');

const defaultConfig = getDefaultConfig(__dirname);

const root = path.join(__dirname, '.metro-cache');
const cacheStores = [new (require('metro-cache').FileStore)({ root: path.join(root, 'cache') })];

const config = getDefaultConfigWithCacheStores(defaultConfig, { cacheStores });

config.maxWorkers = 1;  // Low RAM: Reduce parallelism

config.resolver = {
  ...config.resolver,
  alias: {
    ...config.resolver.alias,
    'event-target-shim/index': 'event-target-shim/lib/index.js',
  },
  blockList: [
    ...config.resolver.blockList,
    // Block webrtc entirely on web bundling
    /react-native-webrtc(\/.*)?$/,
    /event-target-shim\/(?!lib\/)/,  // Exclude non-lib paths
  ],
  platforms: ['ios', 'android', 'native', 'web'],
  // Web: Ignore native modules as assets
  assetExts: [...config.resolver.assetExts, 'webrtc', 'native'],
};

if (process.env.NODE_ENV === 'development') {
  config.transformer = {
    ...config.transformer,
    inlineRequires: true,  // Optimize imports
  };
}

module.exports = config;
