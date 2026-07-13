module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // react-native-worklets provides the Reanimated 4 babel plugin.
    // Keep it last.
    plugins: ["react-native-worklets/plugin"],
  };
};
