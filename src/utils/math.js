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
  if (!x || !y || x.length !== y.length || x.length === 0) return 0;
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
  if (denominator === 0 || isNaN(denominator)) return 0;
  return Math.max(-1, Math.min(1, numerator / denominator));
}

export function spearmanCorrelation(x, y) {
  if (!x || !y || x.length !== y.length || x.length === 0) return 0;
  const rankX = getRanks(x);
  const rankY = getRanks(y);
  return pearsonCorrelation(rankX, rankY);
}

// Fisher z-transformation to stabilize correlation values for averaging/aggregation
export function fisherZ(r) {
  const clamped = Math.max(-0.9999, Math.min(0.9999, r));
  return 0.5 * Math.log((1 + clamped) / (1 - clamped));
}

export function invFisherZ(z) {
  const exp2z = Math.exp(2 * z);
  return (exp2z - 1) / (exp2z + 1);
}

// Calculate Cosine Similarity between two emotional profile vectors
export function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// =========================================
// TRI-REGION (Pz, T7, T8) WEIGHTED GAMMA
// =========================================
/**
 * Computes the weighted average gamma series from Pz, T7, and T8 channels.
 * @param {Array<number>} gammaPz - Parietal gamma series
 * @param {Array<number>} gammaT7 - Left temporal gamma series
 * @param {Array<number>} gammaT8 - Right temporal gamma series
 * @param {number} wPz - Weight for Pz (default: 0.40)
 * @param {number} wT7 - Weight for T7 (default: 0.30)
 * @param {number} wT8 - Weight for T8 (default: 0.30)
 */
export function calculateWeightedGamma(gammaPz, gammaT7, gammaT8, wPz = 0.4, wT7 = 0.3, wT8 = 0.3) {
  const len = Math.max(gammaPz?.length || 0, gammaT7?.length || 0, gammaT8?.length || 0);
  if (len === 0) return [];

  const totalWeight = (wPz + wT7 + wT8) || 1.0;
  const result = [];

  for (let i = 0; i < len; i++) {
    const valPz = gammaPz && gammaPz[i] !== undefined ? gammaPz[i] : null;
    const valT7 = gammaT7 && gammaT7[i] !== undefined ? gammaT7[i] : null;
    const valT8 = gammaT8 && gammaT8[i] !== undefined ? gammaT8[i] : null;

    let weightedSum = 0;
    let actualWeight = 0;

    if (valPz !== null && !isNaN(valPz)) {
      weightedSum += valPz * wPz;
      actualWeight += wPz;
    }
    if (valT7 !== null && !isNaN(valT7)) {
      weightedSum += valT7 * wT7;
      actualWeight += wT7;
    }
    if (valT8 !== null && !isNaN(valT8)) {
      weightedSum += valT8 * wT8;
      actualWeight += wT8;
    }

    if (actualWeight > 0) {
      result.push(weightedSum / actualWeight);
    } else {
      result.push(0);
    }
  }

  return result;
}

// =========================================
// NEURO-CALIBRATED EEG SYNCHRONY SCALING
// =========================================
/**
 * Maps raw correlation r [-1, 1] to a 0-100 synchrony score using an EEG hyperscanning sigmoid curve.
 * In neuroscience, r >= 0.20 indicates significant synchrony, r >= 0.35 is very high.
 */
