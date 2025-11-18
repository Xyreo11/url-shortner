export default {
  testEnvironment: "node",

  // ESM support
  transform: {},

  extensionsToTreatAsEsm: [],

  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  testMatch: ["**/?(*.)+(test).js"],
  clearMocks: true,

  collectCoverage: true,
  coverageDirectory: "coverage"
};

