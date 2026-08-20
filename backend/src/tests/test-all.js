const { execSync } = require('child_process');

console.log('================================================================');
console.log('🌟 RUNNING FULL API GATEWAY & RATE LIMITER TEST SUITE');
console.log('================================================================\n');

const testScripts = [
  { name: '1. Database & Schemas', cmd: 'node src/db/test-db.js' },
  { name: '2. Security & Authentication', cmd: 'node src/tests/test-auth.js' },
  { name: '3. Redis Rate Limiter & Headers', cmd: 'node src/tests/test-ratelimit.js' },
  { name: '4. Reverse Proxy & Traffic Logger', cmd: 'node src/tests/test-proxy.js' },
  { name: '5. Client Registration & Redis Metrics', cmd: 'node src/tests/test-registration.js' },
];

let allPassed = true;

for (const t of testScripts) {
  console.log(`\n----------------------------------------------------------------`);
  console.log(`▶️  Running: ${t.name}`);
  console.log(`----------------------------------------------------------------`);
  try {
    execSync(t.cmd, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`🎉 ${t.name} -> PASSED`);
  } catch (err) {
    console.error(`💥 ${t.name} -> FAILED`);
    allPassed = false;
    break;
  }
}

console.log('\n================================================================');
if (allPassed) {
  console.log('🏆 ALL TEST SUITES PASSED PERFECTLY!');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error('❌ SOME TESTS FAILED.');
  console.log('================================================================\n');
  process.exit(1);
}
