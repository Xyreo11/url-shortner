export default {
  testEnvironment: "node",
  clearMocks: true,
  transform: {},

  // Allow `.js` ESM imports
  extensionsToTreatAsEsm: [],

  // Workaround for ESM module resolution in Jest
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },

  // Test files pattern
  testMatch: ["**/?(*.)+(test).js"],
  
  collectCoverage: true,
  coverageDirectory: "coverage"
};
