/**
 * TrustRide - Financial Data Validation & Integrity Reconciliation
 *
 * Strict numeric-data validation and discrepancy calculation for Trust Records.
 * Ensures missing, null, undefined, empty, NaN, or cancellation placeholder values
 * are NEVER coerced into confirmed zero-value settlements.
 */

export const isValidFiniteNumber = (val) => {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') {
    return false;
  }
  const num = Number(val);
  return typeof num === 'number' && Number.isFinite(num);
};

export const isRecordCancelled = (record) => {
  return Boolean(record?.after?.cancellation?.cancelled);
};

export const formatINR = (value, options = {}) => {
  const { fallback = '—', showSign = false } = options;
  if (!isValidFiniteNumber(value)) {
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
  } catch {
    const absVal = Math.abs(num).toFixed(Number.isInteger(num) ? 0 : 2);
    const formatted = `\u20B9${absVal}`;
    if (num < 0) return `-${formatted}`;
    if (showSign && num > 0) return `+${formatted}`;
    return formatted;
  }
};

/**
 * Returns the genuine quoted fare if valid finite number, else null.
 */
export const getValidQuotedFare = (record) => {
  const val = record?.before?.quotedFare;
  return isValidFiniteNumber(val) ? Number(val) : null;
};

/**
 * Returns the genuine settled final fare.
 * For cancelled rides where the ride was terminated before completion,
 * the final fare is unavailable (null) rather than a verified ₹0 settlement.
 */
export const getValidFinalFare = (record) => {
  if (isRecordCancelled(record)) {
    const val = record?.after?.finalFare;
    // Only if a genuine positive settlement was recorded post-cancellation
    if (isValidFiniteNumber(val) && Number(val) > 0) {
      return Number(val);
    }
    return null;
  }
  const val = record?.after?.finalFare;
  return isValidFiniteNumber(val) ? Number(val) : null;
};

/**
 * Returns the genuine promised earnings if valid finite number, else null.
 */
export const getValidPromisedEarnings = (record) => {
  const val = record?.before?.promisedEarnings;
  return isValidFiniteNumber(val) ? Number(val) : null;
};

/**
 * Returns the genuine settled actual earnings.
 * For cancelled rides, actual earnings are unavailable (null).
 */
export const getValidActualEarnings = (record) => {
  if (isRecordCancelled(record)) {
    const val = record?.after?.earnings?.actualAmount;
    if (isValidFiniteNumber(val) && Number(val) > 0) {
      return Number(val);
    }
    return null;
  }
  const val = record?.after?.earnings?.actualAmount;
  return isValidFiniteNumber(val) ? Number(val) : null;
};

/**
 * Calculates fare discrepancy (Final Fare - Quoted Fare) strictly when
 * both operands are valid finite numbers.
 */
export const calculateFareDiscrepancy = (record) => {
  const quoted = getValidQuotedFare(record);
  const final = getValidFinalFare(record);

  if (quoted === null || final === null) {
    return {
      available: false,
      difference: null,
      status: 'INSUFFICIENT_DATA',
      display: 'Insufficient data',
      subtext: 'Requires both valid upfront quote and settled final fare'
    };
  }

  const diff = Math.round((final - quoted) * 100) / 100;
  if (diff === 0) {
    return {
      available: true,
      difference: 0,
      status: 'MATCH',
      display: '±₹0 (Match)',
      subtext: 'Quoted fare matches settled fare exactly'
    };
  }

  if (diff > 0) {
    return {
      available: true,
      difference: diff,
      status: 'SURCHARGE',
      display: formatINR(diff, { showSign: true }),
      subtext: 'Settled fare exceeds upfront quote'
    };
  }

  return {
    available: true,
    difference: diff,
    status: 'DISCOUNT',
    display: formatINR(diff, { showSign: true }),
    subtext: 'Settled fare below upfront quote'
  };
};

/**
 * Calculates driver earnings variance (Actual Earnings - Promised Earnings)
 * strictly when both operands are valid finite numbers.
 */
export const calculateEarningsVariance = (record) => {
  const promised = getValidPromisedEarnings(record);
  const actual = getValidActualEarnings(record);

  if (promised === null || actual === null) {
    return {
      available: false,
      difference: null,
      status: 'INSUFFICIENT_DATA',
      display: 'Insufficient data',
      subtext: 'Requires both valid promised earnings and settled actual payout'
    };
  }

  const diff = Math.round((actual - promised) * 100) / 100;
  if (diff === 0) {
    return {
      available: true,
      difference: 0,
      status: 'MATCH',
      display: '±₹0 (Match)',
      subtext: 'Actual payout matches promised 80% earnings exactly'
    };
  }

  if (diff > 0) {
    return {
      available: true,
      difference: diff,
      status: 'OVERPAYMENT',
      display: formatINR(diff, { showSign: true }),
      subtext: 'Actual payout exceeds promised amount'
    };
  }

  return {
    available: true,
    difference: diff,
    status: 'UNDERPAYMENT',
    display: formatINR(diff, { showSign: true }),
    subtext: 'Actual payout below promised amount'
  };
};
