import { chromium } from 'playwright';

// The kit hardcodes system Chrome; use the installed full Chrome for Testing.
const launch = chromium.launch.bind(chromium);
chromium.launch = options => launch(options?.channel === 'chrome'
  ? { ...options, channel: undefined, executablePath: chromium.executablePath() }
  : options);
