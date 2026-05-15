import { setWorldConstructor } from '@cucumber/cucumber';
import { chromium, firefox, webkit, devices } from 'playwright-extra';
import fs from 'fs';
import { config } from './config.mjs';
import { getReportsDir } from '../steps/utils/paths.js';
// import { parameter } from 'allure-js-commons';

// Load the stealth plugin & use defaults 
// A hack to hide playwright automation from reCAPTCHA
// See https://amersports.atlassian.net/browse/SYS-818 for solution
import stealth from 'puppeteer-extra-plugin-stealth';

var page;

class CustomWorld {
  constructor({ attach, parameters }) {
    this.attach = attach;
    this.parameters = parameters;
  }

  #getBrowser() {
    switch (config.browser) {
      case 'firefox':
        firefox.use(stealth());
        return firefox;
      case 'webkit':
        webkit.use(stealth());
        return webkit;
      default:
        chromium.use(stealth());
        return chromium;
    }
  }

  async openUrl(url) {
    console.log("🌍 Calling openUrl with:", url);  
  
    const device = config.device ? devices[config.device] : {};
    const browser = await this.#getBrowser().launch(config.browserOptions);
  
    // 🔐 Sécurisation des credentials
    const httpCredentials = config.credentials?.httpCredentials;
    const extraHTTPHeaders = config.credentials?.extraHTTPHeaders;
  
    const videosDir = `${getReportsDir()}/videos`;
    fs.mkdirSync(videosDir, { recursive: true });

    const context = await browser.newContext({
      ...device,
      ...(httpCredentials && { httpCredentials }),
      ...(extraHTTPHeaders && { extraHTTPHeaders }),
      recordVideo: {
        dir:  videosDir,
        size: { width: 1280, height: 720 },
      },
    });
  
    if (config.trace) {
      context.tracing.start({ screenshots: true, snapshots: true });
    }
  
    this.browser = browser;
    this.context = context;
    this.page = await context.newPage();
    page = this.page;
  
    // 💡 Skip loading problematic scripts
    await context.route('**/otBannerSdk.js', async route => {
      await route.abort();
    });
  
    page.setDefaultNavigationTimeout(40000);
    await this.page.goto(url);
    await this.page.waitForLoadState('domcontentloaded');
    console.log('\nPAGE TITLE:');
    console.log('\x1b[100m%s\x1b[0m', await this.page.title());
  }
  
}

setWorldConstructor(CustomWorld);

export { page };
