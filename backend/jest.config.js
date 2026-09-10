/**
 * Jest runs native ESM here, because package.json sets "type": "module".
 * Two consequences worth knowing before editing this file:
 *
 * 1. extensionsToTreatAsEsm must NOT contain ".js". Jest infers that from
 *    package.json and throws a validation error if you list it, which is
 *    exactly why `npm test` could not run a single test before.
 * 2. jest.mock is not hoisted under ESM. Tests use jest.unstable_mockModule
 *    followed by a dynamic await import().
 *
 * The runner needs --experimental-vm-modules; see the test script in
 * package.json, which passes it in a way that works on Windows and Linux CI.
 */
export default {
  testEnvironment: "node",
  clearMocks: true,

  // No transform: the source is already ESM and needs no compilation step.
  transform: {},

  testMatch: ["**/tests/**/?(*.)+(test).js"],

  // Opt in with `npm run test:coverage` rather than regenerating a report on
  // every run, which used to rewrite a checked-in directory each time.
  collectCoverage: false,
  coverageDirectory: "coverage",
  collectCoverageFrom: ["src/**/*.js"],
  coveragePathIgnorePatterns: ["/node_modules/"],
};
