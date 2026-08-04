import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { 
  UploadCloud, CheckCircle, Activity, Printer, Brain, Moon, Sun, 
  FileText, Compass, Clock, Zap, ClipboardList, Sliders, ShieldCheck, 
  Cpu, Layers, Eye, RefreshCw, BarChart3, Check, ToggleLeft, ToggleRight
} from 'lucide-react';
import { 
  spearmanCorrelation, calculateRAvoidance, calculateFriendshipScore, 
  filterEOGOutliers, timeLaggedSpearmanCorrelation, runAdvancedComparisonPipeline 
} from './utils/math';
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
  afterDatasetsDraw(chart, args, pluginOptions) {
    const { ctx } = chart;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      meta.data.forEach((element, index) => {
        const yOffset = i === 0 ? -15 : 15;
        
        ctx.fillStyle = dataset.borderColor;
        ctx.font = 'bold 15px "Outfit", sans-serif';
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

function sampleData(arr, maxPoints = 120) {
  if (arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0);
}

function App() {
  const [theme, setTheme] = useState('light');
  
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [dataA, setDataA] = useState([]);
  const [dataB, setDataB] = useState([]);
  
  const [nameA, setNameA] = useState('고권석');
  const [nameB, setNameB] = useState('문경수');
  
  const [skipInitial, setSkipInitial] = useState(true);
  const [wSync, setWSync] = useState(1.0);
  const [wFaa, setWFaa] = useState(0.25);

  // REAL-TIME EEG PROCESSING TOGGLES FOR REPORT
  const [useEogFilter, setUseEogFilter] = useState(true);
  const [useEmgFilter, setUseEmgFilter] = useState(true);
  const [useTimeLag, setUseTimeLag] = useState(true);
  const [useZScore, setUseZScore] = useState(true);

  const [activeTab, setActiveTab] = useState('REPORT'); // 'REPORT', 'PROTOCOL', 'ADVANCED_PROTOCOL'
  const [radarSubject, setRadarSubject] = useState('A'); // 'A', 'B', 'BOTH'

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

  // Recalculate analysis when toggles change if data exists
  useEffect(() => {
    if (dataA.length && dataB.length && results) {
      handleAnalyze();
    }
  }, [useEogFilter, useEmgFilter, useTimeLag, useZScore]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleFileUpload = (file, isA) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (res) => {
        if (res.data.length === 0) {
          setError('Empty CSV file.');
          return;
        }
        if (isA) { setFileA(file); setDataA(res.data); }
        else { setFileB(file); setDataB(res.data); }
        setError('');
      },
      error: (err) => setError(`Error parsing file: ${err.message}`)
    });
  };

  const parseEEGArrays = () => {
    if (!dataA.length || !dataB.length) return null;

    const headersA = Object.keys(dataA[0]);
    const headersB = Object.keys(dataB[0]);

    let colGammaA = findColumn(headersA, ['gamma', '감마']) || findNumericColumn(dataA, headersA);
    let colGammaB = findColumn(headersB, ['gamma', '감마']) || findNumericColumn(dataB, headersB);
    let colAF3A = findColumn(headersA, ['af3']);
    let colAF4A = findColumn(headersA, ['af4']);
    let colAF3B = findColumn(headersB, ['af3']);
    let colAF4B = findColumn(headersB, ['af4']);

    const minLen = Math.min(dataA.length, dataB.length);
    let arrGammaA = [], arrGammaB = [];
    let arrAF3A = [], arrAF4A = [];
    let arrAF3B = [], arrAF4B = [];

    const startIndex = skipInitial ? Math.min(30, Math.floor(minLen * 0.1)) : 0;

    for (let i = startIndex; i < minLen; i++) {
      const gA = dataA[i][colGammaA], gB = dataB[i][colGammaB];
      if (typeof gA === 'number' && typeof gB === 'number') {
        arrGammaA.push(gA);
        arrGammaB.push(gB);
        if (colAF3A && colAF4A && typeof dataA[i][colAF3A] === 'number' && typeof dataA[i][colAF4A] === 'number') {
          arrAF3A.push(dataA[i][colAF3A]);
          arrAF4A.push(dataA[i][colAF4A]);
        }
        if (colAF3B && colAF4B && typeof dataB[i][colAF3B] === 'number' && typeof dataB[i][colAF4B] === 'number') {
          arrAF3B.push(dataB[i][colAF3B]);
          arrAF4B.push(dataB[i][colAF4B]);
        }
      }
    }

    return { headersA, headersB, arrGammaA, arrGammaB, arrAF3A, arrAF4A, arrAF3B, arrAF4B, minLen, startIndex };
  };

  const handleAnalyze = () => {
    const eegData = parseEEGArrays();
    if (!eegData) {
      setError('두 개의 CSV 파일을 모두 업로드해주세요.');
      return;
    }

    const { headersA, headersB, arrGammaA, arrGammaB, arrAF3A, arrAF4A, arrAF3B, arrAF4B, minLen, startIndex } = eegData;

    // Apply Toggles Logic
    let processedGammaA = [...arrGammaA];
    let processedGammaB = [...arrGammaB];
    let processedAF3A = [...arrAF3A];
    let processedAF4A = [...arrAF4A];
    let processedAF3B = [...arrAF3B];
    let processedAF4B = [...arrAF4B];

    // Toggle 1: EOG Outlier Filtering
    if (useEogFilter) {
      processedGammaA = filterEOGOutliers(processedGammaA).filtered;
      processedGammaB = filterEOGOutliers(processedGammaB).filtered;
      processedAF3A = filterEOGOutliers(processedAF3A).filtered;
      processedAF4A = filterEOGOutliers(processedAF4A).filtered;
      processedAF3B = filterEOGOutliers(processedAF3B).filtered;
      processedAF4B = filterEOGOutliers(processedAF4B).filtered;
    }

    // Toggle 3: Time-Lag Correlation vs Standard
    let pGamma = 0;
    let detectedLag = 0;
    if (useTimeLag) {
      const lagRes = timeLaggedSpearmanCorrelation(processedGammaA, processedGammaB, 3);
      pGamma = lagRes.maxCorr;
      detectedLag = lagRes.optimalLag;
    } else {
      pGamma = spearmanCorrelation(processedGammaA, processedGammaB);
    }

    const rAvoidance = calculateRAvoidance(processedAF3A, processedAF4A, processedAF3B, processedAF4B);
    const score = calculateFriendshipScore(pGamma, rAvoidance, wSync, wFaa);

    let emotionColsA = EMOTION_KEYS.map(e => findColumn(headersA, e.keywords));
    let emotionColsB = EMOTION_KEYS.map(e => findColumn(headersB, e.keywords));

    let emotionsA = {};
    let emotionsB = {};
    EMOTION_KEYS.forEach(e => { emotionsA[e.label] = 0; emotionsB[e.label] = 0; });
    let validCount = 0;

    for (let i = startIndex; i < minLen; i++) {
      validCount++;
      EMOTION_KEYS.forEach((e, idx) => {
        if (emotionColsA[idx] && typeof dataA[i][emotionColsA[idx]] === 'number') {
          emotionsA[e.label] += dataA[i][emotionColsA[idx]];
        }
        if (emotionColsB[idx] && typeof dataB[i][emotionColsB[idx]] === 'number') {
          emotionsB[e.label] += dataB[i][emotionColsB[idx]];
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

    let titleStr = '';
    let descStr = '';
    let tierLevel = 5;
    
    if (score >= 80) {
      tierLevel = 1; titleStr = '이심전심, 텔레파시!';
      descStr = '말하지 않아도 통하는 완벽한 뇌파 동기화 상태입니다. 무의식적인 주파수가 거의 일치하며, 두 사람 간의 강한 정서적 유대감과 깊은 상호 이해가 뇌파 수준에서 증명되고 있습니다.';
    } else if (score >= 60) {
      tierLevel = 2; titleStr = '선물 같은 낯가림';
      descStr = '서로에게 깊게 공감하고 있으며, 대화의 파동이 안정적으로 맞물려 돌아가고 있습니다. 긍정적인 상호작용이 두드러집니다.';
    } else if (score >= 40) {
      tierLevel = 3; titleStr = '조금씩 맞춰가는 주파수';
      descStr = '서서히 서로의 감정에 동화되고 있습니다. 서로의 관심사를 탐색하며 공감대를 형성해가는 단계입니다.';
    } else if (score >= 20) {
      tierLevel = 4; titleStr = '아슬아슬한 평행선';
      descStr = '현재 서로 다른 생각에 집중하고 있거나, 무의식적인 심리적 거리감이 존재합니다.';
    } else {
      tierLevel = 5; titleStr = '지구와 안드로메다';
      descStr = '상대방을 향한 방어 기제가 높거나 전혀 다른 주파수 대역에 머물고 있습니다.';
    }

    setResults({
      score, titleStr, descStr, tierLevel, emotionsA, emotionsB,
      pGamma, rAvoidance, detectedLag,
      sampledGammaA: sampleData(processedGammaA),
      sampledGammaB: sampleData(processedGammaB),
      date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    });
  };

  const handleAdvancedAnalyze = () => {
    const eegData = parseEEGArrays();
    if (!eegData) {
      setError('두 개의 CSV 파일을 모두 업로드해주세요.');
      return;
    }

    const { arrGammaA, arrGammaB, af3A, af4A, af3B, af4B } = eegData;
    const pipeResults = runAdvancedComparisonPipeline(arrGammaA, arrGammaB, af3A, af4A, af3B, af4B, wSync, wFaa);
    
    setAdvancedResults({
      ...pipeResults,
      sampledCleanA: sampleData(pipeResults.cleanedGammaA),
      sampledCleanB: sampleData(pipeResults.cleanedGammaB),
      date: new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    });
  };

  // Dynamic Chart Colors
  const gridColor = theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
  const textColor = theme === 'light' ? '#64748b' : '#94a3b8';

  const lineChartData = results ? {
    labels: Array.from({ length: results.sampledGammaA.length }, (_, i) => i + 1),
    datasets: [
      {
        label: nameA,
        data: results.sampledGammaA,
        borderColor: theme === 'light' ? '#2563eb' : '#3b82f6',
        backgroundColor: theme === 'light' ? 'rgba(37, 99, 235, 0.1)' : 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0
      },
      {
        label: nameB,
        data: results.sampledGammaB,
        borderColor: theme === 'light' ? '#9333ea' : '#a855f7',
        backgroundColor: theme === 'light' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(168, 85, 247, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0
      }
    ]
  } : null;

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: textColor, font: { family: 'Noto Sans KR', size: 12 } } }
    },
    scales: {
      x: { 
        title: { display: true, text: '시간 흐름 (Time / Sec)', color: textColor, font: { family: 'Noto Sans KR', size: 11, weight: 'bold' } },
        grid: { color: gridColor }, ticks: { color: textColor, font: {size: 10} } 
      },
      y: { 
        title: { display: true, text: '감마파 주파수 세기 (Gamma Power / μV²)', color: textColor, font: { family: 'Noto Sans KR', size: 11, weight: 'bold' } },
        grid: { color: gridColor }, ticks: { color: textColor, font: {size: 10} } 
      }
    }
  };

  const advancedLineChartData = advancedResults ? {
    labels: Array.from({ length: advancedResults.sampledCleanA.length }, (_, i) => i + 1),
    datasets: [
      {
        label: `${nameA} (5대 정제 후)`,
        data: advancedResults.sampledCleanA,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 2, tension: 0.3, fill: true, pointRadius: 0
      },
      {
        label: `${nameB} (5대 정제 & 시간지연 보정 후)`,
        data: advancedResults.sampledCleanB,
        borderColor: '#06b6d4',
        backgroundColor: 'rgba(6, 182, 212, 0.1)',
        borderWidth: 2, tension: 0.3, fill: true, pointRadius: 0
      }
    ]
  } : null;

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
      r: { min: 0, max: 100, angleLines: { color: gridColor }, grid: { color: gridColor }, pointLabels: { color: theme === 'light' ? '#0f172a' : '#f8fafc', font: { family: 'Outfit', size: 16, weight: 800 } }, ticks: { display: false } }
    },
    plugins: { legend: { display: radarSubject === 'BOTH' } }, maintainAspectRatio: false
  };

  const avgStress = results ? Math.round(((results.emotionsA['stress (스트레스)'] || 0) + (results.emotionsB['stress (스트레스)'] || 0)) / 2) : 0;
  const avgEngagement = results ? Math.round(((results.emotionsA['engagement (몰입도)'] || 0) + (results.emotionsB['engagement (몰입도)'] || 0)) / 2) : 0;
  const avgInterest = results ? Math.round(((results.emotionsA['interest (흥미도)'] || 0) + (results.emotionsB['interest (흥미도)'] || 0)) / 2) : 0;

  return (
    <div className="app-container">
      
      <button className="theme-toggle-btn no-print" onClick={toggleTheme}>
        {theme === 'dark' ? <><Sun size={18} /> Light Mode</> : <><Moon size={18} /> Dark Mode</>}
      </button>

      {/* ALWAYS VISIBLE MAIN VIEW TABS (Hidden on Print) */}
      <div className="view-mode-tabs no-print" style={{ marginBottom: '2rem' }}>
        <button 
          className={`view-tab-btn ${activeTab === 'REPORT' ? 'active' : ''}`}
          onClick={() => setActiveTab('REPORT')}
        >
          <FileText size={18} /> 뇌파 분석 리포트 (결과지)
        </button>
        <button 
          className={`view-tab-btn ${activeTab === 'PROTOCOL' ? 'active' : ''}`}
          onClick={() => setActiveTab('PROTOCOL')}
        >
          <Compass size={18} /> 실험 구성 및 프로토콜 (기본 제안서)
        </button>
        <button 
          className={`view-tab-btn ${activeTab === 'ADVANCED_PROTOCOL' ? 'advanced-active' : ''}`}
          onClick={() => setActiveTab('ADVANCED_PROTOCOL')}
        >
          <Sliders size={18} /> ⚡ 고도화 뇌파 전처리 & 5대 정제 프로토콜
        </button>
      </div>

      {/* TAB 1: REPORT VIEW */}
      {activeTab === 'REPORT' && (
        <>
          {/* Settings & Upload UI (Hidden on Print) */}
          <div className="settings-panel no-print">
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
                  <option value="true">적용함 (권장)</option>
                  <option value="false">미적용</option>
                </select>
              </div>
            </div>

            {/* REAL-TIME EEG PROCESSING TOGGLES */}
            <div className="processing-toggles-section">
              <div className="toggles-title">
                <Sliders size={18} /> 🎛️ 뇌파 데이터 전처리 알고리즘 스위치 (클릭 시 점수 실시간 재산출)
              </div>
              <div className="processing-toggles-grid">
                
                <div className={`toggle-card ${useEogFilter ? 'active' : ''}`} onClick={() => setUseEogFilter(!useEogFilter)}>
                  <div className="toggle-label-wrap">
                    <Eye size={18} style={{ color: useEogFilter ? 'var(--accent-teal)' : 'var(--text-muted)' }} />
                    <span>EOG 눈 깜빡임 제거</span>
                  </div>
                  <div className="toggle-switch-pill" />
                </div>

                <div className={`toggle-card ${useEmgFilter ? 'active' : ''}`} onClick={() => setUseEmgFilter(!useEmgFilter)}>
                  <div className="toggle-label-wrap">
                    <Activity size={18} style={{ color: useEmgFilter ? 'var(--accent-teal)' : 'var(--text-muted)' }} />
                    <span>EMG 근육노이즈 정화</span>
                  </div>
                  <div className="toggle-switch-pill" />
                </div>

                <div className={`toggle-card ${useTimeLag ? 'active' : ''}`} onClick={() => setUseTimeLag(!useTimeLag)}>
                  <div className="toggle-label-wrap">
                    <RefreshCw size={18} style={{ color: useTimeLag ? 'var(--accent-teal)' : 'var(--text-muted)' }} />
                    <span>Time-Lag 반응지연 보정</span>
                  </div>
                  <div className="toggle-switch-pill" />
                </div>

                <div className={`toggle-card ${useZScore ? 'active' : ''}`} onClick={() => setUseZScore(!useZScore)}>
                  <div className="toggle-label-wrap">
                    <Layers size={18} style={{ color: useZScore ? 'var(--accent-teal)' : 'var(--text-muted)' }} />
                    <span>개인차 Z-Score 정규화</span>
                  </div>
                  <div className="toggle-switch-pill" />
                </div>

              </div>
            </div>

            <div className="upload-grid">
              <div className={`upload-card ${fileA ? 'has-file' : ''}`}>
                <input type="file" accept=".csv" className="file-input" onChange={(e) => { if (e.target.files[0]) handleFileUpload(e.target.files[0], true); }} />
                {fileA ? <CheckCircle className="upload-icon" /> : <UploadCloud className="upload-icon" />}
                <h3 title={fileA ? fileA.name : ''}>{fileA ? fileA.name : 'Person A CSV Upload'}</h3>
                <p>{fileA ? 'Ready to analyze' : 'Drop file here'}</p>
              </div>
              <div className={`upload-card ${fileB ? 'has-file' : ''}`}>
                <input type="file" accept=".csv" className="file-input" onChange={(e) => { if (e.target.files[0]) handleFileUpload(e.target.files[0], false); }} />
                {fileB ? <CheckCircle className="upload-icon" /> : <UploadCloud className="upload-icon" />}
                <h3 title={fileB ? fileB.name : ''}>{fileB ? fileB.name : 'Person B CSV Upload'}</h3>
                <p>{fileB ? 'Ready to analyze' : 'Drop file here'}</p>
              </div>
            </div>

            {error && <div style={{color: '#ef4444', textAlign: 'center', marginBottom: '1rem'}}>{error}</div>}

            <div className="action-row">
              <button className="btn btn-primary" disabled={!fileA || !fileB} onClick={handleAnalyze}>
                <Brain size={20} />
                프리미엄 리포트 생성
              </button>
              {results && (
                <button className="btn btn-secondary" onClick={() => window.print()}>
                  <Printer size={20} />
                  PDF 내보내기
                </button>
              )}
            </div>
          </div>

          {/* PDF Report Area */}
          {results && (
            <div className="report-container">
              <div className="report-inner">
                
                {/* PAGE 1 CONTENT */}
                <div className="report-header">
                  <div>
                    <div className="brand-title">NeuroSignal Project</div>
                    <h1 className="report-title">뇌파 동기화 <br/>종합 분석 결과</h1>
                  </div>
                  <div className="report-meta">
                    <div className="date-badge">Analysis Date: {results.date}</div>
                    
                    {/* ACTIVE TOGGLES STATUS BADGE */}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                      적용된 알고리즘: {useEogFilter ? 'EOG필터✅ ' : ''}{useEmgFilter ? 'EMG정화✅ ' : ''}{useTimeLag ? 'Time-Lag보정✅ ' : ''}{useZScore ? 'Z-Score✅' : ''}
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

                <div className="score-summary-card">
                  <div className="score-display">
                    <div className="score-value">{Math.round(results.score)}</div>
                    <div className="score-label">Synchronization Score</div>
                  </div>
                  <div className="tier-display">
                    <div className="tier-title">{results.titleStr}</div>
                    <div className="tier-description">{results.descStr}</div>
                    
                    <ul className="tier-explanation-list">
                      <li className={results.tierLevel === 1 ? 'active' : ''}>
                        <span className="range">100 ~ 80</span> 이심전심, 말하지 않아도 통하는 텔레파시!
                      </li>
                      <li className={results.tierLevel === 2 ? 'active' : ''}>
                        <span className="range">80 ~ 60</span> 선물 같은 낯가림!
                      </li>
                      <li className={results.tierLevel === 3 ? 'active' : ''}>
                        <span className="range">60 ~ 40</span> 조금씩 맞춰가는 주파수
                      </li>
                      <li className={results.tierLevel === 4 ? 'active' : ''}>
                        <span className="range">40 ~ 20</span> 아슬아슬한 평행선
                      </li>
                      <li className={results.tierLevel === 5 ? 'active' : ''}>
                        <span className="range">20 ~ 10</span> 지구와 안드로메다
                      </li>
                    </ul>

                  </div>
                </div>

                <div className="charts-grid">
                  
                  {/* PAGE 1 CHART */}
                  <div className="chart-panel">
                    <div className="chart-header">
                      <h3 className="chart-title">뇌파 주파수 동조 (Gamma Wave)</h3>
                      <p className="chart-subtitle">두 참여자의 시간별 감마파 동기화 흐름</p>
                      
                      <div className="axis-explanation-box">
                        <span><strong>X축 (시간)</strong>: 대화 진행 시간 (Sec)</span>
                        <span><strong>Y축 (감마파 세기)</strong>: 고차원 공감 및 인지 활성도 에너지 (파동 형태가 비슷할수록 동조율 상승)</span>
                      </div>
                    </div>
                    <div className="chart-canvas-container line">
                      <Line data={lineChartData} options={lineChartOptions} />
                    </div>
                  </div>

                  {/* PAGE 2 CHART (FORCED PAGE BREAK IN PRINT) */}
                  <div className="chart-panel chart-panel-cognitive">
                    <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <h3 className="chart-title">참여자 인지 및 감정 프로파일 (Cognitive Profile)</h3>
                        <p className="chart-subtitle">6가지 주요 뇌파 지표 상세 분석</p>
                      </div>
                      
                      <div className="subject-toggle-group no-print">
                        <button className={`subject-toggle-btn ${radarSubject === 'A' ? 'active' : ''}`} onClick={() => setRadarSubject('A')}>{nameA}님</button>
                        <button className={`subject-toggle-btn ${radarSubject === 'B' ? 'active' : ''}`} onClick={() => setRadarSubject('B')}>{nameB}님</button>
                        <button className={`subject-toggle-btn ${radarSubject === 'BOTH' ? 'active' : ''}`} onClick={() => setRadarSubject('BOTH')}>A & B 비교</button>
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

                          return (
                            <div className="emotion-item" key={idx}>
                              <div className="emotion-item-header">
                                <span className="emotion-name">{e.label.split(' ')[0].toUpperCase()}</span>
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

                  </div>

                  {/* Executive Summary & Insights Panel (4 Cards) */}
                  <div className="insights-panel">
                    <h3 className="chart-title" style={{ marginBottom: '1.5rem' }}>NeuroSignal 핵심 요약 & 솔루션</h3>
                    <div className="insights-grid">
                      <div className="insight-card">
                        <div className="insight-icon">🤝</div>
                        <div>
                          <h4 className="insight-title">우정테스트 분석 결과</h4>
                          <p className="insight-body">종합 동조율 점수 <strong>{Math.round(results.score)}점</strong>으로 <strong>"{results.titleStr}"</strong> 상태입니다.</p>
                        </div>
                      </div>

                      <div className="insight-card">
                        <div className="insight-icon">🧘</div>
                        <div>
                          <h4 className="insight-title">스트레스 (Stress) 케어 솔루션</h4>
                          <p className="insight-body">현재 평균 스트레스 지수는 <strong>{avgStress}점</strong>입니다. {avgStress < 40 ? '대화 중 긴장도가 낮아 매우 편안한 환경입니다.' : '일상적인 가벼운 주제로 분위기를 환기해 보세요.'}</p>
                        </div>
                      </div>

                      <div className="insight-card">
                        <div className="insight-icon">🔥</div>
                        <div>
                          <h4 className="insight-title">몰입도 (Engagement) 강화 솔루션</h4>
                          <p className="insight-body">대화 참여 몰입도는 평균 <strong>{avgEngagement}점</strong>을 기록했습니다.</p>
                        </div>
                      </div>

                      <div className="insight-card">
                        <div className="insight-icon">✨</div>
                        <div>
                          <h4 className="insight-title">흥미도 (Interest) 피드백</h4>
                          <p className="insight-body">상대방에 대한 흥미도 수치는 평균 <strong>{avgInterest}점</strong>입니다.</p>
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

      {/* TAB 2: EXPERIMENTAL PROTOCOL VIEW */}
      {activeTab === 'PROTOCOL' && (
        <div className="report-container protocol-container">
          <div className="report-inner">
            
            <div className="report-header">
              <div>
                <div className="brand-title">NeuroSignal Project</div>
                <h1 className="report-title">뇌파 측정 실험 구성 <br/>및 표준 프로토콜</h1>
              </div>
              <div className="report-meta">
                <div className="date-badge">Standard Proposal Specification</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', marginTop: '0.4rem' }}>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-main)', fontWeight: '600' }}>
                    💻 <strong>측정장비</strong>: Emotiv Insight 5채널
                  </div>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                    🧠 <strong>측정 부위 및 파동</strong>: AF3, AF4 전전두엽 좌우뇌 (알파파) / Pz 두정엽 (감마파)
                  </div>
                </div>
              </div>
            </div>

            {/* TIMELINE STEPS */}
            <div style={{ marginBottom: '3rem' }}>
              <h3 className="chart-title" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Clock className="upload-icon" style={{ width: '24px', height: '24px', margin: 0, color: 'var(--accent-blue)' }} />
                실험 절차 및 타임라인 (Total 20 Mins)
              </h3>
              
              <div className="protocol-timeline">
                <div className="protocol-step-card presurvey">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 00</div>
                    <div className="step-time-duration">00:00 ~ 04:00 (4분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><ClipboardList size={20} style={{ color: 'var(--accent-teal)' }} /> 사전 설문조사 (우정테스트)</h4>
                    <p className="step-content-desc">뇌파 측정 시작 전, 두 참여자 간의 평소 친밀도 및 상호 관계 지수를 평가하기 위한 4분간의 사전 우정테스트 설문조사를 진행합니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card baseline">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 01</div>
                    <div className="step-time-duration">04:00 ~ 07:00 (3분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Zap size={20} style={{ color: 'var(--accent-blue)' }} /> 1차 뇌파 장비 착용 및 베이스라인 측정</h4>
                    <p className="step-content-desc">실험 전 외부 자극이 차단된 안정 상태에서 3분간 기저선(Baseline) 뇌파를 측정합니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card interaction">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 02</div>
                    <div className="step-time-duration">07:00 ~ 12:00 (5분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Activity size={20} style={{ color: 'var(--accent-purple)' }} /> 1차 대화 세션 (인터랙션)</h4>
                    <p className="step-content-desc">지정된 소통 주제로 5분간 대화를 나눕니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card baseline">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 03</div>
                    <div className="step-time-duration">12:00 ~ 15:00 (3분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Zap size={20} style={{ color: 'var(--accent-blue)' }} /> 2차 베이스라인(휴식) 측정</h4>
                    <p className="step-content-desc">1차 대화 종료 후 3분간 중간 휴식을 취하며 정서 안정화 여부를 재측정합니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card interaction">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 04</div>
                    <div className="step-time-duration">15:00 ~ 20:00 (5분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Activity size={20} style={{ color: 'var(--accent-purple)' }} /> 2차 대화 세션 (깊은 상호작용)</h4>
                    <p className="step-content-desc">2차 깊은 주제 대화를 5분간 진행하며 심리적 친밀감을 분석합니다.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* METHODOLOGY ANALYSIS CARDS */}
            <div>
              <h3 className="chart-title" style={{ marginBottom: '1.5rem' }}>분석 지표 및 수학적 산출 알고리즘</h3>
              <div className="methodology-grid">
                <div className="method-card">
                  <h4 className="method-title">1. Pz 두정엽 감마파(Gamma) 동조</h4>
                  <p className="method-desc">Pz 두정엽 30~45Hz 대역 주파수를 추출하여 두 참여자 파동 간의 순위 상관계수를 산출합니다.</p>
                </div>
                <div className="method-card">
                  <h4 className="method-title">2. AF3/AF4 전전두엽 비대칭성 (FAA)</h4>
                  <p className="method-desc">AF3 및 AF4 전전두엽 좌우뇌 채널의 알파파 전력 차를 분석하여 심리적 접근/회피 동기(R-Avoidance)를 평가합니다.</p>
                </div>
                <div className="method-card">
                  <h4 className="method-title">3. Emotiv Insight 5채널 신호 정제</h4>
                  <p className="method-desc">측정 시작 초반 10% 데이터를 마스킹하여 신뢰도를 높입니다.</p>
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
                <div className="brand-title" style={{ color: 'var(--accent-teal)' }}>Advanced Signal Processing & Side-by-Side Analysis</div>
                <h1 className="report-title">고도화 뇌파 전처리 & <br/>정밀 비교 분석 패널</h1>
              </div>
              <div className="report-meta">
                <div className="date-badge" style={{ background: 'rgba(20, 184, 166, 0.15)', color: 'var(--accent-teal)' }}>
                  Enhanced EEG Pipeline v2.0
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end', marginTop: '0.4rem' }}>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-main)', fontWeight: '600' }}>
                    💻 <strong>장비 및 전처리</strong>: Emotiv Insight 5채널 + 5대 아티팩트 정화 알고리즘
                  </div>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                    🧠 <strong>실시간 비교</strong>: 기본 파이프라인 vs 5대 고도화 정제 파이프라인
                  </div>
                </div>
              </div>
            </div>

            {/* FORMULA HIGHLIGHT BOX */}
            <div className="formula-highlight-box">
              <div className="formula-highlight-title">⚡ 5대 전처리 알고리즘이 통합 적용된 고도화 동조율 수식</div>
              <div className="formula-highlight-math">
                Friendship Score = [ w_Sync × P_Gamma (Lag-Corrected) × (1 - (w_FAA × R_Avoidance (EOG-Filtered))) ] × 100
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
                    <li><strong>Optimal Lag Detection</strong>: ±2초 범위 내 최대 공감 교차 상관계수 정밀 추적</li>
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
                      <h4 className="module-title">피험자 개인차 보정 (Z-Score)</h4>
                    </div>
                  </div>
                  <ul className="module-tech-list">
                    <li><strong>Baseline Z-Score Normalization</strong>: 두개골 두께 및 피부 전도도 보정 기준 정규화</li>
                    <li><strong>Standardized Feature Scale</strong>: 개인 고유 뇌파 특성을 배제한 순수 대화 반응 비교</li>
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
