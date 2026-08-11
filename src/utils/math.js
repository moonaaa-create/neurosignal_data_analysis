export function getRanks(arr) {
  const sorted = arr.map((val, i) => ({ val, i })).sort((a, b) => a.val - b.val);
  const ranks = new Array(arr.length);
  
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].val === sorted[i].val) {
      j++;
    }
    const rankSum = ((i + 1) + j) * (j - i) / 2;
    const avgRank = rankSum / (j - i);
    for (let k = i; k < j; k++) {
      ranks[sorted[k].i] = avgRank;
    }
    i = j;
  }
  return ranks;
}

export function pearsonCorrelation(x, y) {
  if (x.length !== y.length || x.length === 0) return 0;
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  const numerator = (n * sumXY) - (sumX * sumY);
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function spearmanCorrelation(x, y) {
  if (x.length !== y.length || x.length === 0) return 0;
  const rankX = getRanks(x);
  const rankY = getRanks(y);
  return pearsonCorrelation(rankX, rankY);
}

// Calculate FAA: ln(AF4_Alpha) - ln(AF3_Alpha)
export function calculateFAA(af3, af4) {
  if (af3 <= 0 || af4 <= 0) return 0; // Prevent log(0) or negative
  return Math.log(af4) - Math.log(af3);
}

// Calculate R_Avoidance
export function calculateRAvoidance(af3A, af4A, af3B, af4B) {
  if (af3A.length === 0) return 0;
  let avoidanceCount = 0;
  const T = Math.min(af3A.length, af4A.length, af3B.length, af4B.length);
  
  for (let t = 0; t < T; t++) {
    const faaA = calculateFAA(af3A[t], af4A[t]);
    const faaB = calculateFAA(af3B[t], af4B[t]);
    
    if (faaA < 0 || faaB < 0) {
      avoidanceCount++;
    }
  }
  return avoidanceCount / T;
}

// Calculate Final Friendship Score
export function calculateFriendshipScore(pGamma, rAvoidance, wSync = 1.0, wFaa = 0.25) {
  const pNormalized = (pGamma + 1) / 2;
  const rawScore = (wSync * pNormalized) * (1 - (wFaa * rAvoidance)) * 100;
  return Math.max(0, Math.min(100, rawScore)); // Clamp between 0 and 100
}

// =========================================
// ADVANCED 5-MODULE EEG PROCESSING FUNCTIONS
// =========================================

// Module 01 & 04: Filter Outlier Spikes (Z-Score Thresholding for EOG/EMG)
export function filterEOGOutliers(arr, zThreshold = 2.5) {
  if (arr.length === 0) return { filtered: [], outlierCount: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = Math.sqrt(arr.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / arr.length) || 1;
  
  let outlierCount = 0;
  const filtered = arr.map(val => {
    const z = Math.abs((val - mean) / std);
    if (z > zThreshold) {
      outlierCount++;
      return mean; // Replace spike artifact with mean
    }
    return val;
  });
  
  return { filtered, outlierCount };
}

// Module 03: Time-Lagged Cross Correlation (Emotional Echo Detection)
export function timeLaggedSpearmanCorrelation(x, y, maxLag = 3) {
  if (x.length === 0 || y.length === 0) return { maxCorr: 0, optimalLag: 0 };
  let bestCorr = -1;
  let bestLag = 0;
  
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let subX = [], subY = [];
    if (lag >= 0) {
      subX = x.slice(0, x.length - lag);
      subY = y.slice(lag);
    } else {
      const absLag = Math.abs(lag);
      subX = x.slice(absLag);
      subY = y.slice(0, y.length - absLag);
    }
    
    if (subX.length > 5) {
      const corr = spearmanCorrelation(subX, subY);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
  }
  
  return { maxCorr: bestCorr, optimalLag: bestLag };
}

// Module 05: Subject Baseline Log Normalization
export function normalizeLog(arr) {
  if (arr.length === 0) return arr;
  return arr.map(v => (v > 0 ? Math.log(v) : 0));
}

// Complete Advanced Comparison Pipeline
export function runAdvancedComparisonPipeline(arrGammaA, arrGammaB, af3A, af4A, af3B, af4B, wSync = 1.0, wFaa = 0.25) {
  // 1. Raw Calculation
  const rawCorr = spearmanCorrelation(arrGammaA, arrGammaB);
  const rawAvoidance = calculateRAvoidance(af3A, af4A, af3B, af4B);
  const rawScore = calculateFriendshipScore(rawCorr, rawAvoidance, wSync, wFaa);
  
  // 2. Advanced Module 01 & 04: EOG / EMG Outlier Filtering
  const cleanGammaA = filterEOGOutliers(arrGammaA);
  const cleanGammaB = filterEOGOutliers(arrGammaB);
  const totalArtifacts = cleanGammaA.outlierCount + cleanGammaB.outlierCount;
  
  // 3. Advanced Module 03: Time-Lagged Sync
  const { maxCorr: lagCorr, optimalLag } = timeLaggedSpearmanCorrelation(cleanGammaA.filtered, cleanGammaB.filtered, 3);
  
  // 4. Advanced Module 02 & 05: Filtered Avoidance
  const cleanAF3A = filterEOGOutliers(af3A).filtered;
  const cleanAF4A = filterEOGOutliers(af4A).filtered;
  const cleanAF3B = filterEOGOutliers(af3B).filtered;
  const cleanAF4B = filterEOGOutliers(af4B).filtered;
  const filteredAvoidance = calculateRAvoidance(cleanAF3A, cleanAF4A, cleanAF3B, cleanAF4B);
  
  // 5. Final Advanced Score
  const advancedScore = calculateFriendshipScore(lagCorr, filteredAvoidance, wSync, wFaa);
  
  return {
    rawScore,
    rawCorr,
    rawAvoidance,
    advancedScore,
    advancedCorr: lagCorr,
    filteredAvoidance,
    optimalLag,
    totalArtifacts,
    cleanedGammaA: cleanGammaA.filtered,
    cleanedGammaB: cleanGammaB.filtered
  };
}
