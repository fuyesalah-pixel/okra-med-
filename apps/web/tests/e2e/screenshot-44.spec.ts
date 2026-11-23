// @vitest-environment node
import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/platform/modules", name: "modules" },
  { path: "/platform/pricing", name: "pricing" },
  { path: "/platform/settings", name: "settings" },
  { path: "/platform/audit", name: "audit" },
  { path: "/platform/users", name: "users" },
  { path: "/platform/notifications", name: "notifications" },
];

async function loginViaApi(page: import("@playwright/test").Page) {
  const res = await page.request.post("/api/platform-auth/sign-in/email", {
    data: { email: "admin@okramed.com", password: "ChangeMe123!" },
    headers: { Origin: "http://localhost:3000" },
  });
  expect(res.ok()).toBe(true);
  const headers = res.headers();
  const setCookie = headers["set-cookie"];
  if (setCookie) {
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const cookie of cookies) {
      const match = cookie.match(/^([^=]+)=([^;]+)/);
      if (match) {
        const [, name, value] = match;
        await page.context().addCookies([{
          name,
          value,
          domain: "localhost",
          path: "/",
        }]);
      }
    }
  }
}

for (const { path, name } of PAGES) {
  test(`screenshot ${name} page`, async ({ page }, testInfo) => {
    await loginViaApi(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const project = testInfo.project.name.toLowerCase().replace(/\s+/g, "-");
    await page.screenshot({
      path: `../../docs/screenshots/prompt-4.4/${name}-${project}.png`,
      fullPage: true,
    });
  });
}
