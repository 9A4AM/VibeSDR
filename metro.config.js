const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Reanimated v4, react-native-worklets, and Skia ship with raw 'worklet'
// directives that must pass through the Babel/worklets plugin.
// Extend Metro's transform ignore pattern to include these packages.
config.transformer = config.transformer ?? {};
config.transformer.transformIgnorePatterns = [
  'node_modules/(?!(' +
  [
    'react-native',
    '@react-native',
    '@react-navigation',
    'expo',
    '@expo',
    'react-native-reanimated',
    '@shopify/react-native-skia',
    'react-native-gesture-handler',
    'react-native-screens',
    'react-native-safe-area-context',
    '@react-native-async-storage',
    'react-native-get-random-values',
    'expo-blur',
    'expo-keep-awake',
    'uuid',
  ].join('|') +
  ')/)',
];

module.exports = config;