export function corrToNeuroScore(r) {
  if (r === undefined || r === null || isNaN(r)) return 50;
  const clamped = Math.max(-1, Math.min(1, r));
  const k = 10;
  const x0 = 0.08;
  const sigmoid = 1 / (1 + Math.exp(-k * (clamped - x0)));
  const score = sigmoid * 100;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

// Frontal Alpha Asymmetry: ln(AF4_Alpha) - ln(AF3_Alpha)
export function calculateFAA(af3, af4) {
  if (af3 <= 0 || af4 <= 0) return 0; // Prevent log(0) or negative
  return Math.log(af4) - Math.log(af3);
}

// Calculate R_Avoidance (Original discrete ratio)
export function calculateRAvoidance(af3A, af4A, af3B, af4B, threshold = -0.15) {
  if (!af3A || af3A.length === 0) return 0;
  let avoidanceCount = 0;
  const T = Math.min(af3A.length, af4A.length, af3B.length, af4B.length);
  if (T === 0) return 0;
  
  for (let t = 0; t < T; t++) {
    const faaA = calculateFAA(af3A[t], af4A[t]);
    const faaB = calculateFAA(af3B[t], af4B[t]);
    
    // Only count as avoidance when there is a significant negative frontal bias
    if (faaA < threshold || faaB < threshold) {
      avoidanceCount++;
    }
  }
  return avoidanceCount / T;
}

// Bidirectional FAA Approach-Avoidance Balance (Approach Bonus + Avoidance Penalty)
export function calculateContinuousFAABalance(af3A, af4A, af3B, af4B, wFaa = 0.25, avoidThreshold = -0.10, approachThreshold = 0.05) {
  const T = Math.min(af3A?.length || 0, af4A?.length || 0, af3B?.length || 0, af4B?.length || 0);
  if (T === 0) return { rAvoidance: 0, rApproach: 0, netApproachRate: 0, avgFaaA: 0, avgFaaB: 0, faaMultiplier: 1.0, bonusOrPenaltyPct: 0 };

  let avoidanceCount = 0;
  let approachCount = 0;
  let totalNegativeMagA = 0;
  let totalNegativeMagB = 0;
  let totalPositiveMagA = 0;
  let totalPositiveMagB = 0;
  let sumFaaA = 0;
  let sumFaaB = 0;

  for (let t = 0; t < T; t++) {
    const faaA = calculateFAA(af3A[t], af4A[t]);
    const faaB = calculateFAA(af3B[t], af4B[t]);
    sumFaaA += faaA;
    sumFaaB += faaB;

    // Avoidance detection (Withdrawal, defense)
    let isAvoid = false;
    if (faaA < avoidThreshold) {
      totalNegativeMagA += Math.abs(faaA);
      isAvoid = true;
    }
    if (faaB < avoidThreshold) {
      totalNegativeMagB += Math.abs(faaB);
      isAvoid = true;
    }
    if (isAvoid) avoidanceCount++;

    // Approach detection (Liking, positive engagement)
    let isApproach = false;
    if (faaA > approachThreshold) {
      totalPositiveMagA += faaA;
      isApproach = true;
    }
    if (faaB > approachThreshold) {
      totalPositiveMagB += faaB;
      isApproach = true;
    }
    if (isApproach) approachCount++;
  }

  const rAvoidance = avoidanceCount / T;
  const rApproach = approachCount / T;
  
  const avgNegativeIntensity = (totalNegativeMagA + totalNegativeMagB) / (2 * T);
  const avgPositiveIntensity = (totalPositiveMagA + totalPositiveMagB) / (2 * T);

  // Net approach-avoidance score
  const netApproachRate = rApproach - rAvoidance;

  let faaModifier = 0;
  if (netApproachRate >= 0) {
    // Approach Bonus (up to +12%)
    faaModifier = Math.min(0.12, wFaa * (0.6 * netApproachRate + 0.4 * Math.min(1, avgPositiveIntensity * 2)) * 0.35);
  } else {
    // Avoidance Penalty (up to -15%)
    faaModifier = -Math.min(0.15, wFaa * (0.6 * Math.abs(netApproachRate) + 0.4 * Math.min(1, avgNegativeIntensity * 2)) * 0.40);
  }

  const faaMultiplier = Math.max(0.85, Math.min(1.15, 1 + faaModifier));
  const bonusOrPenaltyPct = Math.round(faaModifier * 100 * 10) / 10;

  return {
    rAvoidance,
    rApproach,
    netApproachRate,
    faaMultiplier,
    bonusOrPenaltyPct,
    avgFaaA: sumFaaA / T,
    avgFaaB: sumFaaB / T
  };
}

// Alias for legacy compatibility
export const calculateContinuousAvoidancePenalty = calculateContinuousFAABalance;

// Calculate Friendship Score (Legacy compatibility with neuro-calibration)
export function calculateFriendshipScore(pGamma, rAvoidance, wSync = 1.0, wFaa = 0.25) {
  const baseScore = corrToNeuroScore(pGamma);
  const rawScore = (wSync * baseScore) * (1 - (wFaa * rAvoidance * 0.5));
  return Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));
}

