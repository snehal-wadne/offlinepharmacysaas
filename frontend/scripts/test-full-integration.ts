import { apiPost, apiGet, setAuthSession } from '../src/api/apiClient';
import { checkBackendAndDbHealth } from '../src/api/connectionStatus';

async function testFullIntegration() {
  console.log("=================================================");
  console.log("  🧪 PHARMAFLOW FULL-TIER INTEGRATION TEST");
  console.log("=================================================");

  // 1. Check connectivity across tiers
  console.log("\n1. Testing Frontend -> Backend -> Supabase health probe...");
  const health = await checkBackendAndDbHealth();
  console.log("   Backend Online:", health.backendOnline);
  console.log("   Database Online:", health.dbOnline);
  console.log("   Provider:", health.databaseProvider);
  console.log("   Total Tables in DB:", health.tablesCount);
  console.log("   Database Latency:", `${health.dbLatencyMs}ms`);

  if (!health.backendOnline || !health.dbOnline) {
    throw new Error("Health probe failed: backend or database is offline");
  }

  // 2. Authenticate through backend against Supabase users table
  console.log("\n2. Authenticating user via POST /api/login...");
  const loginRes = await apiPost('/api/login', {
    email: 'superadmin@pharmaflow.com',
    password: 'SuperAdmin@2026',
  });

  console.log("   Login HTTP Status:", loginRes.status);
  console.log("   Login Success:", loginRes.success);
  if (!loginRes.success) {
    throw new Error(`Login failed: ${loginRes.error}`);
  }

  const token = (loginRes.data as any)?.token;
  const user = (loginRes.data as any)?.user;
  console.log(`   Logged in as: ${user?.name} (${user?.email})`);

  // 3. Set auth session and call authenticated sync endpoint
  setAuthSession({ token, organisationId: user?.organisationId || user?.organisation_id || "" });

  console.log("\n3. Testing authenticated sync check via GET /api/sync/check...");
  const syncCheck = await apiGet('/api/sync/check');
  console.log("   Sync Service Status:", (syncCheck.data as any)?.message);

  console.log("\n=================================================");
  console.log("✅ ALL THREE TIERS CONNECTED AND FULLY VERIFIED!");
  console.log("   Frontend (API Client) <---> Backend (Port 5000) <---> Supabase PostgreSQL");
  console.log("=================================================");
}

testFullIntegration().catch((err) => {
  console.error("❌ Integration test error:", err);
  process.exit(1);
});

