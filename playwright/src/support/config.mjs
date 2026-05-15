import { BeforeAll, AfterAll, Before, After, setDefaultTimeout } from '@cucumber/cucumber';
import { emptyCheckoutCartByApi } from '../steps/utils/functions.js';
import { createTuringExecution, reportTuringScenarioResult, completeTuringExecution, saveTuringMeta } from '../steps/utils/turing1-notifier.js';
import { getReportsDir } from '../steps/utils/paths.js';
import * as fs from 'fs';


// ─── TuringOne : état d'exécution partagé entre les hooks ───────────────────
// Populated in BeforeAll if CAMPAGNE_ID is set.
let turingExecution = null;  // { execution_id, execution_type, detail_items: [{detail_execution_id, name}] }
const _execStartMs = Date.now();

BeforeAll(async function () {
  // Nettoyer l'historique des vidéos du run précédent
  const videosDir = `${getReportsDir()}/videos`;
  if (fs.existsSync(videosDir)) {
    fs.rmSync(videosDir, { recursive: true, force: true });
    console.log(`🗑️  Vidéos précédentes supprimées : ${videosDir}`);
  }

  const campagneId = process.env.CAMPAGNE_ID ? parseInt(process.env.CAMPAGNE_ID, 10) : null;
  if (!campagneId) return;

  const environmentId = process.env.ENVIRONMENT_ID ? parseInt(process.env.ENVIRONMENT_ID, 10) : null;
  turingExecution = await createTuringExecution({
    campagne_id:    campagneId,
    campagne_type:  process.env.CAMPAGNE_TYPE || 'ui',
    executed_by:    'framework-playwright',
    environment_id: environmentId,
  });
});

AfterAll(async function () {
  const totalSec = Math.round((Date.now() - _execStartMs) / 1000);

  if (turingExecution) {
    await completeTuringExecution({
      execution_id:   turingExecution.execution_id,
      execution_type: turingExecution.execution_type,
      status:         'completed',
      duration_total: totalSec,
    });
  }

  // Sauvegarder les métadonnées dans un fichier JSON que post-run.mjs lira
  // après que Cucumber ait fini d'écrire tous les rapports HTML/JSON.
  saveTuringMeta({
    reports_dir:    getReportsDir(),
    execution_id:   turingExecution?.execution_id   || null,
    execution_type: turingExecution?.execution_type || 'ui',
    duration_total: totalSec,
  });
});

// HEADLESS=true  → navigateur invisible (CI/CD)
// HEADLESS=false ou absent → navigateur visible (défaut)
const isHeadless = process.env.HEADLESS === 'true';

const browserOptions = {
  headless: isHeadless,
  slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
  args: [
  ],
  firefoxUserPrefs: {
  },
  webkitUserPrefs: {
  }
};

const chromiumOptions = {
  headless: isHeadless,
  slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0,
  args: [
    // These args are not needed for other browsers
    // Needed for local app build testing. The SSL certificates are invalid. Chrome can bypass this issue
    '--ignore-certificate-errors',
    // Allows Chrome browser to bypass CORS issue
    '--disable-web-security',
  ],
  chromeUserPrefs: {
  }
};

const domainURL = 'XXXXXXXXXXXXXXXXXXXXXXXXXX';
const baseUrlResource = process.env.BASE_URL_RESOURCE ? process.env.BASE_URL_RESOURCE : '';
const browser = process.env.BROWSER || 'chromium';
const usedBrowserOptions = browser === 'chromium' ? chromiumOptions : browserOptions;
const trace = process.env.PLAYWRIGHT_TRACE ? true : false;

const config = {
  browser: browser,
  browserOptions: usedBrowserOptions,
  // base domain URL without trailing '/'
  domainURL: domainURL,
  baseUrlResource: baseUrlResource,
  baseURL: `${domainURL}${baseUrlResource}`, // URL we should connect at start
  device: process.env.DEVICE,
  trace: trace,
};

export { config };

setDefaultTimeout(process.env.PWDEBUG ? -1 : 30 * 1000);

Before({ tags: '@ignore' }, async function () {
  return 'skipped';
});