// ================================================================
// ADVANCED TR-SEM v3.0 (Tri-Region Synchro-Emotional Model) SCORE
// ================================================================
export function calculateImprovedSyncScore({
  channelCorrs = {}, // { rPz, rT7, rT8 }
  channelWeights = { wPz: 0.4, wT7: 0.3, wT8: 0.3 },
  faaMultiplier = 1.0,
  rAvoidance = 0,
  rApproach = 0,
  bonusOrPenaltyPct = 0,
  emotionHarmony = 1.0,
  wSync = 0.80,
  wEmotion = 0.20
}) {
  // 1. Channel-wise calibrated neuro scores
  const scorePz = corrToNeuroScore(channelCorrs.rPz !== undefined ? channelCorrs.rPz : 0);
  const scoreT7 = corrToNeuroScore(channelCorrs.rT7 !== undefined ? channelCorrs.rT7 : 0);
  const scoreT8 = corrToNeuroScore(channelCorrs.rT8 !== undefined ? channelCorrs.rT8 : 0);

  // Normalize channel weights so their sum equals 1.0
  const totalWeight = ((channelWeights.wPz || 0) + (channelWeights.wT7 || 0) + (channelWeights.wT8 || 0)) || 1.0;
  const normWPz = (channelWeights.wPz || 0) / totalWeight;
  const normWT7 = (channelWeights.wT7 || 0) / totalWeight;
  const normWT8 = (channelWeights.wT8 || 0) / totalWeight;

  // Weighted channel synchrony score (directly responsive to slider adjustments)
  const weightedChannelScore = (scorePz * normWPz) + (scoreT7 * normWT7) + (scoreT8 * normWT8);

  // Bidirectional FAA Modulation: Approach Bonus (+) or Avoidance Deduction (-)
  const syncAfterFaa = Math.min(100, Math.max(0, weightedChannelScore * faaMultiplier));

  // Multi-modal fusion with Emotional harmony (Cosine similarity, scaled 0~100)
  const emotionScore = Math.max(0, Math.min(100, emotionHarmony * 100));
  const rawFinalScore = (wSync * syncAfterFaa + wEmotion * emotionScore);

  return {
    score: Math.max(0, Math.min(100, Math.round(rawFinalScore * 10) / 10)),
    baseGammaScore: Math.round(weightedChannelScore * 10) / 10,
    weightedChannelScore,
    channelContributions: {
      pz: Math.round(scorePz * normWPz * 10) / 10,
      t7: Math.round(scoreT7 * normWT7 * 10) / 10,
      t8: Math.round(scoreT8 * normWT8 * 10) / 10,
    },
    syncAfterFaa,
    syncAfterAvoidance: syncAfterFaa,
    faaMultiplier,
    bonusOrPenaltyPct,
    emotionScore
  };
}

// =========================================
// ADVANCED 5-MODULE EEG PROCESSING FUNCTIONS
// =========================================

// Module 01 & 04: Filter Outlier Spikes (Z-Score Thresholding for EOG/EMG)
export function filterEOGOutliers(arr, zThreshold = 2.0) {
  if (!arr || arr.length === 0) return { filtered: [], outlierCount: 0 };
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
export function timeLaggedPearsonCorrelation(x, y, maxLag = 3) {
  if (!x || !y || x.length === 0 || y.length === 0) return { maxCorr: 0, optimalLag: 0 };
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
      const corr = pearsonCorrelation(subX, subY);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
  }
  
  return { maxCorr: bestCorr, optimalLag: bestLag };
}

export function timeLaggedSpearmanCorrelation(x, y, maxLag = 3) {
  if (!x || !y || x.length === 0 || y.length === 0) return { maxCorr: 0, optimalLag: 0 };
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
  if (!arr || arr.length === 0) return [];
  return arr.map(v => (v > 0 ? Math.log(v) : 0));
}

