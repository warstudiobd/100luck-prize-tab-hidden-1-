import { chromium } from "playwright-core";
const exe = "/home/user/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
// login as demo
await page.locator("header button", { hasText: /Login|লগইন/i }).first().click();
await page.waitForTimeout(500);
await page.locator("input").first().fill("demo");
await page.locator('input[type="password"]').fill("demo1234");
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(1500);
// launch Super Ace
await page.locator("button[aria-label='Super Ace']").first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: "/home/user/shot-game2.png" });
await browser.close();
console.log("done");