After(async function (scenario) {
  // ── Rapport TuringOne ──────────────────────────────────────────────────────
  if (turingExecution) {
    const rawStatus = scenario.result.status;
    const status = rawStatus === 'PASSED' ? 'passed'
                 : rawStatus === 'FAILED' ? 'failed'
                 : 'skipped';
    const durationSec = scenario.result.duration
      ? (scenario.result.duration.seconds || 0) + (scenario.result.duration.nanos || 0) / 1e9
      : 0;
    // Matching par tag @<number> ou @turing_id_<number> (priorité) puis par nom (fallback)
    const turingTag = scenario.pickle.tags?.find(t => /^@\d+$/.test(t.name) || t.name.startsWith('@turing_id_'));
    const turingId  = turingTag
      ? parseInt(turingTag.name.replace('@turing_id_', '').replace('@', ''), 10)
      : null;
    const detailItem = turingId != null
      ? turingExecution.detail_items?.find(d => d.scenario_id === turingId)
      : turingExecution.detail_items?.find(
          d => d.name.toLowerCase().trim() === scenario.pickle.name.toLowerCase().trim()
        );
    if (detailItem) {
      await reportTuringScenarioResult({
        execution_id:       turingExecution.execution_id,
        execution_type:     turingExecution.execution_type,
        detail_execution_id: detailItem.detail_execution_id,
        status,
        duration:      durationSec,
        error:         scenario.result.message || null,
        captured_logs: null,
      });
    } else {
      console.warn(`⚠️ [TuringOne] Scénario "${scenario.pickle.name}" (tag=${turingTag?.name || 'none'}) non trouvé dans detail_items`);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (scenario.result.status !== 'FAILED' && scenario.result.status !== 'PASSED')
    return;

  if (scenario.pickle.tags.some(tag => tag.name === '@emptyCheckoutCart')) {
    try {
      console.log("Executing emptyCheckoutCartByApi()");
      await emptyCheckoutCartByApi(this.page, config.baseURL);
    } catch (emptyCheckoutCartFailed) {
      console.log("Error: " + emptyCheckoutCartFailed);
    }
  }

  console.log('SCENARIO EXECUTED: ');
  console.log('\x1b[46m%s\x1b[0m', scenario.pickle.name);
  console.log('SCENARIO DURATION: ', scenario.result.duration);
  console.log('END PAGE TITLE:');
  console.log('\x1b[100m%s\x1b[0m', await this.page.title());

  try {
    if (config.browser === 'chromium') {
      // take a screenshot immediately
      const b64str = (await (await this.page.context().newCDPSession(this.page)).send('Page.captureScreenshot')).data;
      this.attach(Buffer.from(b64str, "base64"), 'image/png');
    } else {
      const screenShot = await this.page.screenshot({
        fullPage: false,
        timeout: 10 * 1000
      });
      this.attach(screenShot, 'image/png');
    }
  } catch (e) {
    console.log("Error taking screenshot : " + e);
  }

  const tracePath = './reports/traces/trace.zip';
  if (config.trace && scenario.result.status === 'FAILED') {
    try {
      await this.context.tracing.stop({ path: tracePath });
    } catch (e) {
      console.log('Trace path problem');
    }
  }

  // KEEP_VIDEOS=true → conserve toutes les vidéos sur disque pour le ZIP TuringOne
  // KEEP_VIDEOS absent → comportement original (suppression après chaque scénario)
  const keepVideos = process.env.KEEP_VIDEOS === 'true';
  const videosDir  = `${getReportsDir()}/videos`;
  var videoPath    = `${videosDir}/latest.webm`;

  if (!keepVideos) {
    if (process.env.PWDEBUG || scenario.result.status === 'PASSED') {
      console.log('SCENARIO RESULT: ');
      console.log('\x1b[42m%s\x1b[0m', scenario.result.status);
      this.page.video().delete();
    }
  } else {
    // KEEP_VIDEOS : on logue seulement le résultat, on ne supprime rien
    console.log('SCENARIO RESULT: ');
    console.log(scenario.result.status === 'PASSED' ? '\x1b[42m%s\x1b[0m' : '\x1b[41m%s\x1b[0m', scenario.result.status);
  }

  if (!process.env.PWDEBUG || scenario.result.status === 'PASSED') {
    await this.page.close();
    if (!keepVideos && scenario.result.status === 'FAILED') {
      try {
        videoPath = await this.page.video().path();
      } catch (_) {
        try {
          await this.page.video().saveAs(videoPath);
          console.log("Video path not found, using default");
        } catch (e) {
          console.log('Video error : ', e);
        }
      }
    }
    await this.context.close();  // ← finalise l'écriture de la vidéo sur disque
    await this.browser.close();
  }

  // Comportement original (sans KEEP_VIDEOS) : attacher vidéo au rapport pour FAILED
  if (!keepVideos && !process.env.PWDEBUG && scenario.result.status === 'FAILED') {
    console.log('SCENARIO RESULT: ');
    console.log('\x1b[41m%s\x1b[0m', scenario.result.status);
    const scenarioTags = scenario.pickle.tags;
    console.log('SCENARIO TAGS: ');
    scenarioTags.forEach((element, i) => {
      console.log(i + '.', element.name);
    });

    try {
      const buffer = fs.readFileSync(videoPath);
      this.attach(buffer, 'video/webm');
      fs.unlinkSync(videoPath);
    } catch (e) {
      console.log('An error happened with video : ', e);
    }
    try {
      fs.rmSync(videosDir, { recursive: true, force: true });
    } catch (e) {
      console.log('Could not cleanup videos folder');
    }

    if (config.trace) {
      try {
        const buffer2 = fs.readFileSync(tracePath);
        this.attach(buffer2, 'application/zip');
        fs.unlinkSync(tracePath);
      } catch (e) {
        console.log('An error happened with trace : ', e);
      }
    }
  }
});
