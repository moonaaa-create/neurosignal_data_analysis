import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { 
  UploadCloud, CheckCircle, Activity, Printer, Brain, Moon, Sun, 
  FileText, Compass, Zap, Sliders, ShieldCheck, 
  Cpu, Layers, Eye, RefreshCw, BarChart3, Sparkles, Network,
  Share2, ArrowRight, Check, HelpCircle
} from 'lucide-react';
import { 
  pearsonCorrelation, spearmanCorrelation, calculateRAvoidance, 
  calculateFriendshipScore, filterEOGOutliers, timeLaggedSpearmanCorrelation, 
  timeLaggedPearsonCorrelation, normalizeLog, calculateWeightedGamma, 
  calculateContinuousAvoidancePenalty, calculateCosineSimilarity, 
  calculateImprovedSyncScore, runTriRegionPipeline, calculateTimeWindowSynchrony,
  corrToNeuroScore
} from './utils/math';
import { DEFAULT_SAMPLE_A, DEFAULT_SAMPLE_B } from './utils/sampleData';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  Title,
} from 'chart.js';
import { Radar, Line } from 'react-chartjs-2';
import './index.css';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  Title
);

// Custom Plugin to draw numbers on Radar Chart
const radarDataPlugin = {
  id: 'radarDataLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      meta.data.forEach((element, index) => {
        const yOffset = i === 0 ? -15 : 15;
        ctx.fillStyle = dataset.borderColor;
        ctx.font = 'bold 14px "Outfit", sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(Math.round(dataset.data[index]), element.x, element.y + yOffset);
        ctx.shadowBlur = 0;
      });
    });
  }
};

const EMOTION_KEYS = [
  { label: 'focus (집중도)', keywords: ['focus', '집중'], desc: '현재 작업이나 대화에 얼마나 주의를 기울이고 있는지 나타냅니다.' },
  { label: 'engagement (몰입도)', keywords: ['engagement', '몰입'], desc: '상호작용에 얼마나 깊게 빠져들어 참여하고 있는지 보여줍니다.' },
  { label: 'interest (흥미도)', keywords: ['interest', '흥미'], desc: '상대방의 말이나 현재 상황에 대한 호기심과 매력도를 의미합니다.' },
  { label: 'excitement (흥분도)', keywords: ['excitement', '흥분'], desc: '긍정적이거나 각성된 감정적 에너지의 크기를 나타냅니다.' },
  { label: 'stress (스트레스)', keywords: ['stress', '스트레스'], desc: '인지적 과부하나 심리적 긴장 상태를 반영합니다.' },
  { label: 'relaxation (이완도)', keywords: ['relaxation', '이완'], desc: '심신이 안정되고 편안함을 느끼는 정도를 의미합니다.' },
];

function findColumn(headers, keywords) {
  if (!headers || !keywords) return '';
  // 1. Exact match (case insensitive)
  for (let keyword of keywords) {
    const keyLower = keyword.toLowerCase();
    for (let header of headers) {
      if (header.toLowerCase() === keyLower) return header;
    }
  }
  // 2. Prefix / Regex match
  for (let keyword of keywords) {
    const regex = new RegExp(keyword, 'i');
    for (let header of headers) {
      if (regex.test(header)) return header;
    }
  }
  return '';
}

function findNumericColumn(data, headers) {
  for (let header of headers) {
    if (data.length > 0 && typeof data[0][header] === 'number') return header;
  }
  return headers[1] || headers[0];
}

function sampleData(arr, maxPoints = 300) {
  if (!arr || arr.length <= maxPoints) return arr || [];
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0);
}

function getParticipantPersona(top1, top2) {
  if (!top1 || !top2) return { icon: '✨', badge: '정서 탐구자', tag: '균형 정서형', desc: '다채로운 정서 리듬을 보여줍니다.' };
  const str = `${top1.label} ${top2.label}`.toLowerCase();
  
  const hasFocus = str.includes('집중') || str.includes('focus');
  const hasEngage = str.includes('몰입') || str.includes('engagement');
  const hasInterest = str.includes('흥미') || str.includes('interest');
  const hasExcite = str.includes('흥분') || str.includes('excitement');
  const hasRelax = str.includes('이완') || str.includes('relaxation');
  const hasStress = str.includes('스트레스') || str.includes('stress');

  if (hasEngage && hasInterest) {
    return { icon: '💡', badge: '호기심 만렙 몰입러', tag: '지적 탐구 & 몰입형', desc: '새로운 이야기와 장면에 눈을 반짝이며 적극적으로 빠져드는 타입' };
  }
  if (hasEngage && hasFocus) {
    return { icon: '🎯', badge: '딥 포커스 탐구러', tag: '초집중 몰입형', desc: '상대방의 모든 말과 장면에 온 신경을 집중하는 몰입형 리스너' };
  }
  if (hasFocus && hasInterest) {
    return { icon: '🧠', badge: '지적 호기심 브레인', tag: '지적 탐구형', desc: '새로운 정보와 깊이 있는 주제에 대해 예리하게 반응하는 탐험가' };
  }
  if (hasEngage && hasExcite) {
    return { icon: '🔥', badge: '진심 공감 에너자이저', tag: '정서 감응형', desc: '감정의 파동에 온전히 빠져들어 깊게 함께 느끼는 찐공감러' };
  }
  if (hasInterest && hasExcite) {
    return { icon: '⚡', badge: '열정 리액션 폭격기', tag: '스파크 에너지형', desc: '상대방의 멘트에 즉각 텐션을 올리며 분위기를 주도하는 에너자이저' };
  }
  if (hasRelax && (hasEngage || hasInterest)) {
    return { icon: '☕', badge: '힐링 무드 메이커', tag: '여유 탐색형', desc: '부드럽고 편안한 분위기 속에서 상대방의 마음을 여는 힐러' };
  }
  if (hasFocus && hasRelax) {
    return { icon: '🧘', badge: '차분한 관찰형 전략가', tag: '안정 집중형', desc: '흔들림 없이 편안한 태도로 전체 맥락을 꿰뚫어 보는 타입' };
  }
  if (hasStress) {
    return { icon: '🧗', badge: '섬세한 뇌파 완벽주의자', tag: '신중 관찰형', desc: '상황을 꼼꼼하게 살피며 신중하고 세심하게 소통하는 스타일' };
  }
  return { icon: '✨', badge: `${top1.label.split(' ')[0]}·${top2.label.split(' ')[0]} 멀티 플레이어`, tag: '다채로운 정서형', desc: '다채롭고 매력적인 뇌파 리듬을 보여줍니다.' };
}