// Complete Tri-Region Advanced Comparison Pipeline
export function runTriRegionPipeline({
  pzA, t7A, t8A,
  pzB, t7B, t8B,
  af3A, af4A, af3B, af4B,
  wPz = 0.4, wT7 = 0.3, wT8 = 0.3,
  wSync = 0.8, wFaa = 0.25, wEmotion = 0.2,
  emotionVecA = [], emotionVecB = []
}) {
  // 1. Calculate Weighted Integrated Gamma Series
  const rawGammaA = calculateWeightedGamma(pzA, t7A, t8A, wPz, wT7, wT8);
  const rawGammaB = calculateWeightedGamma(pzB, t7B, t8B, wPz, wT7, wT8);

  // 2. Channel-wise Individual Correlations
  const rPz = spearmanCorrelation(pzA || [], pzB || []);
  const rT7 = spearmanCorrelation(t7A || [], t7B || []);
  const rT8 = spearmanCorrelation(t8A || [], t8B || []);
  const channelCorrs = { rPz, rT7, rT8 };

  // 3. Artifact Filtering
  const cleanGammaA = filterEOGOutliers(rawGammaA);
  const cleanGammaB = filterEOGOutliers(rawGammaB);
  const cleanPzA = filterEOGOutliers(pzA || []).filtered;
  const cleanPzB = filterEOGOutliers(pzB || []).filtered;
  const cleanT7A = filterEOGOutliers(t7A || []).filtered;
  const cleanT7B = filterEOGOutliers(t7B || []).filtered;
  const cleanT8A = filterEOGOutliers(t8A || []).filtered;
  const cleanT8B = filterEOGOutliers(t8B || []).filtered;

  const totalArtifacts = cleanGammaA.outlierCount + cleanGammaB.outlierCount;

  // 4. Time-Lagged Cross Correlation on Integrated Gamma
  const { maxCorr: lagCorr, optimalLag } = timeLaggedSpearmanCorrelation(cleanGammaA.filtered, cleanGammaB.filtered, 3);

  // 5. Cleaned AF3/AF4 Avoidance & Continuous Penalty
  const cleanAF3A = filterEOGOutliers(af3A || []).filtered;
  const cleanAF4A = filterEOGOutliers(af4A || []).filtered;
  const cleanAF3B = filterEOGOutliers(af3B || []).filtered;
  const cleanAF4B = filterEOGOutliers(af4B || []).filtered;

  const continuousAvoidance = calculateContinuousAvoidancePenalty(cleanAF3A, cleanAF4A, cleanAF3B, cleanAF4B, wFaa);
  const emotionHarmony = calculateCosineSimilarity(emotionVecA, emotionVecB) || 0.85;

  // 6. Final Advanced Score (TR-SEM v3.0)
  const syncResult = calculateImprovedSyncScore({
    multiGammaCorr: lagCorr,
    channelCorrs: {
      rPz: spearmanCorrelation(cleanPzA, cleanPzB),
      rT7: spearmanCorrelation(cleanT7A, cleanT7B),
      rT8: spearmanCorrelation(cleanT8A, cleanT8B),
    },
    channelWeights: { wPz, wT7, wT8 },
    rAvoidance: continuousAvoidance.rAvoidance,
    avoidancePenalty: continuousAvoidance.penaltyFactor,
    emotionHarmony,
    wSync,
    wEmotion
  });

  return {
    rawGammaA,
    rawGammaB,
    cleanGammaA: cleanGammaA.filtered,
    cleanGammaB: cleanGammaB.filtered,
    cleanPzA, cleanPzB,
    cleanT7A, cleanT7B,
    cleanT8A, cleanT8B,
    channelCorrs,
    advancedScore: syncResult.score,
    advancedCorr: lagCorr,
    optimalLag,
    totalArtifacts,
    rAvoidance: continuousAvoidance.rAvoidance,
    avoidancePenalty: continuousAvoidance.penaltyFactor,
    emotionHarmony,
    syncResult
  };
}

