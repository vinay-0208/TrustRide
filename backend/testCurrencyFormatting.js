import axios from 'axios';
import assert from 'assert';

const API_BASE = 'http://127.0.0.1:8000/api';

// Shared formatting function matching mobile and dashboard implementations
function formatINR(value, options = {}) {
  const { fallback = 'N/A', showSign = false } = options;
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) {
    return fallback;
  }
  const num = Number(value);
  try {
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    }).format(Math.abs(num));

    if (num < 0) return `-${formatted}`;
    if (showSign && num > 0) return `+${formatted}`;
    return formatted;
  } catch (err) {
    const absVal = Math.abs(num).toFixed(Number.isInteger(num) ? 0 : 2);
    const formatted = `₹${absVal}`;
    if (num < 0) return `-${formatted}`;
    if (showSign && num > 0) return `+${formatted}`;
    return formatted;
  }
}

async function runCurrencyTests() {
  console.log('--- TEST 1: Currency Formatter Unit Tests (formatINR) ---');

  // Standard integers
  assert.strictEqual(formatINR(100), '₹100', '100 should format as ₹100');
  assert.strictEqual(formatINR(0), '₹0', '0 should format as ₹0');
  assert.strictEqual(formatINR(500), '₹500', '500 should format as ₹500');

  // Decimal precision
  assert.strictEqual(formatINR(150.5), '₹150.50', '150.5 should format as ₹150.50');
  assert.strictEqual(formatINR(75.25), '₹75.25', '75.25 should format as ₹75.25');

  // Indian number grouping (lakhs)
  assert.strictEqual(formatINR(100000), '₹1,00,000', '100000 should use Indian grouping ₹1,00,000');

  // Negative values & sign options
  assert.strictEqual(formatINR(-25), '-₹25', '-25 should format as -₹25');
  assert.strictEqual(formatINR(25, { showSign: true }), '+₹25', '+25 with showSign should format as +₹25');
  assert.strictEqual(formatINR(0, { showSign: true }), '₹0', '0 with showSign should format as ₹0');

  // Fallbacks for null / undefined / NaN
  assert.strictEqual(formatINR(null), 'N/A', 'null should default to N/A');
  assert.strictEqual(formatINR(undefined), 'N/A', 'undefined should default to N/A');
  assert.strictEqual(formatINR(NaN), 'N/A', 'NaN should default to N/A');
  assert.strictEqual(formatINR(null, { fallback: '₹0' }), '₹0', 'custom fallback ₹0 should work');

  // Absolute absence of dollar sign
  const testValues = [100, 250.5, -50, 0, 100000];
  for (const v of testValues) {
    const formatted = formatINR(v);
    assert(!formatted.includes('$'), `Formatted value ${formatted} must not contain $`);
    assert(formatted.includes('₹'), `Formatted value ${formatted} must contain ₹`);
  }
  console.log('PASS: All formatINR unit test assertions passed.');

  console.log('\n--- TEST 2: Backend API Data & Currency Consistency ---');
  // Check health
  const healthRes = await axios.get(`${API_BASE}/trust/health`);
  assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200');

  // Check trips endpoint for pure numeric values and ₹ in events
  const tripsRes = await axios.get(`${API_BASE}/trust/trips`);
  assert.strictEqual(tripsRes.status, 200, 'Trips endpoint must return 200');
  const trips = tripsRes.data.data;
  console.log(`Inspecting ${trips.length} TripTrustRecords from Firestore...`);

  let dollarCountInEvents = 0;
  let inrCountInEvents = 0;

  for (const trip of trips) {
    // Financial values should be numbers or null (not strings with currency symbols)
    if (trip.before?.quotedFare !== null && trip.before?.quotedFare !== undefined) {
      assert(typeof trip.before.quotedFare === 'number', `quotedFare should be number: ${trip.before.quotedFare}`);
    }
    if (trip.after?.finalFare !== null && trip.after?.finalFare !== undefined) {
      assert(typeof trip.after.finalFare === 'number', `finalFare should be number: ${trip.after.finalFare}`);
    }

    // Inspect events
    if (trip.events && Array.isArray(trip.events)) {
      for (const ev of trip.events) {
        if (ev.description) {
          if (ev.description.includes('$')) dollarCountInEvents++;
          if (ev.description.includes('₹')) inrCountInEvents++;
        }
      }
    }
  }

  assert.strictEqual(dollarCountInEvents, 0, `Backend event descriptions must contain 0 dollar signs, found ${dollarCountInEvents}`);
  console.log(`PASS: 0 dollar signs found across all backend records.`);
  console.log(`PASS: Found ${inrCountInEvents} event descriptions using standard ₹ formatting.`);

  console.log('\nALL CURRENCY STANDARDIZATION AUTOMATED CHECKS PASSED!');
}

runCurrencyTests().catch(err => {
  console.error('CURRENCY TEST FAILED:', err.message);
  process.exit(1);
});
