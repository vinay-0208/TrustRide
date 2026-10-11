import assert from 'node:assert';
import {
  isValidFiniteNumber,
  isRecordCancelled,
  formatINR,
  getValidQuotedFare,
  getValidFinalFare,
  getValidPromisedEarnings,
  getValidActualEarnings,
  calculateFareDiscrepancy,
  calculateEarningsVariance
} from './src/financialValidation.js';

console.log('--- STARTING FOCUSED FINANCIAL DATA VALIDATION TESTS ---\n');

// 1. Both values present and equal
{
  const record = {
    before: { quotedFare: 150, promisedEarnings: 120 },
    after: { finalFare: 150, earnings: { actualAmount: 120 }, cancellation: { cancelled: false } }
  };
  const fare = calculateFareDiscrepancy(record);
  const earn = calculateEarningsVariance(record);

  assert.strictEqual(fare.available, true, 'Test 1: Fare discrepancy should be available');
  assert.strictEqual(fare.difference, 0, 'Test 1: Fare difference should be 0');
  assert.strictEqual(fare.display, '±₹0 (Match)', 'Test 1: Fare display should be ±₹0 (Match)');

  assert.strictEqual(earn.available, true, 'Test 1: Earnings variance should be available');
  assert.strictEqual(earn.difference, 0, 'Test 1: Earnings difference should be 0');
  assert.strictEqual(earn.display, '±₹0 (Match)', 'Test 1: Earnings display should be ±₹0 (Match)');
  console.log('PASS: 1. Both values present and equal -> ±₹0 (Match)');
}

// 2. Nonzero discrepancy
{
  const record = {
    before: { quotedFare: 280, promisedEarnings: 230 },
    after: { finalFare: 335, earnings: { actualAmount: 180 }, cancellation: { cancelled: false } }
  };
  const fare = calculateFareDiscrepancy(record);
  const earn = calculateEarningsVariance(record);

  assert.strictEqual(fare.available, true, 'Test 2: Fare discrepancy should be available');
  assert.strictEqual(fare.difference, 55, 'Test 2: Fare difference should be +55');
  assert.ok(fare.display.includes('55'), 'Test 2: Fare display should contain 55');

  assert.strictEqual(earn.available, true, 'Test 2: Earnings variance should be available');
  assert.strictEqual(earn.difference, -50, 'Test 2: Earnings difference should be -50');
  assert.ok(earn.display.includes('50'), 'Test 2: Earnings display should contain 50');
  console.log('PASS: 2. Nonzero discrepancy correctly calculated (+₹55 fare, -₹50 earnings)');
}

// 3. Missing quoted fare
{
  const record = {
    before: { quotedFare: null, promisedEarnings: 100 },
    after: { finalFare: 120, earnings: { actualAmount: 100 }, cancellation: { cancelled: false } }
  };
  const fare = calculateFareDiscrepancy(record);

  assert.strictEqual(fare.available, false, 'Test 3: Fare discrepancy should be unavailable');
  assert.strictEqual(fare.display, 'Insufficient data', 'Test 3: Display should be Insufficient data');
  assert.strictEqual(getValidQuotedFare(record), null, 'Test 3: Quoted fare should be null');
  console.log('PASS: 3. Missing quoted fare -> Insufficient data (not zero or match)');
}

// 4. Missing final fare
{
  const record = {
    before: { quotedFare: 120, promisedEarnings: 96 },
    after: { finalFare: undefined, earnings: { actualAmount: 96 }, cancellation: { cancelled: false } }
  };
  const fare = calculateFareDiscrepancy(record);

  assert.strictEqual(fare.available, false, 'Test 4: Fare discrepancy should be unavailable');
  assert.strictEqual(fare.display, 'Insufficient data', 'Test 4: Display should be Insufficient data');
  assert.strictEqual(getValidFinalFare(record), null, 'Test 4: Final fare should be null');
  console.log('PASS: 4. Missing final fare -> Insufficient data');
}

// 5. Missing promised earnings
{
  const record = {
    before: { quotedFare: 100, promisedEarnings: null },
    after: { finalFare: 100, earnings: { actualAmount: 80 }, cancellation: { cancelled: false } }
  };
  const earn = calculateEarningsVariance(record);

  assert.strictEqual(earn.available, false, 'Test 5: Earnings variance should be unavailable');
  assert.strictEqual(earn.display, 'Insufficient data', 'Test 5: Display should be Insufficient data');
  assert.strictEqual(getValidPromisedEarnings(record), null, 'Test 5: Promised earnings should be null');
  console.log('PASS: 5. Missing promised earnings -> Insufficient data');
}

