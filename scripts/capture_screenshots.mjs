import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../apps/web/node_modules/playwright");

const PROOF_DIR = path.resolve(process.cwd(), "docs", "proof");
const VIDEO_TMP = path.join(PROOF_DIR, "video_tmp");
fs.mkdirSync(PROOF_DIR, { recursive: true });
fs.mkdirSync(VIDEO_TMP, { recursive: true });

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

function findExecutable() {
  for (const p of CHROME_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const BASE_URL = process.env.DASHBOARD_URL ?? "http://127.0.0.1:3000";

async function main() {
  const executablePath = findExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });

  const consoleErrors = [];
  const pageErrors = [];

  // 1. Desktop screenshot + recorded walkthrough video
  const desktopCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO_TMP, size: { width: 1280, height: 800 } },
  });
  const page = await desktopCtx.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("text=HASH CHAIN VERIFIED", { timeout: 20000 });
  await page.waitForTimeout(700);

  const overflowDesktop = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  if (overflowDesktop) {
    throw new Error("Desktop viewport has horizontal overflow!");
  }

  await page.screenshot({
    path: path.join(PROOF_DIR, "dashboard-desktop.png"),
    fullPage: true,
  });

  // Walkthrough interactions for recorded video
  await page.getByRole("button", { name: "Mean-CVaR" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Solve" }).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Stress" }).click();
  await page.waitForTimeout(900);

  await page.evaluate(() => window.scrollTo({ top: 540, behavior: "smooth" }));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo({ top: 1080, behavior: "smooth" }));
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Recalculate FinOps" }).click();
  await page.waitForTimeout(900);

  await page.evaluate(() => window.scrollTo({ top: 1600, behavior: "smooth" }));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Toggle color theme/i }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Toggle color theme/i }).click();
  await page.waitForTimeout(600);

  const video = page.video();
  await desktopCtx.close();
  if (video) {
    const rawPath = await video.path();
    const targetWebm = path.join(PROOF_DIR, "dashboard-walkthrough.webm");
    if (fs.existsSync(targetWebm)) fs.unlinkSync(targetWebm);
    fs.renameSync(rawPath, targetWebm);
  }
  fs.rmSync(VIDEO_TMP, { recursive: true, force: true });

  // 2. Mobile 390x844 screenshot
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const mPage = await mobileCtx.newPage();
  mPage.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  mPage.on("pageerror", (err) => pageErrors.push(err.message));

  await mPage.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 });
  await mPage.waitForSelector("text=HASH CHAIN VERIFIED", { timeout: 20000 });
  await mPage.waitForTimeout(500);

  const overflowMobile = await mPage.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  if (overflowMobile) {
    throw new Error("Mobile 390x844 viewport has horizontal overflow!");
  }

  await mPage.screenshot({
    path: path.join(PROOF_DIR, "dashboard-mobile.png"),
    fullPage: true,
  });
  await mobileCtx.close();
  await browser.close();

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(
      `Browser errors detected: console=${JSON.stringify(consoleErrors)}, page=${JSON.stringify(pageErrors)}`
    );
  }
  console.log("Captured desktop, mobile, and walkthrough video successfully with 0 browser errors.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
