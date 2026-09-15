const { execSync } = require('child_process');
const path = require('path');

console.log('================================================================');
console.log('🌟 RUNNING FULL API GATEWAY & RATE LIMITER TEST SUITE');
console.log('================================================================\n');

const testScripts = [
  { name: '1. Database & Schemas', file: 'src/db/test-db.js' },
  { name: '2. Security & Authentication', file: 'src/tests/test-auth.js' },
  { name: '3. Redis Rate Limiter & Headers', file: 'src/tests/test-ratelimit.js' },
  { name: '4. Reverse Proxy & Traffic Logger', file: 'src/tests/test-proxy.js' },
  { name: '5. Client Registration & Redis Metrics', file: 'src/tests/test-registration.js' },
  { name: '6. Hardening, Validation & Edge Cases', file: 'src/tests/test-hardening.js' },
];

// Resolve paths from the backend root so the runner works from any working directory
const backendRoot = path.join(__dirname, '../..');
const results = [];

for (const t of testScripts) {
  console.log(`\n----------------------------------------------------------------`);
  console.log(`▶️  Running: ${t.name}`);
  console.log(`----------------------------------------------------------------`);
  try {
    execSync(`node "${path.join(backendRoot, t.file)}"`, {
      stdio: 'inherit',
      cwd: backendRoot,
      env: { ...process.env, NODE_ENV: 'test' }, // keeps per-request traffic logging out of test output
    });
    console.log(`🎉 ${t.name} -> PASSED`);
    results.push({ name: t.name, passed: true });
  } catch (err) {
    console.error(`💥 ${t.name} -> FAILED`);
    results.push({ name: t.name, passed: false });
  }
}

const failed = results.filter((r) => !r.passed);

console.log('\n================================================================');
results.forEach((r) => console.log(`${r.passed ? '✅' : '❌'} ${r.name}`));
console.log('----------------------------------------------------------------');
if (failed.length === 0) {
  console.log('🏆 ALL TEST SUITES PASSED PERFECTLY!');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error(`❌ ${failed.length} OF ${results.length} TEST SUITES FAILED.`);
  console.log('================================================================\n');
  process.exit(1);
}