function App() {
  const [theme, setTheme] = useState('light');
  
  const [fileA, setFileA] = useState({ name: '0903_고권석_5분 영상 동시 신청.csv', count: 1, totalRows: DEFAULT_SAMPLE_A.length });
  const [fileB, setFileB] = useState({ name: '0903_문경수_5분 영상 동시 신청.csv', count: 1, totalRows: DEFAULT_SAMPLE_B.length });
  const [dataA, setDataA] = useState(DEFAULT_SAMPLE_A);
  const [dataB, setDataB] = useState(DEFAULT_SAMPLE_B);
  
  const [nameA, setNameA] = useState('고권석');
  const [nameB, setNameB] = useState('문경수');
  
  const [skipInitial, setSkipInitial] = useState(true);

  // TRI-REGION WEIGHTS (Pz, T7, T8)
  const [wPz, setWPz] = useState(0.40);
  const [wT7, setWT7] = useState(0.30);
  const [wT8, setWT8] = useState(0.30);
  const [activePreset, setActivePreset] = useState('BALANCED');

  // ALGORITHM HYPERPARAMETERS
  const [wSync, setWSync] = useState(0.80);
  const [wFaa, setWFaa] = useState(0.25);
  const [wEmotion, setWEmotion] = useState(0.20);

  // REAL-TIME EEG PROCESSING TOGGLES
  const [useEogFilter, setUseEogFilter] = useState(true);
  const [useEmgFilter, setUseEmgFilter] = useState(true);
  const [useTimeLag, setUseTimeLag] = useState(true);
  const [useLnNorm, setUseLnNorm] = useState(true);

  // UI VIEWS
  const [activeTab, setActiveTab] = useState('REPORT'); // 'REPORT', 'PROTOCOL', 'ADVANCED_PROTOCOL'
  const [radarSubject, setRadarSubject] = useState('BOTH'); // 'A', 'B', 'BOTH'
  const [reportTarget, setReportTarget] = useState('BOTH'); // 'A', 'B', 'BOTH'
  const [chartChannelView, setChartChannelView] = useState('COMBINED'); // 'COMBINED', 'PZ', 'T7', 'T8'

  const [results, setResults] = useState(null);
  const [advancedResults, setAdvancedResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  }, [theme]);

  // Initial calculation on mount
  useEffect(() => {
    computeAnalysis(DEFAULT_SAMPLE_A, DEFAULT_SAMPLE_B);
  }, []);

  // Recalculate analysis when weights or toggles change
  useEffect(() => {
    if (dataA.length && dataB.length && results) {
      handleAnalyze();
    }
  }, [wPz, wT7, wT8, useEogFilter, useEmgFilter, useTimeLag, useLnNorm, wSync, wFaa, wEmotion]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const applyPreset = (preset) => {
    setActivePreset(preset);
    if (preset === 'BALANCED') {
      setWPz(0.40); setWT7(0.30); setWT8(0.30);
    } else if (preset === 'COGNITIVE') {
      setWPz(0.60); setWT7(0.20); setWT8(0.20);
    } else if (preset === 'SOCIAL') {
      setWPz(0.20); setWT7(0.40); setWT8(0.40);
    }
  };

  const loadSampleData = () => {
    setDataA(DEFAULT_SAMPLE_A);
    setDataB(DEFAULT_SAMPLE_B);
    setFileA({ name: '0903_고권석_5분 영상 동시 신청.csv', count: 1, totalRows: DEFAULT_SAMPLE_A.length });
    setFileB({ name: '0903_문경수_5분 영상 동시 신청.csv', count: 1, totalRows: DEFAULT_SAMPLE_B.length });
    setError('');
    computeAnalysis(DEFAULT_SAMPLE_A, DEFAULT_SAMPLE_B);
  };

  // Multiple File Upload Handler (Concatenates multi-part CSV files)
  const handleMultipleFileUpload = async (files, isA) => {
    if (!files || files.length === 0) return;
    setError('');

    const fileList = Array.from(files);
    const parsedDataSets = [];

    for (const file of fileList) {
      await new Promise((resolve) => {
        Papa.parse(file, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (res) => {
            if (res.data && res.data.length > 0) {
              parsedDataSets.push({ fileName: file.name, rows: res.data });
            }
            resolve();
          },
          error: (err) => {
            setError(`파일(${file.name}) 파싱 오류: ${err.message}`);
            resolve();
          }
        });
      });
    }

    if (parsedDataSets.length === 0) {
      setError('유효한 데이터가 포함된 CSV 파일이 없습니다.');
      return;
    }

    let mergedRows = [];
    parsedDataSets.forEach(ds => {
      mergedRows = mergedRows.concat(ds.rows);
    });

    // Check if timestamp exists and sort chronologically
    const timeCol = findColumn(Object.keys(mergedRows[0] || {}), ['timestamp', 'time', '시간']);
    if (timeCol) {
      mergedRows.sort((a, b) => {
        if (a[timeCol] && b[timeCol]) {
          const tA = new Date(a[timeCol]).getTime();
          const tB = new Date(b[timeCol]).getTime();
          if (!isNaN(tA) && !isNaN(tB)) return tA - tB;
        }
        return 0;
      });
    }

    const summaryInfo = {
      name: fileList.length === 1 ? fileList[0].name : `${fileList[0].name} 외 ${fileList.length - 1}개 파일`,
      count: fileList.length,
      fileNames: fileList.map(f => f.name),
      totalRows: mergedRows.length
    };

    if (isA) {
      setFileA(summaryInfo);
      setDataA(mergedRows);
    } else {
      setFileB(summaryInfo);
      setDataB(mergedRows);
    }
  };

  const handleFileUpload = (file, isA) => {
    handleMultipleFileUpload([file], isA);
  };

  const parseEEGArrays = (customA = dataA, customB = dataB) => {
    if (!customA.length || !customB.length) return null;

    const headersA = Object.keys(customA[0]);
    const headersB = Object.keys(customB[0]);

    // Multi-channel Gamma column matchers (Prioritize Pz_gamma over general gamma)
    const colPzA = findColumn(headersA, ['pz_gamma', 'gamma_pz']) || findColumn(headersA, ['pz']) || findColumn(headersA, ['gamma', '감마']) || findNumericColumn(customA, headersA);
    const colT7A = findColumn(headersA, ['t7_gamma', 'gamma_t7', 't7']);
    const colT8A = findColumn(headersA, ['t8_gamma', 'gamma_t8', 't8']);

    const colPzB = findColumn(headersB, ['pz_gamma', 'gamma_pz']) || findColumn(headersB, ['pz']) || findColumn(headersB, ['gamma', '감마']) || findNumericColumn(customB, headersB);
    const colT7B = findColumn(headersB, ['t7_gamma', 'gamma_t7', 't7']);
    const colT8B = findColumn(headersB, ['t8_gamma', 'gamma_t8', 't8']);

    // Frontal Alpha column matchers (Prioritize AF3_alpha / AF4_alpha to avoid AF3_delta collision)
    const colAF3A = findColumn(headersA, ['af3_alpha', 'alpha_af3']) || findColumn(headersA, ['af3']);
    const colAF4A = findColumn(headersA, ['af4_alpha', 'alpha_af4']) || findColumn(headersA, ['af4']);
    const colAF3B = findColumn(headersB, ['af3_alpha', 'alpha_af3']) || findColumn(headersB, ['af3']);
    const colAF4B = findColumn(headersB, ['af4_alpha', 'alpha_af4']) || findColumn(headersB, ['af4']);

    const minLen = Math.min(customA.length, customB.length);
    let arrPzA = [], arrT7A = [], arrT8A = [];
    let arrPzB = [], arrT7B = [], arrT8B = [];
    let arrAF3A = [], arrAF4A = [];
    let arrAF3B = [], arrAF4B = [];

    const startIndex = skipInitial ? Math.min(30, Math.floor(minLen * 0.1)) : 0;

    for (let i = 0; i < minLen; i++) {
      const pzA = customA[i][colPzA];
      const pzB = customB[i][colPzB];

      if (typeof pzA === 'number' && typeof pzB === 'number') {
        arrPzA.push(pzA);
        arrPzB.push(pzB);

        // If T7/T8 columns exist, extract them, otherwise fallback to Pz
        arrT7A.push(colT7A && typeof customA[i][colT7A] === 'number' ? customA[i][colT7A] : pzA);
        arrT8A.push(colT8A && typeof customA[i][colT8A] === 'number' ? customA[i][colT8A] : pzA);

        arrT7B.push(colT7B && typeof customB[i][colT7B] === 'number' ? customB[i][colT7B] : pzB);
        arrT8B.push(colT8B && typeof customB[i][colT8B] === 'number' ? customB[i][colT8B] : pzB);

        if (colAF3A && colAF4A && typeof customA[i][colAF3A] === 'number' && typeof customA[i][colAF4A] === 'number') {
          arrAF3A.push(customA[i][colAF3A]);
          arrAF4A.push(customA[i][colAF4A]);
        }
        if (colAF3B && colAF4B && typeof customB[i][colAF3B] === 'number' && typeof customB[i][colAF4B] === 'number') {
          arrAF3B.push(customB[i][colAF3B]);
          arrAF4B.push(customB[i][colAF4B]);
        }
      }
    }

    return { 
      headersA, headersB, 
      arrPzA, arrT7A, arrT8A,
      arrPzB, arrT7B, arrT8B,
      arrAF3A, arrAF4A, arrAF3B, arrAF4B, 
      minLen, startIndex,
      hasMultiChannel: !!(colT7A && colT8A && colT7B && colT8B),
      matchedColumns: {
        colPzA: colPzA || '없음',
        colT7A: colT7A || '없음',
        colT8A: colT8A || '없음',
        colAF3A: colAF3A || '없음',
        colAF4A: colAF4A || '없음',
        colPzB: colPzB || '없음',
        colT7B: colT7B || '없음',
        colT8B: colT8B || '없음',
        colAF3B: colAF3B || '없음',
        colAF4B: colAF4B || '없음'
      }
    };
  };

  const computeAnalysis = (sourceA = dataA, sourceB = dataB) => {
    const eegData = parseEEGArrays(sourceA, sourceB);
    if (!eegData || eegData.arrPzA.length === 0) {
      setError('유효한 뇌파 데이터를 찾을 수 없습니다.');
      return;
    }

    const { 
      headersA, headersB, 
      arrPzA, arrT7A, arrT8A,
      arrPzB, arrT7B, arrT8B,
      arrAF3A, arrAF4A, arrAF3B, arrAF4B, 
      minLen, startIndex, hasMultiChannel,
      matchedColumns
    } = eegData;

    // 1. Process Raw Channels (Full 300s series)
    let pPzA = [...arrPzA], pT7A = [...arrT7A], pT8A = [...arrT8A];
    let pPzB = [...arrPzB], pT7B = [...arrT7B], pT8B = [...arrT8B];
    let pAF3A = [...arrAF3A], pAF4A = [...arrAF4A];
    let pAF3B = [...arrAF3B], pAF4B = [...arrAF4B];

    // Toggle: Ln Normalization
    if (useLnNorm) {
      pPzA = normalizeLog(pPzA); pT7A = normalizeLog(pT7A); pT8A = normalizeLog(pT8A);
      pPzB = normalizeLog(pPzB); pT7B = normalizeLog(pT7B); pT8B = normalizeLog(pT8B);
    }

    // Toggle: EOG Filter on Frontal AF3/AF4
    if (useEogFilter) {
      pAF3A = filterEOGOutliers(pAF3A).filtered;
      pAF4A = filterEOGOutliers(pAF4A).filtered;
      pAF3B = filterEOGOutliers(pAF3B).filtered;
      pAF4B = filterEOGOutliers(pAF4B).filtered;
    }

    // Toggle: EMG Outlier Filtering on high-freq Gamma channels
    if (useEmgFilter) {
      pPzA = filterEOGOutliers(pPzA).filtered;
      pT7A = filterEOGOutliers(pT7A).filtered;
      pT8A = filterEOGOutliers(pT8A).filtered;
      pPzB = filterEOGOutliers(pPzB).filtered;
      pT7B = filterEOGOutliers(pT7B).filtered;
      pT8B = filterEOGOutliers(pT8B).filtered;
    }

    // 2. Compute Tri-Region Weighted Average Gamma Time-Series (Full 300s)
    const integratedGammaA = calculateWeightedGamma(pPzA, pT7A, pT8A, wPz, wT7, wT8);
    const integratedGammaB = calculateWeightedGamma(pPzB, pT7B, pT8B, wPz, wT7, wT8);

    // Active segments for correlation analysis (skipping initial stabilization if enabled)
    const activeIntA = integratedGammaA.slice(startIndex);
    const activeIntB = integratedGammaB.slice(startIndex);
    const activePzA = pPzA.slice(startIndex);
    const activePzB = pPzB.slice(startIndex);
    const activeT7A = pT7A.slice(startIndex);
    const activeT7B = pT7B.slice(startIndex);
    const activeT8A = pT8A.slice(startIndex);
    const activeT8B = pT8B.slice(startIndex);
    const activeAF3A = pAF3A.slice(startIndex);
    const activeAF4A = pAF4A.slice(startIndex);
    const activeAF3B = pAF3B.slice(startIndex);
    const activeAF4B = pAF4B.slice(startIndex);

    // 3. Time-Lag or Standard Correlation on Integrated Gamma
    let pGamma = 0;
    let detectedLag = 0;
    if (useTimeLag) {
      const lagRes = timeLaggedSpearmanCorrelation(activeIntA, activeIntB, 3);
      pGamma = lagRes.maxCorr;
      detectedLag = lagRes.optimalLag;
    } else {
      pGamma = spearmanCorrelation(activeIntA, activeIntB);
    }

    // 4. Channel-by-Channel Correlation Coefficients
    const rPz = spearmanCorrelation(activePzA, activePzB);
    const rT7 = spearmanCorrelation(activeT7A, activeT7B);
    const rT8 = spearmanCorrelation(activeT8A, activeT8B);

    // 5. Emotional Profile Extraction & Cosine Similarity
    let emotionColsA = EMOTION_KEYS.map(e => findColumn(headersA, e.keywords));
    let emotionColsB = EMOTION_KEYS.map(e => findColumn(headersB, e.keywords));

    let emotionsA = {};
    let emotionsB = {};
    EMOTION_KEYS.forEach(e => { emotionsA[e.label] = 0; emotionsB[e.label] = 0; });
    let validCount = 0;

    for (let i = startIndex; i < minLen; i++) {
      validCount++;
      EMOTION_KEYS.forEach((e, idx) => {
        if (emotionColsA[idx] && typeof sourceA[i][emotionColsA[idx]] === 'number') {
          emotionsA[e.label] += sourceA[i][emotionColsA[idx]];
        }
        if (emotionColsB[idx] && typeof sourceB[i][emotionColsB[idx]] === 'number') {
          emotionsB[e.label] += sourceB[i][emotionColsB[idx]];
        }
      });
    }

    if (validCount > 0) {
      EMOTION_KEYS.forEach((e) => {
        emotionsA[e.label] /= validCount;
        emotionsB[e.label] /= validCount;
      });
    }

    let maxVal = 0;
    EMOTION_KEYS.forEach(e => {
      if (emotionsA[e.label] > maxVal) maxVal = emotionsA[e.label];
      if (emotionsB[e.label] > maxVal) maxVal = emotionsB[e.label];
    });

    if (maxVal > 0 && maxVal <= 1.0) {
      EMOTION_KEYS.forEach(e => {
        emotionsA[e.label] = Math.round(emotionsA[e.label] * 100);
        emotionsB[e.label] = Math.round(emotionsB[e.label] * 100);
      });
    } else {
      EMOTION_KEYS.forEach(e => {
        emotionsA[e.label] = Math.round(emotionsA[e.label]);
        emotionsB[e.label] = Math.round(emotionsB[e.label]);
      });
    }

    const emotionVecA = EMOTION_KEYS.map(e => emotionsA[e.label] || 50);
    const emotionVecB = EMOTION_KEYS.map(e => emotionsB[e.label] || 50);
    const emotionHarmony = calculateCosineSimilarity(emotionVecA, emotionVecB);

    // 6. Bidirectional FAA Approach-Avoidance Balance (Approach Bonus + Avoidance Deduction)
    const faaResult = calculateContinuousFAABalance(activeAF3A, activeAF4A, activeAF3B, activeAF4B, wFaa);
    
    // 7. Advanced TR-SEM v3.0 Final Score with FAA modulation
    const syncCalculation = calculateImprovedSyncScore({
      channelCorrs: { rPz, rT7, rT8 },
      channelWeights: { wPz, wT7, wT8 },
      faaMultiplier: faaResult.faaMultiplier,
      rAvoidance: faaResult.rAvoidance,
      rApproach: faaResult.rApproach,
      bonusOrPenaltyPct: faaResult.bonusOrPenaltyPct,
      emotionHarmony,
      wSync,
      wEmotion
    });

    const score = syncCalculation.score;

    let titleStr = '';
    let descStr = '';
    let tierLevel = 5;
    
    if (score >= 80) {
      tierLevel = 1; titleStr = '이심전심, 텔레파시!';
      descStr = '말하지 않아도 통하는 완벽한 뇌파 동기화 상태입니다. Pz(주의)와 T7/T8(대화·공감) 3개 전극 전반에서 주파수가 일치하며 강한 정서적 유대감이 증명됩니다.';
    } else if (score >= 60) {
      tierLevel = 2; titleStr = '선물 같은 낯가림';
      descStr = '서로에게 깊게 공감하고 있으며, 언어적 소통과 감정의 파동이 안정적으로 맞물려 돌아가고 있습니다. 긍정적인 상호작용이 두드러집니다.';
    } else if (score >= 40) {
      tierLevel = 3; titleStr = '조금씩 맞춰가는 주파수';
      descStr = '서서히 서로의 감정에 동화되고 있습니다. 서로의 대화 템포와 관심사를 탐색하며 공감대를 형성해가는 단계입니다.';
    } else if (score >= 20) {
      tierLevel = 4; titleStr = '아슬아슬한 평행선';
      descStr = '현재 서로 다른 생각에 집중하고 있거나, 무의식적인 심리적 거리감과 방어 기제가 작용하고 있습니다.';
    } else {
      tierLevel = 5; titleStr = '지구와 안드로메다';
      descStr = '상대방을 향한 회피 반응이 높거나 전혀 다른 주파수 대역에 머물고 있습니다. 편안한 라포 형성이 먼저 필요합니다.';
    }

    // 8. 5-Minute Timeline & Moving Window Synchrony
    const timelineAnalysis = calculateTimeWindowSynchrony(integratedGammaA, integratedGammaB, 30, 5);

    setResults({
      score, titleStr, descStr, tierLevel, emotionsA, emotionsB,
      pGamma, 
      rAvoidance: faaResult.rAvoidance, 
      rApproach: faaResult.rApproach,
      netApproachRate: faaResult.netApproachRate,
      faaMultiplier: faaResult.faaMultiplier,
      bonusOrPenaltyPct: faaResult.bonusOrPenaltyPct,
      avgFaaA: faaResult.avgFaaA,
      avgFaaB: faaResult.avgFaaB,
      discountPercent: faaResult.bonusOrPenaltyPct,
      emotionHarmony,
      channelCorrs: { rPz, rT7, rT8 },
      weights: { wPz, wT7, wT8 },
      syncCalculation,
      hasMultiChannel,
      matchedColumns,
      timelineAnalysis,
      totalDurationSec: minLen - startIndex,
      sampledIntegratedA: sampleData(integratedGammaA),
      sampledIntegratedB: sampleData(integratedGammaB),
      sampledPzA: sampleData(pPzA),
      sampledPzB: sampleData(pPzB),
      sampledT7A: sampleData(pT7A),
      sampledT7B: sampleData(pT7B),
      sampledT8A: sampleData(pT8A),
      sampledT8B: sampleData(pT8B),
      date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    });
  };

  const handleAnalyze = () => {
    computeAnalysis(dataA, dataB);
  };

  // Dynamic Chart Colors
  const gridColor = theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  const textColor = theme === 'light' ? '#64748b' : '#94a3b8';

  // Dynamic Multi-channel Chart Data based on selected tab
  const getSelectedChartDatasets = () => {
    if (!results) return null;

    let dataA_series = results.sampledIntegratedA;
    let dataB_series = results.sampledIntegratedB;
    let labelSuffix = '통합 가중평균';

    if (chartChannelView === 'PZ') {
      dataA_series = results.sampledPzA;
      dataB_series = results.sampledPzB;
      labelSuffix = 'Pz(두정엽·집중)';
    } else if (chartChannelView === 'T7') {
      dataA_series = results.sampledT7A;
      dataB_series = results.sampledT7B;
      labelSuffix = 'T7(좌측두엽·언어)';
    } else if (chartChannelView === 'T8') {
      dataA_series = results.sampledT8A;
      dataB_series = results.sampledT8B;
      labelSuffix = 'T8(우측두엽·공감)';
    }

    return {
      labels: Array.from({ length: dataA_series.length }, (_, i) => i + 1),
      datasets: [
        {
          label: `${nameA} [${labelSuffix}]`,
          data: dataA_series,
          borderColor: theme === 'light' ? '#2563eb' : '#3b82f6',
          backgroundColor: theme === 'light' ? 'rgba(37, 99, 235, 0.12)' : 'rgba(59, 130, 246, 0.15)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 0
        },
        {
          label: `${nameB} [${labelSuffix}]`,
          data: dataB_series,
          borderColor: theme === 'light' ? '#9333ea' : '#a855f7',
          backgroundColor: theme === 'light' ? 'rgba(147, 51, 234, 0.12)' : 'rgba(168, 85, 247, 0.15)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointRadius: 0
        }
      ]
    };
  };

  const lineChartData = results ? getSelectedChartDatasets() : null;

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: textColor, font: { family: 'Noto Sans KR', size: 12 } } },
      tooltip: {
        callbacks: {
          title: (items) => {
            if (!items || !items.length) return '';
            const sec = parseInt(items[0].label) || 0;
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `시간: ${sec}초 (${m > 0 ? `${m}분 ` : ''}${s}초)`;
          }
        }
      }
    },
    scales: {
      x: { 
        title: { display: true, text: '시간 흐름 (Time / Sec - 0초 ~ 300초 / 5분 전체)', color: textColor, font: { family: 'Noto Sans KR', size: 11, weight: 'bold' } },
        grid: { color: gridColor }, 
        ticks: { 
          color: textColor, 
          font: { size: 10 },
          maxTicksLimit: 11,
          callback: function(val) {
            const sec = parseInt(this.getLabelForValue(val)) || 0;
            if (sec % 60 === 0) return `${sec}s (${sec / 60}분)`;
            return `${sec}s`;
          }
        } 
      },
      y: { 
        title: { display: true, text: '감마파 전력 밀도 (Gamma Power / μV²)', color: textColor, font: { family: 'Noto Sans KR', size: 11, weight: 'bold' } },
        grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } 
      }
    }
  };

  const radarData = results ? {
    labels: EMOTION_KEYS.map(e => e.label.split(' ')[0].toUpperCase()),
    datasets: radarSubject === 'BOTH' ? [
      {
        label: nameA, data: EMOTION_KEYS.map(e => results.emotionsA[e.label]),
        backgroundColor: theme === 'light' ? 'rgba(37, 99, 235, 0.2)' : 'rgba(59, 130, 246, 0.25)',
        borderColor: theme === 'light' ? '#2563eb' : 'rgba(59, 130, 246, 1)', borderWidth: 2, pointRadius: 5
      },
      {
        label: nameB, data: EMOTION_KEYS.map(e => results.emotionsB[e.label]),
        backgroundColor: theme === 'light' ? 'rgba(147, 51, 234, 0.2)' : 'rgba(168, 85, 247, 0.25)',
        borderColor: theme === 'light' ? '#9333ea' : 'rgba(168, 85, 247, 1)', borderWidth: 2, pointRadius: 5
      }
    ] : [
      {
        label: radarSubject === 'A' ? nameA : nameB,
        data: EMOTION_KEYS.map(e => radarSubject === 'A' ? results.emotionsA[e.label] : results.emotionsB[e.label]),
        backgroundColor: radarSubject === 'A' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(168, 85, 247, 0.3)',
        borderColor: radarSubject === 'A' ? '#2563eb' : '#9333ea', borderWidth: 2.5, pointRadius: 5
      }
    ]
  } : null;

  const radarOptions = {
    layout: { padding: 10 },
    scales: {
      r: { min: 0, max: 100, angleLines: { color: gridColor }, grid: { color: gridColor }, pointLabels: { color: theme === 'light' ? '#0f172a' : '#f8fafc', font: { family: 'Outfit', size: 15, weight: 800 } }, ticks: { display: false } }
    },
    plugins: { legend: { display: radarSubject === 'BOTH' } }, maintainAspectRatio: false
  };

  const movingSyncChartData = results && results.timelineAnalysis?.movingSyncCurve?.length > 0 ? {
    labels: results.timelineAnalysis.movingSyncCurve.map(p => `${p.timeSec}s`),
    datasets: [
      {
        label: '30초 이동 윈도우 동조율 (%)',
        data: results.timelineAnalysis.movingSyncCurve.map(p => p.syncScore),
        borderColor: '#10b981',
        backgroundColor: theme === 'light' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.20)',
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 6
      }
    ]
  } : null;

  const movingSyncChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: textColor, font: { family: 'Noto Sans KR', size: 12 } } }
    },
    scales: {
      x: { 
        title: { display: true, text: '실험 진행 시간 (Time / Sec)', color: textColor, font: { family: 'Noto Sans KR', size: 11, weight: 'bold' } },
        grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } 
      },
      y: { 
        min: 0,
        max: 100,
        title: { display: true, text: '구간 뇌파 동조율 (%)', color: textColor, font: { family: 'Noto Sans KR', size: 11, weight: 'bold' } },
        grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } 
      }
    }
  };

  const getTargetScore = (key) => {
    if (!results) return 0;
    if (reportTarget === 'A') return results.emotionsA[key] || 0;
    if (reportTarget === 'B') return results.emotionsB[key] || 0;
    return Math.round(((results.emotionsA[key] || 0) + (results.emotionsB[key] || 0)) / 2);
  };

  const targetStress = getTargetScore('stress (스트레스)');
  const targetEngagement = getTargetScore('engagement (몰입도)');
  const targetInterest = getTargetScore('interest (흥미도)');
  
  let targetName = '평균';
  if (reportTarget === 'A') targetName = `${nameA}님`;
  else if (reportTarget === 'B') targetName = `${nameB}님`;

  return (
    <div className="app-container">
      
      <button className="theme-toggle-btn no-print" onClick={toggleTheme}>
        {theme === 'dark' ? <><Sun size={18} /> Light Mode</> : <><Moon size={18} /> Dark Mode</>}
      </button>

      {/* ALWAYS VISIBLE MAIN VIEW TABS */}
      <div className="view-mode-tabs no-print" style={{ marginBottom: '2rem' }}>
        <button 
          className={`view-tab-btn ${activeTab === 'REPORT' ? 'active' : ''}`}
          onClick={() => setActiveTab('REPORT')}
        >
          <FileText size={18} /> 3채널 뇌파 동기화 리포트
        </button>
        <button 
          className={`view-tab-btn ${activeTab === 'PROTOCOL' ? 'active' : ''}`}
          onClick={() => setActiveTab('PROTOCOL')}
        >
          <Compass size={18} /> 3영역(Pz·T7·T8) 모델 & 기본 제안서
        </button>
        <button 
          className={`view-tab-btn ${activeTab === 'ADVANCED_PROTOCOL' ? 'advanced-active' : ''}`}
          onClick={() => setActiveTab('ADVANCED_PROTOCOL')}
        >
          <Sliders size={18} /> ⚡ 고도화 알고리즘 & TR-SEM v3.0 수식
        </button>
      </div>

      {/* TAB 1: REPORT VIEW */}
      {activeTab === 'REPORT' && (
        <>
          {/* Settings & Upload UI */}
          <div className="settings-panel no-print">
            
            <div className="settings-header-row">
              <div>
                <h3 className="section-title"><Brain size={20} className="title-icon" /> 참여자 설정 및 멀티채널 가중치 튜닝</h3>
                <p className="section-desc">Pz(두정엽), T7(좌측두엽), T8(우측두엽)의 감마파 가중평균 비율을 설정하고 CSV 데이터를 로드합니다.</p>
              </div>
              <button className="btn btn-sample" onClick={loadSampleData}>
                <Sparkles size={16} /> 3채널 샘플 데이터 원클릭 로드
              </button>
            </div>

            <div className="settings-grid">
              <div className="input-group">
                <label>참여자 A 이름</label>
                <input type="text" value={nameA} onChange={(e) => setNameA(e.target.value)} />
              </div>
              <div className="input-group">
                <label>참여자 B 이름</label>
                <input type="text" value={nameB} onChange={(e) => setNameB(e.target.value)} />
              </div>
              <div className="input-group">
                <label>데이터 노이즈 제거 (초반 10%)</label>
                <select value={skipInitial} onChange={(e) => setSkipInitial(e.target.value === 'true')}>
                  <option value="true">적용함 (센서 안정화 권장)</option>
                  <option value="false">미적용</option>
                </select>
              </div>
            </div>

            {/* TRI-REGION WEIGHT TUNER & PRESETS */}
            <div className="weights-tuning-box">
              <div className="weights-header">
                <div className="weights-title">
                  <Network size={18} style={{ color: 'var(--accent-teal)' }} />
                  <span>3대 뇌파 전극 영역 가중치 모델 (Tri-Region Weight Model)</span>
                </div>
                <div className="preset-buttons-group">
                  <button 
                    className={`preset-btn ${activePreset === 'BALANCED' ? 'active' : ''}`}
                    onClick={() => applyPreset('BALANCED')}
                  >
                    🎯 균형 모드 (4:3:3)
                  </button>
                  <button 
                    className={`preset-btn ${activePreset === 'COGNITIVE' ? 'active' : ''}`}
                    onClick={() => applyPreset('COGNITIVE')}
                  >
                    💡 인지·몰입 중심 (6:2:2)
                  </button>
                  <button 
                    className={`preset-btn ${activePreset === 'SOCIAL' ? 'active' : ''}`}
                    onClick={() => applyPreset('SOCIAL')}
                  >
                    🗣️ 대화·공감 중심 (2:4:4)
                  </button>
                </div>
              </div>

              <div className="weight-sliders-grid">
                
                <div className="weight-slider-card">
                  <div className="slider-label-row">
                    <span className="channel-badge pz">Pz (두정엽)</span>
                    <span className="channel-role">고차원 인지 / 주의 집중</span>
                    <span className="weight-val">{Math.round(wPz * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="0.8" step="0.05" value={wPz} 
                    onChange={(e) => { setWPz(parseFloat(e.target.value)); setActivePreset('CUSTOM'); }}
                  />
                </div>

                <div className="weight-slider-card">
                  <div className="slider-label-row">
                    <span className="channel-badge t7">T7 (좌측두엽)</span>
                    <span className="channel-role">언어 이해 / 대화 소통</span>
                    <span className="weight-val">{Math.round(wT7 * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="0.8" step="0.05" value={wT7} 
                    onChange={(e) => { setWT7(parseFloat(e.target.value)); setActivePreset('CUSTOM'); }}
                  />
                </div>

                <div className="weight-slider-card">
                  <div className="slider-label-row">
                    <span className="channel-badge t8">T8 (우측두엽)</span>
                    <span className="channel-role">정서적 억양 / 비언어 공감</span>
                    <span className="weight-val">{Math.round(wT8 * 100)}%</span>
                  </div>
                  <input 
                    type="range" min="0.1" max="0.8" step="0.05" value={wT8} 
                    onChange={(e) => { setWT8(parseFloat(e.target.value)); setActivePreset('CUSTOM'); }}
                  />
                </div>

              </div>

              <div className="weight-formula-note">
                <div style={{ marginBottom: '0.4rem' }}>
                  📐 <strong>3영역 가중 동기화 공식</strong>: 
                  <span> Pz({Math.round((wPz / ((wPz + wT7 + wT8) || 1)) * 100)}%) + T7({Math.round((wT7 / ((wPz + wT7 + wT8) || 1)) * 100)}%) + T8({Math.round((wT8 / ((wPz + wT7 + wT8) || 1)) * 100)}%)</span>
                </div>
                {results && results.syncCalculation && results.syncCalculation.channelContributions && (
                  <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-main)', marginTop: '0.4rem', padding: '0.4rem 0.6rem', background: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                    <span>🔵 Pz 기여: <strong>{results.syncCalculation.channelContributions.pz}점</strong></span>
                    <span>🟢 T7 기여: <strong>{results.syncCalculation.channelContributions.t7}점</strong></span>
                    <span>🟣 T8 기여: <strong>{results.syncCalculation.channelContributions.t8}점</strong></span>
                    <span>➔ 뇌파 가중합: <strong>{results.syncCalculation.baseGammaScore}점</strong> (정서 결합 최종 점수: <strong>{results.score}점</strong>)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="upload-grid">
              <div className={`upload-card ${fileA ? 'has-file' : ''}`}>
                <input 
                  type="file" 
                  accept=".csv" 
                  multiple 
                  className="file-input" 
                  onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleMultipleFileUpload(e.target.files, true); }} 
                />
                {fileA ? <CheckCircle className="upload-icon" /> : <UploadCloud className="upload-icon" />}
                <h3 title={fileA ? fileA.name : ''}>{fileA ? fileA.name : '참여자 A CSV 업로드 (다중 파일 가능)'}</h3>
                <p>
                  {fileA 
                    ? `✓ ${fileA.count || 1}개 파일 로드 완료 (총 ${fileA.totalRows || dataA.length}개 데이터)` 
                    : '5분간의 분할 CSV들을 한 번에 드래그하여 업로드'}
                </p>
                {fileA && fileA.count > 1 && (
                  <div className="multi-file-badge">📂 {fileA.count}개 분할 파일 자동 시간순 병합됨</div>
                )}
              </div>
              <div className={`upload-card ${fileB ? 'has-file' : ''}`}>
                <input 
                  type="file" 
                  accept=".csv" 
                  multiple 
                  className="file-input" 
                  onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleMultipleFileUpload(e.target.files, false); }} 
                />
                {fileB ? <CheckCircle className="upload-icon" /> : <UploadCloud className="upload-icon" />}
                <h3 title={fileB ? fileB.name : ''}>{fileB ? fileB.name : '참여자 B CSV 업로드 (다중 파일 가능)'}</h3>
                <p>
                  {fileB 
                    ? `✓ ${fileB.count || 1}개 파일 로드 완료 (총 ${fileB.totalRows || dataB.length}개 데이터)` 
                    : '5분간의 분할 CSV들을 한 번에 드래그하여 업로드'}
                </p>
                {fileB && fileB.count > 1 && (
                  <div className="multi-file-badge">📂 {fileB.count}개 분할 파일 자동 시간순 병합됨</div>
                )}
              </div>
            </div>

            {error && <div style={{ color: '#ef4444', textAlign: 'center', marginBottom: '1rem', fontWeight: 'bold' }}>{error}</div>}

            <div className="action-row">
              <button className="btn btn-primary" disabled={!fileA || !fileB} onClick={handleAnalyze}>
                <Brain size={20} />
                3채널 동기화 프리미엄 리포트 생성
              </button>
              {results && (
                <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                  <select 
                    className="btn btn-secondary" 
                    value={reportTarget} 
                    onChange={e => setReportTarget(e.target.value)}
                    style={{ appearance: 'auto', paddingRight: '2rem' }}
                  >
                    <option value="BOTH">공통 (두 사람 모두)</option>
                    <option value="A">{nameA}님 맞춤형</option>
                    <option value="B">{nameB}님 맞춤형</option>
                  </select>
                  <button className="btn btn-secondary" onClick={() => window.print()}>
                    <Printer size={20} />
                    PDF 리포트 인쇄
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* REAL-TIME EEG PROCESSING TOGGLES */}
          <div className="processing-toggles-section no-print">
            <div className="toggles-title">
              <Sliders size={18} /> 🎛️ 뇌파 전처리 알고리즘 스위치
            </div>
            <div className="processing-toggles-grid">
              
              <div className={`toggle-card ${useEogFilter ? 'active' : ''}`} onClick={() => setUseEogFilter(!useEogFilter)}>
                <div className="toggle-label-wrap">
                  <Eye size={18} style={{ color: useEogFilter ? 'var(--accent-teal)' : 'var(--text-muted)' }} />
                  <span>EOG 눈 깜빡임 제거 (AF3/AF4)</span>
                </div>
                <div className="toggle-switch-pill" />
              </div>

              <div className={`toggle-card ${useEmgFilter ? 'active' : ''}`} onClick={() => setUseEmgFilter(!useEmgFilter)}>
                <div className="toggle-label-wrap">
                  <Activity size={18} style={{ color: useEmgFilter ? 'var(--accent-teal)' : 'var(--text-muted)' }} />
                  <span>EMG 턱 근육노이즈 정화 (Gamma)</span>
                </div>
                <div className="toggle-switch-pill" />
              </div>

              <div className={`toggle-card ${useTimeLag ? 'active' : ''}`} onClick={() => setUseTimeLag(!useTimeLag)}>
                <div className="toggle-label-wrap">
                  <RefreshCw size={18} style={{ color: useTimeLag ? 'var(--accent-teal)' : 'var(--text-muted)' }} />
                  <span>Time-Lag 반응지연 교차보정</span>
                </div>
                <div className="toggle-switch-pill" />
              </div>

              <div className={`toggle-card ${useLnNorm ? 'active' : ''}`} onClick={() => setUseLnNorm(!useLnNorm)}>
                <div className="toggle-label-wrap">
                  <Layers size={18} style={{ color: useLnNorm ? 'var(--accent-teal)' : 'var(--text-muted)' }} />
                  <span>두개골 두께 개인차 Ln 정규화</span>
                </div>
                <div className="toggle-switch-pill" />
              </div>

            </div>
          </div>

          {/* PDF Report Area */}
          {results && (
            <div className="report-container">
              <div className="report-inner">
                
                {/* PAGE 1 CONTENT */}
                <div className="report-header">
                  <div>
                    <div className="brand-title">NeuroSignal Tri-Region EEG Analysis</div>
                    <h1 className="report-title">
                      3영역 뇌파 동기화 <br/>종합 분석 결과 리포트
                    </h1>
                    {reportTarget !== 'BOTH' && (
                      <div style={{ marginTop: '0.5rem', fontSize: '1.2rem', color: 'var(--accent-teal)', fontWeight: '600' }}>
                        - {targetName} 맞춤형 리포트 -
                      </div>
                    )}
                  </div>
                  <div className="report-meta">
                    <div className="date-badge">Analysis Date: {results.date}</div>
                    
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                      적용 가중치: Pz({Math.round(wPz*100)}%) · T7({Math.round(wT7*100)}%) · T8({Math.round(wT8*100)}%)
                    </div>

                    <div className="participant-info">
                      <div className="participant-badge badge-a">
                        <span className="badge-indicator"></span>
                        참여자 A: {nameA}님
                      </div>
                      <div className="participant-badge badge-b">
                        <span className="badge-indicator"></span>
                        참여자 B: {nameB}님
                      </div>
                    </div>
                  </div>
                </div>

                {/* OVERALL SCORE SUMMARY CARD */}
                <div className="score-summary-card">
                  <div className="score-display">
                    <div className="score-value">{Math.round(results.score)}</div>
                    <div className="score-label">Synchronization Index (TR-SEM v3.0)</div>
                  </div>
                  <div className="tier-display">
                    <div className="tier-title">{results.titleStr}</div>
                    <div className="tier-description">{results.descStr}</div>
                    
                    <ul className="tier-explanation-list">
                      <li className={results.tierLevel === 1 ? 'active' : ''}>
                        <span className="range">100 ~ 80</span> 이심전심, 말하지 않아도 통하는 텔레파시!
                      </li>
                      <li className={results.tierLevel === 2 ? 'active' : ''}>
                        <span className="range">80 ~ 60</span> 선물 같은 낯가림 (정서적 교감 우수)
                      </li>
                      <li className={results.tierLevel === 3 ? 'active' : ''}>
                        <span className="range">60 ~ 40</span> 조금씩 맞춰가는 주파수
                      </li>
                      <li className={results.tierLevel === 4 ? 'active' : ''}>
                        <span className="range">40 ~ 20</span> 아슬아슬한 평행선
                      </li>
                      <li className={results.tierLevel === 5 ? 'active' : ''}>
                        <span className="range">20 ~ 0</span> 지구와 안드로메다
                      </li>
                    </ul>

                  </div>
                </div>

                {/* FAA FRONTAL APPROACH-AVOIDANCE BALANCE PANEL */}
                <div className="faa-analysis-card">
                  <div className="faa-header">
                    <div className="faa-title-wrap">
                      <ShieldCheck size={22} className="faa-icon" />
                      <div>
                        <h3 className="faa-title">🛡️ 전두엽 정서 접근-회피 밸런스 (FAA Approach-Avoidance Index)</h3>
                        <p className="faa-subtitle">전두엽 알파파 비대칭(FAA = ln AF4 - ln AF3)을 통한 호감/접근 보너스(+) 및 회피/경계 감점(-) 실시간 평가</p>
                      </div>
                    </div>
                    <div className={`faa-badge ${results.bonusOrPenaltyPct > 0 ? 'safe' : results.bonusOrPenaltyPct === 0 ? 'warn' : 'danger'}`}>
                      {results.bonusOrPenaltyPct > 0 ? '🟢 긍정 호감·접근 우세 (+보너스 가산 ✨)' : results.bonusOrPenaltyPct === 0 ? '⚪ 중립 안정 상태 (Neutral)' : '🔴 방어적 회피 우세 (-감점 적용)'}
                    </div>
                  </div>

                  <div className="faa-metrics-grid">
                    <div className="faa-metric-box">
                      <span className="faa-metric-label">🟢 긍정 호감·접근율 (R_Approach)</span>
                      <span className="faa-metric-value positive">{Math.round((results.rApproach || 0) * 100)}%</span>
                      <span className="faa-metric-desc">호감·긍정 정서 관여 (FAA &gt; +0.05)</span>
                    </div>

                    <div className="faa-metric-box">
                      <span className="faa-metric-label">🔴 무의식 회피·방어율 (R_Avoidance)</span>
                      <span className="faa-metric-value negative">{Math.round((results.rAvoidance || 0) * 100)}%</span>
                      <span className="faa-metric-desc">경계·심리적 긴장 (FAA &lt; -0.10)</span>
                    </div>

                    <div className="faa-metric-box">
                      <span className="faa-metric-label">👥 2인 평균 FAA 동기 지수</span>
                      <span className={`faa-metric-value ${results.avgFaaA !== undefined && results.avgFaaA >= 0 ? 'positive' : 'negative'}`}>
                        A: {results.avgFaaA !== undefined ? (results.avgFaaA >= 0 ? `+${results.avgFaaA.toFixed(2)}` : results.avgFaaA.toFixed(2)) : '0.00'} | B: {results.avgFaaB !== undefined ? (results.avgFaaB >= 0 ? `+${results.avgFaaB.toFixed(2)}` : results.avgFaaB.toFixed(2)) : '0.00'}
                      </span>
                      <span className="faa-metric-desc">{results.avgFaaA >= 0 && results.avgFaaB >= 0 ? '두 참여자 모두 접근·호감 우세 🟢' : '순간적 긴장 혼재 🟡'}</span>
                    </div>

                    <div className="faa-metric-box">
                      <span className="faa-metric-label">✨ 최종 FAA 점수 보정 효과</span>
                      <span className={`faa-metric-value ${results.bonusOrPenaltyPct >= 0 ? 'positive' : 'discount'}`}>
                        {results.bonusOrPenaltyPct > 0 ? `+${results.bonusOrPenaltyPct}% (보너스 ✨)` : results.bonusOrPenaltyPct === 0 ? '0% (무보정)' : `${results.bonusOrPenaltyPct}% (감점)`}
                      </span>
                      <span className="faa-metric-desc">{results.bonusOrPenaltyPct > 0 ? '호감 보너스로 동기화 점수 추가 가산' : results.bonusOrPenaltyPct === 0 ? '보너스/감점 없음' : '회피 패널티 할인율 적용'}</span>
                    </div>
                  </div>

                  <div className="faa-formula-footer">
                    📐 <strong>양방향 FAA 산출 원리</strong>: FAA = ln(AF4_alpha) - ln(AF3_alpha) ➔ <strong>양수(+)는 좌측 전두엽 활성(호감·접근 보너스 가산)</strong>, <strong>음수(-)는 우측 전두엽 활성(회피·방어 감점)</strong>을 부여하여 보다 공정하고 정확한 상호작용 점수를 도출합니다.
                  </div>
                </div>

                {/* TRI-REGION BRAIN MAP & CHANNEL SYNCHRONY STATS */}
                <div className="brain-map-section">
                  <div className="brain-map-header">
                    <h3 className="chart-title">🧠 3개 전극 영역별 개별 동조율 & 뇌 지도 (Topography Map)</h3>
                    <p className="chart-subtitle">Pz(두정엽), T7(좌측두엽), T8(우측두엽) 각 영역별 두 참여자 간의 독립 상관계수</p>
                  </div>

                  {(() => {
                    const pzScore = results ? Math.round(corrToNeuroScore(results.channelCorrs.rPz)) : 50;
                    const t7Score = results ? Math.round(corrToNeuroScore(results.channelCorrs.rT7)) : 50;
                    const t8Score = results ? Math.round(corrToNeuroScore(results.channelCorrs.rT8)) : 50;

                    // Dynamic circle radius based on synchrony score (11px at 0점 to 28px at 100점)
                    const radiusPz = 11 + (pzScore / 100) * 17;
                    const radiusT7 = 11 + (t7Score / 100) * 17;
                    const radiusT8 = 11 + (t8Score / 100) * 17;

                    return (
                      <div className="brain-map-grid">
                        
                        {/* SVG Brain Map Graphic */}
                        <div className="brain-svg-container">
                          <svg viewBox="0 0 300 300" className="brain-topography-svg">
                            {/* Head Outline */}
                            <ellipse cx="150" cy="150" rx="110" ry="125" fill="none" stroke="var(--border-subtle)" strokeWidth="3" />
                            {/* Nose */}
                            <path d="M 140 25 Q 150 10 160 25" fill="none" stroke="var(--border-subtle)" strokeWidth="3" />
                            {/* Ears */}
                            <path d="M 38 135 Q 25 150 38 165" fill="none" stroke="var(--border-subtle)" strokeWidth="3" />
                            <path d="M 262 135 Q 275 150 262 165" fill="none" stroke="var(--border-subtle)" strokeWidth="3" />

                            {/* AF3 (Frontal Left) */}
                            <circle cx="105" cy="85" r="10" className="sensor-node frontal" />
                            <text x="105" y="89" className="sensor-text">AF3</text>

                            {/* AF4 (Frontal Right) */}
                            <circle cx="195" cy="85" r="10" className="sensor-node frontal" />
                            <text x="195" y="89" className="sensor-text">AF4</text>

                            {/* T7 (Left Temporal) */}
                            <circle 
                              cx="60" 
                              cy="150" 
                              r={radiusT7} 
                              className="sensor-node temporal-t7 active-pulse" 
                              style={{ 
                                filter: `drop-shadow(0 0 ${4 + (t7Score / 100) * 8}px rgba(20, 184, 166, ${(t7Score/100)*0.7 + 0.3}))`
                              }}
                            />
                            <text x="60" y={radiusT7 >= 16 ? 146 : 153} className="sensor-text active">T7</text>
                            {radiusT7 >= 16 && (
                              <text x="60" y="159" className="sensor-subtext">{t7Score}점</text>
                            )}

                            {/* T8 (Right Temporal) */}
                            <circle 
                              cx="240" 
                              cy="150" 
                              r={radiusT8} 
                              className="sensor-node temporal-t8 active-pulse" 
                              style={{ 
                                filter: `drop-shadow(0 0 ${4 + (t8Score / 100) * 8}px rgba(168, 85, 247, ${(t8Score/100)*0.7 + 0.3}))`
                              }}
                            />
                            <text x="240" y={radiusT8 >= 16 ? 146 : 153} className="sensor-text active">T8</text>
                            {radiusT8 >= 16 && (
                              <text x="240" y="159" className="sensor-subtext">{t8Score}점</text>
                            )}

                            {/* Pz (Parietal Midline) */}
                            <circle 
                              cx="150" 
                              cy="205" 
                              r={radiusPz} 
                              className="sensor-node parietal-pz active-pulse" 
                              style={{ 
                                filter: `drop-shadow(0 0 ${4 + (pzScore / 100) * 8}px rgba(59, 130, 246, ${(pzScore/100)*0.7 + 0.3}))`
                              }}
                            />
                            <text x="150" y={radiusPz >= 16 ? 201 : 208} className="sensor-text active">Pz</text>
                            {radiusPz >= 16 && (
                              <text x="150" y="214" className="sensor-subtext">{pzScore}점</text>
                            )}
                          </svg>
                          <div className="brain-map-caption">
                            <span>● Pz (두정엽): 동조율 <strong>{pzScore}점</strong> (원 반경: {Math.round(radiusPz)}px)</span>
                            <span>● T7 (좌측두엽): 동조율 <strong>{t7Score}점</strong> (원 반경: {Math.round(radiusT7)}px)</span>
                            <span>● T8 (우측두엽): 동조율 <strong>{t8Score}점</strong> (원 반경: {Math.round(radiusT8)}px)</span>
                          </div>
                        </div>

                        {/* Channel Cards */}
                        <div className="channel-stats-list">
                      
                      <div className="channel-stat-item">
                        <div className="stat-channel-head">
                          <span className="stat-tag pz">Pz 두정엽</span>
                          <span className="stat-role">고차원 인지 몰입 & 주의집중</span>
                          <span className="stat-weight">가중치 {Math.round((wPz / ((wPz + wT7 + wT8) || 1)) * 100)}% {results.syncCalculation?.channelContributions?.pz !== undefined && `(기여 ${results.syncCalculation.channelContributions.pz}점)`}</span>
                        </div>
                        <div className="stat-val-bar">
                          <div className="stat-bar-fill pz-fill" style={{ width: `${Math.round(corrToNeuroScore(results.channelCorrs.rPz))}%` }} />
                        </div>
                        <div className="stat-val-text">
                          상관계수 $r = {results.channelCorrs.rPz.toFixed(3)}$ (동조율 {Math.round(corrToNeuroScore(results.channelCorrs.rPz))}점)
                        </div>
                      </div>

                      <div className="channel-stat-item">
                        <div className="stat-channel-head">
                          <span className="stat-tag t7">T7 좌측두엽</span>
                          <span className="stat-role">언어적 대화 & 구어 소통</span>
                          <span className="stat-weight">가중치 {Math.round((wT7 / ((wPz + wT7 + wT8) || 1)) * 100)}% {results.syncCalculation?.channelContributions?.t7 !== undefined && `(기여 ${results.syncCalculation.channelContributions.t7}점)`}</span>
                        </div>
                        <div className="stat-val-bar">
                          <div className="stat-bar-fill t7-fill" style={{ width: `${Math.round(corrToNeuroScore(results.channelCorrs.rT7))}%` }} />
                        </div>
                        <div className="stat-val-text">
                          상관계수 $r = {results.channelCorrs.rT7.toFixed(3)}$ (동조율 {Math.round(corrToNeuroScore(results.channelCorrs.rT7))}점)
                        </div>
                      </div>

                      <div className="channel-stat-item">
                        <div className="stat-channel-head">
                          <span className="stat-tag t8">T8 우측두엽</span>
                          <span className="stat-role">정서적 억양 & 비언어적 공감</span>
                          <span className="stat-weight">가중치 {Math.round((wT8 / ((wPz + wT7 + wT8) || 1)) * 100)}% {results.syncCalculation?.channelContributions?.t8 !== undefined && `(기여 ${results.syncCalculation.channelContributions.t8}점)`}</span>
                        </div>
                        <div className="stat-val-bar">
                          <div className="stat-bar-fill t8-fill" style={{ width: `${Math.round(corrToNeuroScore(results.channelCorrs.rT8))}%` }} />
                        </div>
                        <div className="stat-val-text">
                          상관계수 $r = {results.channelCorrs.rT8.toFixed(3)}$ (동조율 {Math.round(corrToNeuroScore(results.channelCorrs.rT8))}점)
                        </div>
                      </div>

                    </div>

                    {/* Data Column Mapping Inspector */}
                    {results.matchedColumns && (
                      <div className="matched-columns-bar">
                        <div className="matched-col-label">
                          <CheckCircle size={14} style={{ color: '#10b981' }} />
                          <span><strong>실제 계산에 반영된 CSV 뇌파 컬럼</strong>:</span>
                        </div>
                        <div className="matched-col-badges">
                          <span className="col-pill pz">Pz 감마: {results.matchedColumns.colPzA}</span>
                          <span className="col-pill t7">T7 감마: {results.matchedColumns.colT7A}</span>
                          <span className="col-pill t8">T8 감마: {results.matchedColumns.colT8A}</span>
                          <span className="col-pill faa">전두엽 알파(FAA): {results.matchedColumns.colAF3A} & {results.matchedColumns.colAF4A}</span>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })()}
            </div>

                {/* 5-MINUTE EXPERIMENT TIMELINE & MOVING SYNCHRONY SECTION */}
                {results.timelineAnalysis && (
                  <div className="timeline-analysis-section">
                    <div className="section-header-compact">
                      <div>
                        <h3 className="section-title"><Activity size={20} className="title-icon" /> ⏱️ 5분 실험 타임라인 & 1분 단위 동기화 추이 분석</h3>
                        <p className="section-desc">
                          전체 {results.totalDurationSec ? `${Math.floor(results.totalDurationSec / 60)}분 ${results.totalDurationSec % 60}초` : '5분'} 동안 대화 및 상호작용의 진행 단계별 동조율 변화를 추적합니다.
                        </p>
                      </div>
                      
                      {results.timelineAnalysis.peakPeriod && (
                        <div className="golden-moment-badge">
                          🔥 <strong>최고 공감 골든타임</strong>: {results.timelineAnalysis.peakPeriod.timeLabel} ({results.timelineAnalysis.peakPeriod.score}점)
                        </div>
                      )}
                    </div>

                    {/* 1-Minute Segment Cards */}
                    {results.timelineAnalysis.minuteSegments?.length > 0 && (
                      <div className="minute-segments-grid">
                        {results.timelineAnalysis.minuteSegments.map((seg, idx) => {
                          const isTop = results.timelineAnalysis.peakPeriod && Math.abs(results.timelineAnalysis.peakPeriod.timeSec - (seg.startSec + 30)) < 35;
                          return (
                            <div className={`minute-seg-card ${isTop ? 'highlight-peak' : ''}`} key={idx}>
                              <div className="seg-card-header">
                                <span className="seg-tag">{seg.segmentIndex}구간</span>
                                <span className="seg-time">{seg.label.split(' ')[0]}</span>
                              </div>
                              <div className="seg-score-val">{seg.syncScore}<span className="unit">점</span></div>
                              <div className="seg-progress-bar">
                                <div 
                                  className="seg-progress-fill" 
                                  style={{ 
                                    width: `${seg.syncScore}%`,
                                    background: seg.syncScore >= 70 ? 'var(--accent-teal)' : seg.syncScore >= 40 ? 'var(--accent-blue)' : '#f59e0b' 
                                  }} 
                                />
                              </div>
                              <div className="seg-meta">
                                상관계수 r = {seg.corr}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 30-Sec Moving Window Sync Line Chart */}
                    {movingSyncChartData && (
                      <div className="moving-sync-chart-box">
                        <div className="moving-sync-header">
                          <span className="moving-sync-title">📈 30초 이동 윈도우 뇌파 동조율 곡선 (Moving Synchrony Curve)</span>
                          <span className="moving-sync-info">대화 진행 중 동기화의 상승/하강 흐름을 직관적으로 확인</span>
                        </div>
                        <div style={{ height: '220px', width: '100%' }}>
                          <Line data={movingSyncChartData} options={movingSyncChartOptions} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="charts-grid">
                  
                  {/* MULTI-CHANNEL GAMMA WAVEFORM CHART */}
                  <div className="chart-panel">
                    <div className="chart-header">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.8rem' }}>
                        <div>
                          <h3 className="chart-title">3채널 감마파 시계열 동기화 (Gamma Time-Series)</h3>
                          <p className="chart-subtitle">통합 가중평균 파형 및 전극별 개별 파형 비교</p>
                        </div>
                        <div className="channel-view-toggle-group no-print">
                          <button className={`chan-view-btn ${chartChannelView === 'COMBINED' ? 'active' : ''}`} onClick={() => setChartChannelView('COMBINED')}>
                            ✨ 통합 가중평균
                          </button>
                          <button className={`chan-view-btn ${chartChannelView === 'PZ' ? 'active' : ''}`} onClick={() => setChartChannelView('PZ')}>
                            Pz(두정)
                          </button>
                          <button className={`chan-view-btn ${chartChannelView === 'T7' ? 'active' : ''}`} onClick={() => setChartChannelView('T7')}>
                            T7(좌측)
                          </button>
                          <button className={`chan-view-btn ${chartChannelView === 'T8' ? 'active' : ''}`} onClick={() => setChartChannelView('T8')}>
                            T8(우측)
                          </button>
                        </div>
                      </div>
                      
                      <div className="axis-explanation-box">
                        <span><strong>X축 (시간)</strong>: 대화 진행 시간 (Sec)</span>
                        <span><strong>Y축 (감마 전력)</strong>: 30~45Hz 대역 활성도 | <strong>시간지연 보정</strong>: {results.detectedLag > 0 ? `+${results.detectedLag}초 반응지연` : results.detectedLag === 0 ? '실시간 즉각 동조' : `${results.detectedLag}초 선행 동조`}</span>
                      </div>
                    </div>
                    <div className="chart-canvas-container line">
                      <Line data={lineChartData} options={lineChartOptions} />
                    </div>
                  </div>

                  {/* COGNITIVE & EMOTIONAL RADAR PROFILE */}
                  <div className="chart-panel chart-panel-cognitive">
                    <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <h3 className="chart-title">참여자 인지 및 감정 프로파일 (Cognitive & Emotion Profile)</h3>
                        <p className="chart-subtitle">6대 정서 지표 레이더 분석 및 정서 조화도(Cosine Harmony: {Math.round(results.emotionHarmony * 100)}%)</p>
                      </div>
                      
                      <div className="subject-toggle-group no-print">
                        <button className={`subject-toggle-btn ${radarSubject === 'A' ? 'active' : ''}`} onClick={() => setRadarSubject('A')}>{nameA}님</button>
                        <button className={`subject-toggle-btn ${radarSubject === 'B' ? 'active' : ''}`} onClick={() => setRadarSubject('B')}>{nameB}님</button>
                        <button className={`subject-toggle-btn ${radarSubject === 'BOTH' ? 'active' : ''}`} onClick={() => setRadarSubject('BOTH')}>A & B 비교</button>
                      </div>
                    </div>
                    
                    {(() => {
                      const sortedA = [...EMOTION_KEYS]
                        .map(e => ({ ...e, score: Math.round(results.emotionsA[e.label] || 0) }))
                        .sort((a, b) => b.score - a.score);
                      const sortedB = [...EMOTION_KEYS]
                        .map(e => ({ ...e, score: Math.round(results.emotionsB[e.label] || 0) }))
                        .sort((a, b) => b.score - a.score);
                      
                      const topA1 = sortedA[0] || EMOTION_KEYS[0];
                      const topA2 = sortedA[1] || EMOTION_KEYS[1];
                      const topB1 = sortedB[0] || EMOTION_KEYS[0];
                      const topB2 = sortedB[1] || EMOTION_KEYS[1];

                      const personaA = getParticipantPersona(topA1, topA2);
                      const personaB = getParticipantPersona(topB1, topB2);

                      return (
                        <>
                          {/* TOP 2 PERSONA HIGHLIGHT CARDS */}
                          <div className="persona-cards-grid">
                            <div className="persona-card subject-a">
                              <div className="persona-header">
                                <span className="persona-subject">👤 <strong>{nameA}</strong>님의 뇌파 성향</span>
                                <span className="persona-tag">{personaA.tag}</span>
                              </div>
                              <div className="persona-title-row">
                                <span className="persona-icon">{personaA.icon}</span>
                                <span className="persona-badge-title">{personaA.badge}</span>
                              </div>
                              <div className="persona-top-traits">
                                <div className="trait-pill">
                                  <span className="trait-rank">🥇 <strong>1위: {topA1.label}</strong></span>
                                  <span className="trait-score">{topA1.score}점</span>
                                </div>
                                <div className="trait-pill">
                                  <span className="trait-rank">🥈 <strong>2위: {topA2.label}</strong></span>
                                  <span className="trait-score">{topA2.score}점</span>
                                </div>
                              </div>
                              <div className="persona-desc">"{personaA.desc}"</div>
                            </div>

                            <div className="persona-card subject-b">
                              <div className="persona-header">
                                <span className="persona-subject">👤 <strong>{nameB}</strong>님의 뇌파 성향</span>
                                <span className="persona-tag">{personaB.tag}</span>
                              </div>
                              <div className="persona-title-row">
                                <span className="persona-icon">{personaB.icon}</span>
                                <span className="persona-badge-title">{personaB.badge}</span>
                              </div>
                              <div className="persona-top-traits">
                                <div className="trait-pill">
                                  <span className="trait-rank">🥇 <strong>1위: {topB1.label}</strong></span>
                                  <span className="trait-score">{topB1.score}점</span>
                                </div>
                                <div className="trait-pill">
                                  <span className="trait-rank">🥈 <strong>2위: {topB2.label}</strong></span>
                                  <span className="trait-score">{topB2.score}점</span>
                                </div>
                              </div>
                              <div className="persona-desc">"{personaB.desc}"</div>
                            </div>
                          </div>

                          <div className="emotion-layout">
                            <div className="chart-canvas-container radar">
                              <Radar data={radarData} options={radarOptions} plugins={[radarDataPlugin]} />
                            </div>

                            <div className="emotion-explanations">
                              {EMOTION_KEYS.map((e, idx) => {
                                const valA = Math.round(results.emotionsA[e.label] || 0);
                                const valB = Math.round(results.emotionsB[e.label] || 0);
                                const displayVal = radarSubject === 'B' ? valB : valA;

                                // Determine if this emotion is TOP 1 or TOP 2
                                const isTop1A = topA1.label === e.label;
                                const isTop2A = topA2.label === e.label;
                                const isTop1B = topB1.label === e.label;
                                const isTop2B = topB2.label === e.label;

                                const isTop1 = radarSubject === 'A' ? isTop1A : radarSubject === 'B' ? isTop1B : (isTop1A || isTop1B);
                                const isTop2 = radarSubject === 'A' ? isTop2A : radarSubject === 'B' ? isTop2B : (!isTop1 && (isTop2A || isTop2B));

                                return (
                                  <div className={`emotion-item ${isTop1 ? 'is-top-1' : isTop2 ? 'is-top-2' : ''}`} key={idx}>
                                    <div className="emotion-item-header">
                                      <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <span className="emotion-name">{e.label.split(' ')[0].toUpperCase()}</span>
                                        {isTop1 && <span className="top-rank-badge rank-1">🥇 TOP 1</span>}
                                        {isTop2 && <span className="top-rank-badge rank-2">🥈 TOP 2</span>}
                                      </div>
                                      <span className="emotion-score-badge">{radarSubject === 'BOTH' ? `A: ${valA}점 | B: ${valB}점` : `${displayVal}점`}</span>
                                    </div>
                                    <div className="emotion-progress-bar">
                                      <div className="emotion-progress-fill" style={{ width: `${Math.min(100, Math.max(0, displayVal))}%` }} />
                                    </div>
                                    <div className="emotion-desc">{e.desc}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      );
                    })()}

                  </div>

                  {/* Executive Summary & Insights Panel */}
                  <div className="insights-panel">
                    <h3 className="chart-title" style={{ marginBottom: '1.5rem' }}>
                      {reportTarget === 'BOTH' ? 'NeuroSignal 3영역 핵심 분석 & 인사이트 솔루션' : `${targetName} 맞춤형 핵심 분석 & 솔루션`}
                    </h3>
                    <div className="insights-grid">
                      <div className="insight-card">
                        <div className="insight-icon">🤝</div>
                        <div>
                          <h4 className="insight-title">3영역 종합 동조 결과</h4>
                          <p className="insight-body">Pz·T7·T8 가중 동조율 <strong>{Math.round(results.score)}점</strong>으로 <strong>"{results.titleStr}"</strong> 상태입니다. 전반적인 소통 파동이 긴밀하게 연결되어 있습니다.</p>
                        </div>
                      </div>

                      <div className="insight-card">
                        <div className="insight-icon">🗣️</div>
                        <div>
                          <h4 className="insight-title">언어 & 공감 상호작용 (T7/T8)</h4>
                          <p className="insight-body">좌측두엽(T7) 동조율은 <strong>{Math.round(((results.channelCorrs.rT7 + 1) / 2) * 100)}점</strong>, 우측두엽(T8) 공감률은 <strong>{Math.round(((results.channelCorrs.rT8 + 1) / 2) * 100)}점</strong>으로 대화의 티키타카가 원활합니다.</p>
                        </div>
                      </div>

                      <div className="insight-card">
                        <div className="insight-icon">🧘</div>
                        <div>
                          <h4 className="insight-title">스트레스 및 회피 반응 지수</h4>
                          <p className="insight-body">현재 {targetName}의 스트레스 지수는 <strong>{targetStress}점</strong>, 무의식적 방어 회피율은 <strong>{Math.round(results.rAvoidance * 100)}%</strong>입니다. {results.rAvoidance < 0.2 ? '심리적 방어 기제가 거의 없는 편안한 소통 상태입니다.' : '약간의 긴장감이 감지되므로 부드러운 화제를 권장합니다.'}</p>
                        </div>
                      </div>

                      <div className="insight-card">
                        <div className="insight-icon">💡</div>
                        <div>
                          <h4 className="insight-title">인지 몰입 & 케어 가이드</h4>
                          <p className="insight-body">주의집중(Pz) 지표는 <strong>{Math.round(((results.channelCorrs.rPz + 1) / 2) * 100)}점</strong>입니다. {targetEngagement > 60 ? '상대방의 이야기에 높은 집중도와 호기심을 유지하고 있습니다.' : '대화 주제에 대한 흥미를 더욱 높일 수 있는 공통 관심사를 찾아보세요.'}</p>
                        </div>
                      </div>

                    </div>
                  </div>

                </div>

              </div>
            </div>
          )}
        </>
      )}

      {/* TAB 2: PROTOCOL VIEW */}
      {activeTab === 'PROTOCOL' && (
        <div className="report-container protocol-container">
          <div className="report-inner">
            
            <div className="report-header">
              <div>
                <div className="brand-title">NeuroSignal Experimental Framework</div>
                <h1 className="report-title">3영역 뇌파 동기화 <br/>실험 구성 및 프로토콜 제안서</h1>
              </div>
              <div className="report-meta">
                <div className="date-badge">Experimental Framework v3.0</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', marginTop: '0.4rem' }}>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-main)', fontWeight: '600' }}>
                    🔬 <strong>측정 장비</strong>: Emotiv Insight 5채널 (AF3, AF4, T7, T8, Pz)
                  </div>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                    👥 <strong>실험 대상</strong>: 대화 상호작용 참여자 2인
                  </div>
                </div>
              </div>
            </div>

            {/* EXPERIMENTAL STEPS */}
            <div style={{ marginBottom: '3.5rem' }}>
              <h3 className="chart-title" style={{ marginBottom: '1.5rem' }}>실험 진행 절차 (총 16분 소요)</h3>
              
              <div className="protocol-timeline">
                <div className="protocol-step-card baseline">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 01</div>
                    <div className="step-time-duration">00:00 ~ 03:00 (3분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Zap size={20} style={{ color: 'var(--accent-blue)' }} /> 3분 베이스라인(Baseline) 안정화 측정</h4>
                    <p className="step-content-desc">AF3, AF4, T7, T8, Pz 5개 채널의 접촉 임피던스를 확인하고, 편안한 안정 상태에서 각 개인의 기저 뇌파 주파수 특성을 기록합니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card interaction">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 02</div>
                    <div className="step-time-duration">03:00 ~ 08:00 (5분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Activity size={20} style={{ color: 'var(--accent-purple)' }} /> 1차 실험 측정 (5분 영상 동시 시청 및 상호작용)</h4>
                    <p className="step-content-desc">동일한 시각·청각 자극(5분 영상)을 동시에 시청하며 인지(Pz), 언어(T7), 공감(T8) 3개 핵심 영역의 감마파 실시간 동기화를 수집합니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card sensor">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 03</div>
                    <div className="step-time-duration">08:00 ~ 11:00 (3분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Cpu size={20} style={{ color: 'var(--accent-teal)' }} /> 중간 휴식 시간 (Rest Period)</h4>
                    <p className="step-content-desc">3분간 편안한 휴식을 취하며 인지적 피로도를 완화하고 기저 상태로 뇌파를 리셋하여 2차 측정을 준비합니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card interaction">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 04</div>
                    <div className="step-time-duration">11:00 ~ 16:00 (5분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Sparkles size={20} style={{ color: 'var(--accent-amber)' }} /> 2차 실험 측정 (심화 상호작용 및 정서 평가)</h4>
                    <p className="step-content-desc">2차 과제(심층 대화 및 상호작용)를 진행하며 1차 실험 데이터와 뇌파 동조율 및 6대 정서 프로파일의 변화를 비교 검증합니다.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* METHODOLOGY ANALYSIS CARDS */}
            <div>
              <h3 className="chart-title" style={{ marginBottom: '1.5rem' }}>3대 전극 영역별 신경과학적 역할 및 산출 알고리즘</h3>
              <div className="methodology-grid">
                <div className="method-card">
                  <h4 className="method-title">1. Pz 두정엽 (Parietal Cortex) - 40%</h4>
                  <p className="method-desc">두정엽 중심의 30~45Hz 감마파는 고차원 주의 집중과 감각 정보 통합을 반영합니다. 대화 몰입도를 측정하는 핵심 지표입니다.</p>
                </div>
                <div className="method-card">
                  <h4 className="method-title">2. T7 좌측두엽 (Left Temporal) - 30%</h4>
                  <p className="method-desc">베르니케 영역에 인접한 좌측 측두엽은 언어적 이해와 구어체 대화 소통의 상호작용 동기화를 측정합니다.</p>
                </div>
                <div className="method-card">
                  <h4 className="method-title">3. T8 우측두엽 (Right Temporal) - 30%</h4>
                  <p className="method-desc">우측 측두엽은 비언어적 억양(Prosody) 인식과 정서적 공감각, 사회적 인지 상호작용을 정밀하게 반영합니다.</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* TAB 3: ADVANCED PROTOCOL VIEW */}
      {activeTab === 'ADVANCED_PROTOCOL' && (
        <div className="report-container protocol-container">
          <div className="report-inner">
            
            <div className="report-header">
              <div>
                <div className="brand-title" style={{ color: 'var(--accent-teal)' }}>Advanced Tri-Region Pipeline & TR-SEM v3.0</div>
                <h1 className="report-title">고도화 3영역 전처리 & <br/>TR-SEM v3.0 수식 아키텍처</h1>
              </div>
              <div className="report-meta">
                <div className="date-badge" style={{ background: 'rgba(20, 184, 166, 0.15)', color: 'var(--accent-teal)' }}>
                  TR-SEM Architecture v3.0
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', marginTop: '0.4rem' }}>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-main)', fontWeight: '600' }}>
                    💻 <strong>모델</strong>: Tri-Region Synchro-Emotional Model (TR-SEM)
                  </div>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                    🧠 <strong>개선점</strong>: Fisher-z 변환 + 연속형 FAA 회피 페널티 + 6차원 코사인 조화도
                  </div>
                </div>
              </div>
            </div>

            {/* FORMULA HIGHLIGHT BOX */}
            <div className="formula-highlight-box">
              <div className="formula-highlight-title">⚡ TR-SEM v3.0 개선된 뇌파 동기화 종합 산출 수식 아키텍처</div>
              <div className="formula-highlight-math">
                Final Score = [ w_Sync × ( (S_Multi-Gamma + 1) / 2 ) × (1 - Penalty_Avoidance) + w_Emotion × Emotional_Harmony ] × 100
              </div>
              <div className="formula-breakdown-list">
                <div>• <strong>3영역 통합 감마파 공식</strong>: Gamma_Integrated(t) = [ w_Pz × Pz(t) + w_T7 × T7(t) + w_T8 × T8(t) ] / (w_Pz + w_T7 + w_T8)</div>
                <div>• <strong>멀티채널 동조 앙상블 (S_Multi-Gamma)</strong>: 통합 감마파의 시차 교차상관과 Fisher z-변환 채널 평균의 앙상블 결합</div>
                <div>• <strong>연속형 FAA 회피 페널티 (Penalty_Avoidance)</strong>: 단순 음수 횟수뿐만 아니라 회피 강도(Magnitude)까지 결합한 부드러운 감쇠 함수</div>
                <div>• <strong>정서 조화도 (Emotional Harmony)</strong>: 6대 인지·감정 벡터(Focus, Engagement 등)의 코사인 유사도 융합</div>
              </div>
            </div>

            {/* 5 ADVANCED MODULES GRID */}
            <div style={{ marginBottom: '3.5rem' }}>
              <h3 className="chart-title" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Cpu style={{ color: 'var(--accent-teal)' }} />
                고도화 뇌파 신호 정제 5대 핵심 모듈 (Signal Artifact Rejection)
              </h3>

              <div className="advanced-module-grid">
                
                <div className="advanced-module-card">
                  <div className="module-header">
                    <div className="module-icon-wrap"><Eye size={24} /></div>
                    <div>
                      <span className="module-badge">MODULE 01</span>
                      <h4 className="module-title">EOG 눈 깜빡임 노이즈 제거</h4>
                    </div>
                  </div>
                  <ul className="module-tech-list">
                    <li><strong>Z-Score Thresholding</strong>: AF3/AF4 채널의 ±75μV 이상 거대 전위 노이즈 정밀 제거</li>
                    <li><strong>DWT 웨이블릿 정화</strong>: 이산 웨이블릿 변환으로 안구 노이즈 선택적 차단</li>
                  </ul>
                </div>

                <div className="advanced-module-card">
                  <div className="module-header">
                    <div className="module-icon-wrap"><Activity size={24} /></div>
                    <div>
                      <span className="module-badge">MODULE 02</span>
                      <h4 className="module-title">EMG 근육 노이즈 & 상대전력 정규화</h4>
                    </div>
                  </div>
                  <ul className="module-tech-list">
                    <li><strong>Butterworth Bandpass Filter</strong>: 대화 시 턱 근육 수축 고주파 오염 차단 (0.5Hz ~ 45Hz)</li>
                    <li><strong>Relative Gamma Power</strong>: (Gamma / Total Power) 상대 전력비 산출로 턱 근육 왜곡 방지</li>
                  </ul>
                </div>

                <div className="advanced-module-card">
                  <div className="module-header">
                    <div className="module-icon-wrap"><RefreshCw size={24} /></div>
                    <div>
                      <span className="module-badge">MODULE 03</span>
                      <h4 className="module-title">시간 지연 동조 보정 (Time-Lag Sync)</h4>
                    </div>
                  </div>
                  <ul className="module-tech-list">
                    <li><strong>Time-Lag Cross Correlation</strong>: 0.5초~1.5초 정서적 반응 시차(Emotional Echo) 자동 탐색 보정</li>
                    <li><strong>Optimal Lag Detection</strong>: ±3초 범위 내 최대 공감 교차 상관계수 정밀 추적</li>
                  </ul>
                </div>

                <div className="advanced-module-card">
                  <div className="module-header">
                    <div className="module-icon-wrap"><ShieldCheck size={24} /></div>
                    <div>
                      <span className="module-badge">MODULE 04</span>
                      <h4 className="module-title">기저선 변동 및 전원 노이즈 차단</h4>
                    </div>
                  </div>
                  <ul className="module-tech-list">
                    <li><strong>0.5Hz High-Pass Filtering</strong>: 건식 센서 머리 움직임 기저선 출렁임(Drift) 제거</li>
                    <li><strong>60Hz Notch Filtering</strong>: 실내 교류 전원 노이즈(60Hz Hum) 정밀 차단</li>
                  </ul>
                </div>

                <div className="advanced-module-card">
                  <div className="module-header">
                    <div className="module-icon-wrap"><Layers size={24} /></div>
                    <div>
                      <span className="module-badge">MODULE 05</span>
                      <h4 className="module-title">개인차 정규화 & Fisher-z 변환</h4>
                    </div>
                  </div>
                  <ul className="module-tech-list">
                    <li><strong>Baseline Ln Normalization</strong>: 두개골 두께 및 피부 전도도 보정 기준 정규화</li>
                    <li><strong>Fisher z-transform</strong>: 상관계수 비선형 왜곡을 안정적으로 선형화하여 가중 결합</li>
                  </ul>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default App;
