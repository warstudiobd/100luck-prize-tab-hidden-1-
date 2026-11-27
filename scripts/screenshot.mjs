import { chromium } from "playwright-core";
const exe = "/home/user/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "/home/user/shot-home.png" });
// open auth modal
await page.locator("header button", { hasText: /Login|লগইন/i }).first().click();
await page.waitForTimeout(700);
await page.locator("input").first().fill("demo");
await page.locator('input[type="password"]').fill("demo1234");
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(2000);
await page.screenshot({ path: "/home/user/shot-loggedin.png" });
// member tab
await page.locator("nav button", { hasText: /Member|সদস্য/i }).first().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: "/home/user/shot-member.png" });
// deposit tab
await page.locator("nav button", { hasText: /Deposit|ডিপোজিট/i }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/home/user/shot-deposit.png" });
// open a game (demo slot)
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const gameBtn = page.locator("button[aria-label='Super Ace'], button:has-text('Super Ace')").first();
await gameBtn.click();
await page.waitForTimeout(3500);
await page.screenshot({ path: "/home/user/shot-game.png" });
// spin the demo slot
await page.locator("button", { hasText: "SPIN" }).first().click().catch(() => {});
await page.waitForTimeout(1800);
await page.screenshot({ path: "/home/user/shot-spin.png" });
await browser.close();
console.log("done");
