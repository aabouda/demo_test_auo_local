// eslint-disable-next-line no-unused-vars
import { Given, After, Before, AfterStep } from '@cucumber/cucumber';
import { getActionByStepName, setAction, getExecutionId } from './utils/functions.js';
import { updateTestStatus } from './utils/db.js';
import { updateOutputFile } from './utils/output-writer.js';
import fs from 'fs';
import { insertScreenshotRecord } from './utils/db.js';


import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getReportsDir } from './utils/paths.js';

const argsFile = process.env.ARGS_FILE;
let execution_id = argsFile;
let stepdb = "";

const imagePath = getReportsDir();
console.log("✅ imagePath:", imagePath);


Before(function () {
  // Injecter l'imagePath dans le World
  this.imagePath = imagePath;
  this.execution_id = execution_id;
  this.stepdb = "";
});


Given(/ai: (.*)/, { timeout: 180 * 1000 }, async function (step) {
  let bddData = await getActionByStepName(step);
  this.stepdb = step
  if (bddData) {
    console.log('Found BDD:', bddData);
  } else {
    console.log('BDD:', bddData);
  }
  await setAction(bddData, step, this, this.page, this.execution_id);

});

Given('I have test ID {string}', async function (testId) {
  this.testId = testId;
  let execution_id = await getExecutionId();
  await updateTestStatus(testId, 'in progress', execution_id);
});

After(async function ({ result }) {
  console.log('Status:', result?.status);
  const status = result?.status === 'PASSED' ? 'passed' : 'failed';
  const testId = this.testId;
  console.log('Status:', result?.status);
});

AfterStep(async function ({ result }) {
  if (!this.page) return;

  // Ici this.imagePath existe car défini dans Before
  const screenshotDir = path.join(this.imagePath, 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const fileName = `step_$${Date.now()}.png`;
  const filePath = path.join(screenshotDir, fileName);

  const buffer = await this.page.screenshot({
    path: filePath,
    fullPage: false
  });
  await this.attach(buffer, 'image/png');


  //await insertScreenshotRecord(
  //  this.execution_id, 1, fileName,result?.status ,this.stepdb);

  // 3. Charger steps.json existant
  const stepsJsonPath = path.join(screenshotDir, "steps.json");

  if (!fs.existsSync(stepsJsonPath)) {
    console.error("❌ steps.json missing!");
    return;
  }

  let steps = JSON.parse(fs.readFileSync(stepsJsonPath, "utf8"));

  // 4. Trouver le step exécuté
  const executedStepText = this.stepdb;

  const found = steps.find(s => s.text.includes(executedStepText));
  if (!found) {
    console.warn("⚠️ Step not found in steps.json:", executedStepText);
  } else {
    // 5. Mettre à jour le status + couleur
    const newStatus = result?.status === "PASSED" ? "success" : "error";

    found.status = newStatus;
    found.color = newStatus === "success" ? "#2ecc71" : "#e74c3c";
  }

  // 6. Sauvegarder steps.json mis à jour
  fs.writeFileSync(stepsJsonPath, JSON.stringify(steps, null, 2));

  console.log("✅ Step updated in steps.json:", executedStepText);

});

