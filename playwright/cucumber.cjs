const base_options = [
  // Load steps
  '--import ./src/steps/**/*.js',
  '--import ./src/support/config.mjs',
  '--import ./src/support/world.mjs',
  '--format json:reports/cucumber/cucumber_report.json', // JSON report

  // Load custom formatter
  '--format html:reports/cucumber/cucumber-report.html',
  '--format progress-bar',
  '--format ./src/support/reporter.mjs:reports/allure-report/formatter-log.txt', // Allure report (piped to a file to have log in console)
];

// see all params here : https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md

let run_options = base_options.concat(['--retry 1']).join(' ');

let debug_options = base_options.concat([]).join(' ');

let run_features = [
  '../features/', // Specify our feature files location
  run_options,
  process.argv.slice(4).join(' '),
].join(' ');

let debug_features = [
  '../features/', // Specify our feature files location
  debug_options,
  process.argv.slice(4).join(' '),
].join(' ');

module.exports = {
  default: {
    paths: ["../features/**/*.feature"],
    require: [
      "./src/steps/**/*.js",
      "./src/support/config.mjs",
      "./src/support/world.mjs",
    ],
    format: [
      "json:reports/cucumber/cucumber_report.json",
      "html:reports/cucumber/cucumber-report.html",
      "progress-bar",
      "./src/support/reporter.mjs:reports/allure-report/formatter-log.txt",
    ],
    retry: 1,
  },
  debug_runner: {
    paths: ["../features/**/*.feature"],
    require: [
      "./src/steps/**/*.js",
      "./src/support/config.mjs",
      "./src/support/world.mjs",
    ],
    format: [
      "json:reports/cucumber/cucumber_report.json",
      "html:reports/cucumber/cucumber-report.html",
      "progress-bar",
      "./src/support/reporter.mjs:reports/allure-report/formatter-log.txt",
    ]
  }
};

