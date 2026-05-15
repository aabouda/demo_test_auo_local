// eslint-disable-next-line no-unused-vars
import { Given, When, Then, Before, After, BeforeAll, AfterAll } from '@cucumber/cucumber';
import { page } from '../support/world.mjs';

// pause execution
When('pause', async function () {
  await page.pause();
});

// debug - take a screenshot
When('(I take a )screenshot', async function () {
  await page.screenshot({
    path: 'screenshot.png',
    fullPage: false
  });
});

// explicit wait - avoid if possible
When('I wait {int} (sec)(ond)(s)', async function (sec) {
  await page.waitForTimeout(sec * 1000);
});
When('I wait {int} ms', async function (ms) {
  await page.waitForTimeout(ms);
});
