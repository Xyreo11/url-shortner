export default {
  preset: "jest-environment-node",
  testEnvironment: "node",

  // Enable ESM support properly
  transform: {},

  // Treat JS files as ESM
  extensionsToTreatAsEsm: [".js"],

  // Fix ESM import resolution
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  testMatch: ["**/?(*.)+(test).js"],
  clearMocks: true,

  collectCoverage: true,
  coverageDirectory: "coverage"
};
