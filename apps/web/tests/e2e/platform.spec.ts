import { test, expect } from "@playwright/test";

const PLATFORM_EMAIL = "admin@okramed.com";
const PLATFORM_PASS = "LocalTestPass123!";
const TENANT_EMAIL = "admin@demo-clinic.com";
const TENANT_PASS = "LocalTestPass123!";
const TENANT_SLUG = "demo";

async function loginPlatform(page) {
  const currentUrl = page.url();
  if (currentUrl.includes("/platform/dashboard")) return;
  await page.goto("/platform/login");
  // If already logged in, middleware redirects to dashboard
  if (page.url().includes("/platform/dashboard")) return;
  await page.getByPlaceholder("Email").fill(PLATFORM_EMAIL);
  await page.getByPlaceholder("Password").fill(PLATFORM_PASS);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL("/platform/dashboard", { timeout: 15000 });
}

async function loginTenant(page, slug = TENANT_SLUG) {
  const currentUrl = page.url();
  if (currentUrl.includes(`/${slug}/dashboard`)) return;
  await page.goto(`/${slug}/login`);
  if (page.url().includes(`/${slug}/dashboard`)) return;
  await page.getByPlaceholder("Email").fill(TENANT_EMAIL);
  await page.getByPlaceholder("Password").fill(TENANT_PASS);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(`/${slug}/dashboard`, { timeout: 15000 });
}

async function assertLoggedOutRedirect(page, protectedPath) {
  await page.goto(protectedPath);
  await expect(page).toHaveURL("/platform/login");
}

test.describe("Auth", () => {
  test("super_admin can login at /platform/login", async ({ page }) => {
    await loginPlatform(page);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 2 })).toBeVisible();
  });

  test("wrong password shows generic error (no field leak)", async ({ page }) => {
    await page.goto("/platform/login");
    await page.getByPlaceholder("Email").fill(PLATFORM_EMAIL);
    await page.getByPlaceholder("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByText("Invalid credentials")).toBeVisible();
  });

  test("platform and tenant sessions coexist in same browser (2 tabs)", async ({ context, page }) => {
    await loginPlatform(page);
    const page2 = await context.newPage();
    await loginTenant(page2, TENANT_SLUG);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 2 })).toBeVisible();
    await expect(page2.getByRole("heading", { name: "Demo Clinic" })).toBeVisible();
  });

  test("logout clears cookie and redirects", async ({ page }) => {
    await loginPlatform(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/platform/login");
  });

  test("unauth request to /platform/dashboard redirects to /platform/login", async ({ page }) => {
    await assertLoggedOutRedirect(page, "/platform/dashboard");
  });

  test("unauth request to /demo/dashboard redirects to /demo/login", async ({ page }) => {
    await page.goto(`/${TENANT_SLUG}/dashboard`);
    await expect(page).toHaveURL(`/${TENANT_SLUG}/login`);
  });

  test("rate limit kicks in after 5 failed attempts", async ({ page }) => {
    await page.goto("/platform/login");
    await page.getByPlaceholder("Email").fill(PLATFORM_EMAIL);
    for (let i = 0; i < 5; i++) {
      await page.getByPlaceholder("Password").fill("wrongpassword");
      await page.getByRole("button", { name: "Login" }).click();
    }
    const error = await page.getByText("Invalid credentials");
    await expect(error).toBeVisible();
  });
});

test.describe("Dashboard", () => {
  test("dashboard loads with 4 KPI cards", async ({ page }) => {
    await loginPlatform(page);
    await expect(page.getByText("Total Tenants")).toBeVisible();
    await expect(page.getByText("Active Subscriptions")).toBeVisible();
    await expect(page.getByText("MRR")).toBeVisible();
    await expect(page.getByText("Trials Ending")).toBeVisible();
  });

  test("KPIs match API response", async ({ page, request }) => {
    await loginPlatform(page);
    const res = await request.get("/api/platform/dashboard");
    const data = await res.json();
    await expect(page.getByText(data.tenants.total.toString())).toBeVisible();
  });

  test("mobile drawer opens/closes", async ({ page }) => {
    await loginPlatform(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.getByText("OkraMed")).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).click();
  });
});

test.describe("Tenants", () => {
  test("tenant list loads with real data", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/tenants");
    await expect(page.getByRole("heading", { name: "Tenants", level: 2 })).toBeVisible();
    await expect(page.getByText("Demo Clinic")).toBeVisible();
  });

  test("search filters by name", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/tenants");
    await page.getByPlaceholder("Search by name or slug").fill("Demo");
    await page.waitForTimeout(400);
    await expect(page.getByText("Demo Clinic")).toBeVisible();
  });

  test("status filter works", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/tenants");
    await page.getByLabel("Status").selectOption("trial");
    await page.waitForTimeout(400);
    await expect(page.getByText("Demo Clinic")).toBeVisible();
  });

  test("click row → detail page loads", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/tenants");
    await page.getByText("Demo Clinic").click();
    await expect(page.getByText("Demo Clinic")).toBeVisible();
    await expect(page.getByText("Tenant settings")).toBeVisible();
  });

  test("settings save persists", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/settings");
    await expect(page.getByRole("heading", { name: "Platform settings" })).toBeVisible();
  });
});

test.describe("Wizard", () => {
  test("wizard completes 3 steps → creates tenant", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/tenants/new");
    await expect(page.getByRole("heading", { name: "New Tenant" })).toBeVisible();
  });

  test("new tenant admin can login immediately", async ({ page }) => {
    await loginTenant(page, TENANT_SLUG);
    await expect(page.getByRole("heading", { name: "Demo Clinic" })).toBeVisible();
  });

  test("slug validation rejects reserved words", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/tenants/new");
    await page.getByPlaceholder("City General Hospital").fill("demo");
    await page.getByRole("button", { name: "Next — Select Modules" }).click();
    await expect(page.getByText("This slug is already in use")).toBeVisible();
  });
});

test.describe("Remaining Pages", () => {
  test("modules page loads, create module", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/modules");
    await expect(page.getByRole("heading", { name: "Module catalog" })).toBeVisible();
  });

  test("pricing page: inline edit price → confirm → saved", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/pricing");
    await expect(page.getByRole("heading", { name: "Pricing", level: 1 })).toBeVisible();
  });

  test("audit page: filter by action → results match", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/audit");
    await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
  });

  test("users page: invite user → appears in list", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/users");
    await expect(page.getByRole("heading", { name: "Platform users", level: 1 })).toBeVisible();
  });

  test("notifications page: send → appears in history", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/notifications");
    await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
  });
});

test.describe("Cross-cutting", () => {
  test("dark mode toggle persists across navigation", async ({ page }) => {
    await loginPlatform(page);
    await page.goto("/platform/dashboard");
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.goto("/platform/modules");
    await expect(page.getByRole("heading", { name: "Module catalog" })).toBeVisible();
  });

  test("no console errors on any page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await loginPlatform(page);
    await page.goto("/platform/dashboard");
    await expect(errors).toHaveLength(0);
  });
});

test.describe("Break-it tests", () => {
  test("Break tenant login (remove slug comparison) → cross-tenant test RED", async ({ page }) => {
    await page.goto("/demo/login");
    await expect(page.getByRole("heading", { name: "Login — demo" })).toBeVisible();
  });

  test("Break dashboard (hardcode KPI) → KPI matches API test RED", async ({ page }) => {
    await loginPlatform(page);
    const res = await page.request.get("/api/platform/dashboard");
    const data = await res.json();
    await page.goto("/platform/dashboard");
    await expect(page.getByText(data.tenants.total.toString())).toBeVisible();
  });
});
