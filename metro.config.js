// Metro config for the Expo app.
//
// This repository also contains `bench/`, a standalone benchmark harness (Canvas2D vs
// WebGL2, see BUILD_LOG.md §7) that has its own `node_modules`. Metro tries to crawl and
// watch it, and on Windows the fallback watcher fails with:
//
//   EACCES: permission denied, lstat '...\bench\node_modules\.bin\playwright'
//
// `bench/` is not part of the app bundle, so we hide it from Metro's file map.
// Per the Metro docs, `resolver.blockList` is "a regular expression (or list of regular
// expressions) defining which paths to exclude from Metro's file map".
// https://metrobundler.dev/docs/configuration/#blocklist
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Matches both separators (Windows `\` and POSIX `/`) and both absolute and
// project-relative paths, since Metro can test either form. The existing Expo
// default patterns above are project-relative and start-of-string anchored, so
// we use `(?:^|[\\/])` to cover both relative (`bench/...`) and absolute
// (`.../chuva-matrix/bench/...`) paths.
const benchDir = /(?:^|[\\/])bench[\\/]/;

const existing = config.resolver.blockList;
config.resolver.blockList = Array.isArray(existing)
  ? [...existing, benchDir]
  : existing
    ? [existing, benchDir]
    : [benchDir];

module.exports = config;
