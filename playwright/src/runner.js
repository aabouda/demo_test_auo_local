import { execSync } from "child_process";
import { chromium } from "playwright";



const executionId = process.env.ARGS_FILE;

if (!executionId) {
  console.error("❌ ARGS_FILE is missing");
  process.exit(1);
}

console.log("🚀 Playwright execution started");
console.log("📂 Execution ID:", executionId);

// rendre l'ID accessible à cucumber / steps
process.env.EXECUTION_ID = executionId;

// lancer cucumber
execSync(
  "npx cucumber-js --config cucumber.mjs",
  { stdio: "inherit" }
);