// 6. Missing actual earnings
{
  const record = {
    before: { quotedFare: 100, promisedEarnings: 80 },
    after: { finalFare: 100, earnings: { actualAmount: null }, cancellation: { cancelled: false } }
  };
  const earn = calculateEarningsVariance(record);

  assert.strictEqual(earn.available, false, 'Test 6: Earnings variance should be unavailable');
  assert.strictEqual(earn.display, 'Insufficient data', 'Test 6: Display should be Insufficient data');
  assert.strictEqual(getValidActualEarnings(record), null, 'Test 6: Actual earnings should be null');
  console.log('PASS: 6. Missing actual earnings -> Insufficient data');
}

// 7. Genuine zero values
{
  const record = {
    before: { quotedFare: 0, promisedEarnings: 0 },
    after: { finalFare: 0, earnings: { actualAmount: 0 }, cancellation: { cancelled: false } }
  };
  const fare = calculateFareDiscrepancy(record);
  const earn = calculateEarningsVariance(record);

  assert.strictEqual(fare.available, true, 'Test 7: Fare discrepancy should be available for genuine 0');
  assert.strictEqual(fare.difference, 0, 'Test 7: Fare difference should be 0');
  assert.strictEqual(fare.display, '±₹0 (Match)', 'Test 7: Display should be ±₹0 (Match)');

  assert.strictEqual(earn.available, true, 'Test 7: Earnings variance should be available for genuine 0');
  assert.strictEqual(earn.difference, 0, 'Test 7: Earnings difference should be 0');
  assert.strictEqual(earn.display, '±₹0 (Match)', 'Test 7: Display should be ±₹0 (Match)');

  assert.strictEqual(isValidFiniteNumber(0), true, 'Test 7: 0 is valid finite number');
  assert.strictEqual(isValidFiniteNumber(null), false, 'Test 7: null is not valid finite number');
  assert.strictEqual(isValidFiniteNumber(''), false, 'Test 7: empty string is not valid finite number');
  assert.ok(formatINR(0).includes('0'), 'Test 7: formatINR(0) should format genuine 0 with currency symbol');
  console.log('PASS: 7. Genuine zero values formatted as ₹0 and calculated as ±₹0 (Match)');
}

// 8. Cancelled records with missing financial data
{
  const record = {
    before: { quotedFare: null, promisedEarnings: null },
    after: {
      finalFare: 0, // Placeholder cancellation zero
      earnings: { actualAmount: 0 },
      cancellation: {
        cancelled: true,
        cancelledBy: 'DRIVER',
        reason: 'Emergency: flat tire'
      }
    }
  };
  const fare = calculateFareDiscrepancy(record);
  const earn = calculateEarningsVariance(record);

  assert.strictEqual(isRecordCancelled(record), true, 'Test 8: Record should be identified as cancelled');
  assert.strictEqual(getValidQuotedFare(record), null, 'Test 8: Quoted fare should be null');
  assert.strictEqual(getValidFinalFare(record), null, 'Test 8: Final fare for cancelled trip should be null (not ₹0)');
  assert.strictEqual(getValidPromisedEarnings(record), null, 'Test 8: Promised earnings should be null');
  assert.strictEqual(getValidActualEarnings(record), null, 'Test 8: Actual earnings for cancelled trip should be null (not ₹0)');

  assert.strictEqual(fare.available, false, 'Test 8: Fare discrepancy should be unavailable');
  assert.strictEqual(fare.display, 'Insufficient data', 'Test 8: Fare display should be Insufficient data');

  assert.strictEqual(earn.available, false, 'Test 8: Earnings variance should be unavailable');
  assert.strictEqual(earn.display, 'Insufficient data', 'Test 8: Earnings display should be Insufficient data');
  console.log('PASS: 8. Cancelled records with placeholder zeros correctly identified as Insufficient data (not ₹0 or Match)');
}

console.log('\nALL 8 FOCUSED FINANCIAL DATA VALIDATION TESTS PASSED CLEANLY!\n');
