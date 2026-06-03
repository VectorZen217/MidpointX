const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests", "<rootDir>/src/tests"],
  transform: {
    ...tsJestTransformCfg,
    "^.+\\.[tj]sx?$": ["ts-jest", { isolatedModules: true }],
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "/src/plugins/skills/"
  ],
  transformIgnorePatterns: [
    "node_modules/(?!p-retry|is-network-error)/",
  ],
};