// Complete Advanced Comparison Pipeline (Legacy wrapper)
export function runAdvancedComparisonPipeline(arrGammaA, arrGammaB, af3A, af4A, af3B, af4B, wSync = 1.0, wFaa = 0.25) {
  const rawCorr = spearmanCorrelation(arrGammaA, arrGammaB);
  const rawAvoidance = calculateRAvoidance(af3A, af4A, af3B, af4B);
  const rawScore = calculateFriendshipScore(rawCorr, rawAvoidance, wSync, wFaa);
  
  const cleanGammaA = filterEOGOutliers(arrGammaA);
  const cleanGammaB = filterEOGOutliers(arrGammaB);
  const totalArtifacts = cleanGammaA.outlierCount + cleanGammaB.outlierCount;
  
  const { maxCorr: lagCorr, optimalLag } = timeLaggedSpearmanCorrelation(cleanGammaA.filtered, cleanGammaB.filtered, 3);
  
  const cleanAF3A = filterEOGOutliers(af3A).filtered;
  const cleanAF4A = filterEOGOutliers(af4A).filtered;
  const cleanAF3B = filterEOGOutliers(af3B).filtered;
  const cleanAF4B = filterEOGOutliers(af4B).filtered;
  const filteredAvoidance = calculateRAvoidance(cleanAF3A, cleanAF4A, cleanAF3B, cleanAF4B);
  
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

// ================================================================
// 5-MINUTE TIMELINE & MOVING WINDOW SYNCHRONY ANALYSIS
// ================================================================
export function calculateTimeWindowSynchrony(gammaA, gammaB, windowSize = 30, stepSize = 5) {
  if (!gammaA || !gammaB || gammaA.length < 10) {
    return { minuteSegments: [], movingSyncCurve: [], peakPeriod: null, lowestPeriod: null };
  }

  const len = Math.min(gammaA.length, gammaB.length);

  // 1. Moving Window Sync Curve
  const movingSyncCurve = [];
  let maxWindowSync = -1;
  let minWindowSync = 999;
  let peakTimeSec = 0;
  let lowestTimeSec = 0;

  for (let start = 0; start + windowSize <= len; start += stepSize) {
    const end = start + windowSize;
    const subA = gammaA.slice(start, end);
    const subB = gammaB.slice(start, end);
    const corr = spearmanCorrelation(subA, subB);
    const syncPercent = corrToNeuroScore(corr);
    const centerTimeSec = Math.round(start + windowSize / 2);

    movingSyncCurve.push({
      timeSec: centerTimeSec,
      timeLabel: `${Math.floor(centerTimeSec / 60)}분 ${centerTimeSec % 60}초`,
      syncScore: Math.round(syncPercent),
      corr: parseFloat(corr.toFixed(3))
    });

    if (syncPercent > maxWindowSync) {
      maxWindowSync = syncPercent;
      peakTimeSec = centerTimeSec;
    }
    if (syncPercent < minWindowSync) {
      minWindowSync = syncPercent;
      lowestTimeSec = centerTimeSec;
    }
  }

  // 2. 1-Minute Segment Breakdown (e.g. 0-60s, 60-120s, 120-180s, 180-240s, 240-300s)
  const minuteSegments = [];
  const segmentSec = 60;
  const numSegments = Math.ceil(len / segmentSec);

  for (let m = 0; m < numSegments; m++) {
    const segStart = m * segmentSec;
    const segEnd = Math.min(len, (m + 1) * segmentSec);
    if (segEnd - segStart < 5) continue;

    const subA = gammaA.slice(segStart, segEnd);
    const subB = gammaB.slice(segStart, segEnd);
    const corr = spearmanCorrelation(subA, subB);
    const syncScore = corrToNeuroScore(corr);

    minuteSegments.push({
      segmentIndex: m + 1,
      label: `${m}분 ~ ${m + 1}분 (${segStart}s ~ ${segEnd}s)`,
      startSec: segStart,
      endSec: segEnd,
      syncScore: Math.round(syncScore),
      corr: parseFloat(corr.toFixed(3))
    });
  }

  return {
    minuteSegments,
    movingSyncCurve,
    peakPeriod: {
      timeSec: peakTimeSec,
      timeLabel: `${Math.floor(peakTimeSec / 60)}분 ${peakTimeSec % 60}초 부근`,
      score: maxWindowSync >= 0 ? Math.round(maxWindowSync) : 0
    },
    lowestPeriod: {
      timeSec: lowestTimeSec,
      timeLabel: `${Math.floor(lowestTimeSec / 60)}분 ${lowestTimeSec % 60}초 부근`,
      score: minWindowSync <= 100 ? Math.round(minWindowSync) : 0
    }
  };
}

