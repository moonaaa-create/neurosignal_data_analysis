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
  calculateImprovedSyncScore, runTriRegionPipeline, calculateTimeWindowSynchrony
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

function sampleData(arr, maxPoints = 120) {
  if (!arr || arr.length <= maxPoints) return arr || [];
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0);
}

// Built-in Sample Datasets matching the real 37-column EEG structure
const DEFAULT_SAMPLE_A = [
  { timestamp: "2026-09-03 14:44:42.722300", delta: 71.12, theta: 9.42, alpha: 7.83, beta: 8.42, gamma: 7.86, focus: 0.2055, engagement: 0.4830, interest: 0.7482, excitement: 0.7252, stress: 0.4310, relaxation: 0.4325, AF3_delta: 54.52, AF3_theta: 10.16, AF3_alpha: 7.53, AF3_beta: 8.06, AF3_gamma: 7.45, T7_delta: 65.39, T7_theta: 15.98, T7_alpha: 7.51, T7_beta: 17.07, T7_gamma: 17.43, Pz_delta: 126.14, Pz_theta: 23.81, Pz_alpha: 18.77, Pz_beta: 13.65, Pz_gamma: 8.52, T8_delta: 49.30, T8_theta: 10.38, T8_alpha: 7.18, T8_beta: 10.59, T8_gamma: 7.89, AF4_delta: 70.01, AF4_theta: 8.95, AF4_alpha: 10.18, AF4_beta: 9.50, AF4_gamma: 8.55 },
  { timestamp: "2026-09-03 14:44:43.722200", delta: 133.31, theta: 10.01, alpha: 5.38, beta: 9.12, gamma: 7.07, focus: 0.2593, engagement: 0.1764, interest: 0.6914, excitement: 0.7398, stress: 0.3880, relaxation: 0.4016, AF3_delta: 231.40, AF3_theta: 27.53, AF3_alpha: 11.62, AF3_beta: 13.50, AF3_gamma: 7.78, T7_delta: 98.30, T7_theta: 4.56, T7_alpha: 6.60, T7_beta: 8.07, T7_gamma: 12.70, Pz_delta: 77.39, Pz_theta: 16.23, Pz_alpha: 6.51, Pz_beta: 9.46, Pz_gamma: 7.16, T8_delta: 102.74, T8_theta: 12.10, T8_alpha: 8.80, T8_beta: 10.83, T8_gamma: 9.32, AF4_delta: 189.11, AF4_theta: 20.61, AF4_alpha: 6.22, AF4_beta: 12.93, AF4_gamma: 10.95 },
  { timestamp: "2026-09-03 14:44:44.721500", delta: 20.69, theta: 9.14, alpha: 9.97, beta: 11.26, gamma: 7.54, focus: 0.3073, engagement: 0.2618, interest: 0.6177, excitement: 0.7438, stress: 0.4093, relaxation: 0.4485, AF3_delta: 15.50, AF3_theta: 13.72, AF3_alpha: 12.73, AF3_beta: 12.47, AF3_gamma: 8.55, T7_delta: 27.98, T7_theta: 8.85, T7_alpha: 10.97, T7_beta: 13.62, T7_gamma: 10.99, Pz_delta: 42.08, Pz_theta: 9.48, Pz_alpha: 4.90, Pz_beta: 10.92, Pz_gamma: 6.47, T8_delta: 26.65, T8_theta: 10.32, T8_alpha: 11.20, T8_beta: 12.73, T8_gamma: 7.47, AF4_delta: 16.51, AF4_theta: 12.84, AF4_alpha: 13.42, AF4_beta: 16.02, AF4_gamma: 9.87 },
  { timestamp: "2026-09-03 14:44:45.721700", delta: 23.63, theta: 10.51, alpha: 9.15, beta: 11.24, gamma: 11.32, focus: 0.3408, engagement: 0.5284, interest: 0.5702, excitement: 0.7068, stress: 0.4346, relaxation: 0.4594, AF3_delta: 51.33, AF3_theta: 13.12, AF3_alpha: 11.17, AF3_beta: 11.94, AF3_gamma: 14.58, T7_delta: 20.56, T7_theta: 11.04, T7_alpha: 10.56, T7_beta: 12.09, T7_gamma: 11.79, Pz_delta: 14.96, Pz_theta: 9.66, Pz_alpha: 8.25, Pz_beta: 13.89, Pz_gamma: 10.13, T8_delta: 11.18, T8_theta: 13.61, T8_alpha: 9.16, T8_beta: 15.93, T8_gamma: 14.36, AF4_delta: 43.77, AF4_theta: 14.84, AF4_alpha: 10.97, AF4_beta: 13.35, AF4_gamma: 12.57 },
  { timestamp: "2026-09-03 14:44:46.721400", delta: 20.07, theta: 9.38, alpha: 8.48, beta: 7.54, gamma: 5.43, focus: 0.3704, engagement: 0.5148, interest: 0.5133, excitement: 0.6305, stress: 0.4346, relaxation: 0.4346, AF3_delta: 27.09, AF3_theta: 17.79, AF3_alpha: 10.45, AF3_beta: 13.29, AF3_gamma: 12.26, T7_delta: 13.50, T7_theta: 13.69, T7_alpha: 9.91, T7_beta: 9.98, T7_gamma: 7.75, Pz_delta: 48.09, Pz_theta: 14.58, Pz_alpha: 9.79, Pz_beta: 7.40, Pz_gamma: 5.21, T8_delta: 26.39, T8_theta: 8.70, T8_alpha: 7.09, T8_beta: 12.35, T8_gamma: 9.72, AF4_delta: 22.85, AF4_theta: 8.73, AF4_alpha: 8.56, AF4_beta: 15.22, AF4_gamma: 13.00 },
  { timestamp: "2026-09-03 14:44:47.721200", delta: 88.51, theta: 23.20, alpha: 12.55, beta: 13.24, gamma: 8.89, focus: 0.3963, engagement: 0.4898, interest: 0.4938, excitement: 0.5546, stress: 0.4478, relaxation: 0.4491, AF3_delta: 153.86, AF3_theta: 40.37, AF3_alpha: 14.80, AF3_beta: 17.51, AF3_gamma: 16.26, T7_delta: 83.61, T7_theta: 18.56, T7_alpha: 10.73, T7_beta: 17.22, T7_gamma: 11.13, Pz_delta: 133.81, Pz_theta: 20.71, Pz_alpha: 15.63, Pz_beta: 11.94, Pz_gamma: 9.49, T8_delta: 32.72, T8_theta: 17.44, T8_alpha: 14.22, T8_beta: 19.87, T8_gamma: 13.90, AF4_delta: 104.92, AF4_theta: 29.52, AF4_alpha: 13.20, AF4_beta: 17.13, AF4_gamma: 12.13 },
  { timestamp: "2026-09-03 14:44:48.721300", delta: 82.28, theta: 36.50, alpha: 8.15, beta: 10.80, gamma: 7.59, focus: 0.3454, engagement: 0.4375, interest: 0.5112, excitement: 0.5238, stress: 0.5257, relaxation: 0.5302, AF3_delta: 120.91, AF3_theta: 45.89, AF3_alpha: 9.96, AF3_beta: 18.50, AF3_gamma: 17.41, T7_delta: 93.05, T7_theta: 24.84, T7_alpha: 5.67, T7_beta: 16.38, T7_gamma: 12.16, Pz_delta: 98.17, Pz_theta: 50.17, Pz_alpha: 11.41, Pz_beta: 12.88, Pz_gamma: 5.94, T8_delta: 58.42, T8_theta: 33.57, T8_alpha: 10.13, T8_beta: 14.73, T8_gamma: 9.94, AF4_delta: 82.07, AF4_theta: 35.86, AF4_alpha: 12.16, AF4_beta: 12.86, AF4_gamma: 11.06 },
  { timestamp: "2026-09-03 14:44:49.721200", delta: 46.00, theta: 25.55, alpha: 14.23, beta: 25.28, gamma: 29.49, focus: 0.2597, engagement: 0.4567, interest: 0.5612, excitement: 0.5146, stress: 0.5374, relaxation: 0.5668, AF3_delta: 45.34, AF3_theta: 19.93, AF3_alpha: 10.78, AF3_beta: 27.31, AF3_gamma: 28.15, T7_delta: 62.71, T7_theta: 17.04, T7_alpha: 5.94, T7_beta: 24.90, T7_gamma: 27.69, Pz_delta: 110.18, Pz_theta: 119.64, Pz_alpha: 62.39, Pz_beta: 49.46, Pz_gamma: 35.75, T8_delta: 35.74, T8_theta: 17.48, T8_alpha: 12.47, T8_beta: 27.99, T8_gamma: 32.32, AF4_delta: 46.96, AF4_theta: 16.81, AF4_alpha: 9.28, AF4_beta: 27.29, AF4_gamma: 30.56 },
  { timestamp: "2026-09-03 14:44:50.720600", delta: 95.33, theta: 21.50, alpha: 14.08, beta: 13.79, gamma: 10.06, focus: 0.2192, engagement: 0.5514, interest: 0.6034, excitement: 0.5108, stress: 0.5360, relaxation: 0.6073, AF3_delta: 96.09, AF3_theta: 17.29, AF3_alpha: 15.47, AF3_beta: 16.01, AF3_gamma: 14.15, T7_delta: 90.07, T7_theta: 7.00, T7_alpha: 9.28, T7_beta: 14.69, T7_gamma: 16.36, Pz_delta: 205.58, Pz_theta: 83.29, Pz_alpha: 38.79, Pz_beta: 31.44, Pz_gamma: 13.18, T8_delta: 53.18, T8_theta: 13.69, T8_alpha: 6.74, T8_beta: 18.45, T8_gamma: 15.06, AF4_delta: 76.88, AF4_theta: 16.51, AF4_alpha: 15.42, AF4_beta: 17.17, AF4_gamma: 13.96 },
  { timestamp: "2026-09-03 14:44:51.719600", delta: 110.07, theta: 14.24, alpha: 8.51, beta: 14.05, gamma: 12.64, focus: 0.2379, engagement: 0.4906, interest: 0.6778, excitement: 0.5243, stress: 0.5164, relaxation: 0.5672, AF3_delta: 96.62, AF3_theta: 25.55, AF3_alpha: 10.91, AF3_beta: 16.22, AF3_gamma: 19.47, T7_delta: 76.25, T7_theta: 13.48, T7_alpha: 7.08, T7_beta: 18.43, T7_gamma: 14.33, Pz_delta: 199.55, Pz_theta: 56.79, Pz_alpha: 22.24, Pz_beta: 17.91, Pz_gamma: 20.40, T8_delta: 117.82, T8_theta: 6.03, T8_alpha: 5.51, T8_beta: 19.16, T8_gamma: 13.50, AF4_delta: 80.71, AF4_theta: 22.14, AF4_alpha: 6.85, AF4_beta: 15.60, AF4_gamma: 16.68 },
  { timestamp: "2026-09-03 14:44:52.719100", delta: 65.91, theta: 13.57, alpha: 8.82, beta: 12.62, gamma: 10.90, focus: 0.2540, engagement: 0.4936, interest: 0.7497, excitement: 0.5424, stress: 0.4546, relaxation: 0.4708, AF3_delta: 68.24, AF3_theta: 18.59, AF3_alpha: 10.10, AF3_beta: 13.39, AF3_gamma: 10.21, T7_delta: 42.00, T7_theta: 14.54, T7_alpha: 7.59, T7_beta: 22.51, T7_gamma: 15.40, Pz_delta: 171.21, Pz_theta: 31.42, Pz_alpha: 13.88, Pz_beta: 13.42, Pz_gamma: 13.75, T8_delta: 29.12, T8_theta: 11.06, T8_alpha: 9.84, T8_beta: 19.44, T8_gamma: 14.40, AF4_delta: 54.32, AF4_theta: 16.46, AF4_alpha: 9.54, AF4_beta: 15.80, AF4_gamma: 12.97 }
];

const DEFAULT_SAMPLE_B = [
  { timestamp: "2026-09-03 14:44:42.722300", delta: 68.45, theta: 9.12, alpha: 7.53, beta: 8.12, gamma: 7.66, focus: 0.2255, engagement: 0.5030, interest: 0.7282, excitement: 0.7052, stress: 0.4110, relaxation: 0.4525, AF3_delta: 52.32, AF3_theta: 9.86, AF3_alpha: 7.23, AF3_beta: 7.86, AF3_gamma: 7.25, T7_delta: 63.19, T7_theta: 15.28, T7_alpha: 7.21, T7_beta: 16.57, T7_gamma: 16.83, Pz_delta: 121.14, Pz_theta: 22.81, Pz_alpha: 18.17, Pz_beta: 13.15, Pz_gamma: 8.22, T8_delta: 47.30, T8_theta: 9.98, T8_alpha: 6.98, T8_beta: 10.19, T8_gamma: 7.69, AF4_delta: 67.01, AF4_theta: 8.65, AF4_alpha: 9.88, AF4_beta: 9.20, AF4_gamma: 8.25 },
  { timestamp: "2026-09-03 14:44:43.722200", delta: 128.31, theta: 9.71, alpha: 5.18, beta: 8.82, gamma: 6.87, focus: 0.2793, engagement: 0.1964, interest: 0.6714, excitement: 0.7198, stress: 0.3680, relaxation: 0.4216, AF3_delta: 224.40, AF3_theta: 26.53, AF3_alpha: 11.22, AF3_beta: 13.10, AF3_gamma: 7.58, T7_delta: 94.30, T7_theta: 4.36, T7_alpha: 6.40, T7_beta: 7.87, T7_gamma: 12.30, Pz_delta: 74.39, Pz_theta: 15.73, Pz_alpha: 6.31, Pz_beta: 9.16, Pz_gamma: 6.96, T8_delta: 99.74, T8_theta: 11.70, T8_alpha: 8.50, T8_beta: 10.43, T8_gamma: 9.02, AF4_delta: 183.11, AF4_theta: 19.81, AF4_alpha: 5.92, AF4_beta: 12.53, AF4_gamma: 10.65 },
  { timestamp: "2026-09-03 14:44:44.721500", delta: 21.69, theta: 9.34, alpha: 9.67, beta: 10.96, gamma: 7.34, focus: 0.3273, engagement: 0.2818, interest: 0.6377, excitement: 0.7238, stress: 0.3893, relaxation: 0.4685, AF3_delta: 16.50, AF3_theta: 13.22, AF3_alpha: 12.33, AF3_beta: 12.17, AF3_gamma: 8.25, T7_delta: 26.98, T7_theta: 8.55, T7_alpha: 10.67, T7_beta: 13.22, T7_gamma: 10.69, Pz_delta: 40.08, Pz_theta: 9.18, Pz_alpha: 4.70, Pz_beta: 10.62, Pz_gamma: 6.27, T8_delta: 25.65, T8_theta: 9.92, T8_alpha: 10.90, T8_beta: 12.33, T8_gamma: 7.27, AF4_delta: 17.51, AF4_theta: 12.44, AF4_alpha: 13.12, AF4_beta: 15.62, AF4_gamma: 9.57 },
  { timestamp: "2026-09-03 14:44:45.721700", delta: 24.63, theta: 10.21, alpha: 8.85, beta: 10.94, gamma: 11.02, focus: 0.3608, engagement: 0.5484, interest: 0.5902, excitement: 0.6868, stress: 0.4146, relaxation: 0.4794, AF3_delta: 49.33, AF3_theta: 12.82, AF3_alpha: 10.87, AF3_beta: 11.64, AF3_gamma: 14.28, T7_delta: 21.56, T7_theta: 10.74, T7_alpha: 10.26, T7_beta: 11.79, T7_gamma: 11.49, Pz_delta: 15.96, Pz_theta: 9.36, Pz_alpha: 7.95, Pz_beta: 13.59, Pz_gamma: 9.83, T8_delta: 12.18, T8_theta: 13.21, T8_alpha: 8.86, T8_beta: 15.53, T8_gamma: 14.06, AF4_delta: 41.77, AF4_theta: 14.44, AF4_alpha: 10.67, AF4_beta: 12.95, AF4_gamma: 12.27 },
  { timestamp: "2026-09-03 14:44:46.721400", delta: 21.07, theta: 9.08, alpha: 8.18, beta: 7.24, gamma: 5.23, focus: 0.3904, engagement: 0.5348, interest: 0.5333, excitement: 0.6105, stress: 0.4146, relaxation: 0.4546, AF3_delta: 26.09, AF3_theta: 17.29, AF3_alpha: 10.15, AF3_beta: 12.99, AF3_gamma: 11.96, T7_delta: 14.50, T7_theta: 13.29, T7_alpha: 9.61, T7_beta: 9.68, T7_gamma: 7.45, Pz_delta: 46.09, Pz_theta: 14.18, Pz_alpha: 9.49, Pz_beta: 7.10, Pz_gamma: 4.91, T8_delta: 25.39, T8_theta: 8.40, T8_alpha: 6.79, T8_beta: 11.95, T8_gamma: 9.42, AF4_delta: 21.85, AF4_theta: 8.43, AF4_alpha: 8.26, AF4_beta: 14.82, AF4_gamma: 12.70 },
  { timestamp: "2026-09-03 14:44:47.721200", delta: 85.51, theta: 22.60, alpha: 12.15, beta: 12.84, gamma: 8.59, focus: 0.4163, engagement: 0.5098, interest: 0.5138, excitement: 0.5346, stress: 0.4278, relaxation: 0.4691, AF3_delta: 149.86, AF3_theta: 39.37, AF3_alpha: 14.40, AF3_beta: 17.11, AF3_gamma: 15.86, T7_delta: 81.61, T7_theta: 18.16, T7_alpha: 10.43, T7_beta: 16.82, T7_gamma: 10.83, Pz_delta: 129.81, Pz_theta: 20.21, Pz_alpha: 15.23, Pz_beta: 11.54, Pz_gamma: 9.19, T8_delta: 31.72, T8_theta: 16.94, T8_alpha: 13.82, T8_beta: 19.37, T8_gamma: 13.50, AF4_delta: 101.92, AF4_theta: 28.92, AF4_alpha: 12.90, AF4_beta: 16.73, AF4_gamma: 11.83 },
  { timestamp: "2026-09-03 14:44:48.721300", delta: 79.28, theta: 35.50, alpha: 7.85, beta: 10.40, gamma: 7.29, focus: 0.3654, engagement: 0.4575, interest: 0.5312, excitement: 0.5038, stress: 0.5057, relaxation: 0.5502, AF3_delta: 116.91, AF3_theta: 44.89, AF3_alpha: 9.66, AF3_beta: 18.10, AF3_gamma: 17.01, T7_delta: 90.05, T7_theta: 24.34, T7_alpha: 5.37, T7_beta: 15.98, T7_gamma: 11.86, Pz_delta: 95.17, Pz_theta: 49.17, Pz_alpha: 11.11, Pz_beta: 12.48, Pz_gamma: 5.64, T8_delta: 56.42, T8_theta: 32.87, T8_alpha: 9.83, T8_beta: 14.33, T8_gamma: 9.64, AF4_delta: 79.07, AF4_theta: 35.16, AF4_alpha: 11.86, AF4_beta: 12.46, AF4_gamma: 10.76 },
  { timestamp: "2026-09-03 14:44:49.721200", delta: 44.00, theta: 24.85, alpha: 13.83, beta: 24.78, gamma: 28.89, focus: 0.2797, engagement: 0.4767, interest: 0.5812, excitement: 0.4946, stress: 0.5174, relaxation: 0.5868, AF3_delta: 43.34, AF3_theta: 19.33, AF3_alpha: 10.48, AF3_beta: 26.81, AF3_gamma: 27.65, T7_delta: 60.71, T7_theta: 16.54, T7_alpha: 5.64, T7_beta: 24.40, T7_gamma: 27.19, Pz_delta: 107.18, Pz_theta: 116.64, Pz_alpha: 61.19, Pz_beta: 48.86, Pz_gamma: 35.15, T8_delta: 34.74, T8_theta: 17.08, T8_alpha: 12.17, T8_beta: 27.49, T8_gamma: 31.72, AF4_delta: 44.96, AF4_theta: 16.31, AF4_alpha: 8.98, AF4_beta: 26.79, AF4_gamma: 29.96 },
  { timestamp: "2026-09-03 14:44:50.720600", delta: 92.33, theta: 20.90, alpha: 13.68, beta: 13.39, gamma: 9.76, focus: 0.2392, engagement: 0.5714, interest: 0.6234, excitement: 0.4908, stress: 0.5160, relaxation: 0.6273, AF3_delta: 93.09, AF3_theta: 16.79, AF3_alpha: 15.07, AF3_beta: 15.61, AF3_gamma: 13.75, T7_delta: 87.07, T7_theta: 6.70, T7_alpha: 8.98, T7_beta: 14.29, T7_gamma: 15.86, Pz_delta: 201.58, Pz_theta: 81.29, Pz_alpha: 37.99, Pz_beta: 30.84, Pz_gamma: 12.78, T8_delta: 51.18, T8_theta: 13.29, T8_alpha: 6.44, T8_beta: 18.05, T8_gamma: 14.66, AF4_delta: 74.88, AF4_theta: 16.01, AF4_alpha: 15.02, AF4_beta: 16.67, AF4_gamma: 13.56 },
  { timestamp: "2026-09-03 14:44:51.719600", delta: 106.07, theta: 13.84, alpha: 8.21, beta: 13.65, gamma: 12.24, focus: 0.2579, engagement: 0.5106, interest: 0.6978, excitement: 0.5043, stress: 0.4964, relaxation: 0.5872, AF3_delta: 93.62, AF3_theta: 24.85, AF3_alpha: 10.61, AF3_beta: 15.82, AF3_gamma: 19.07, T7_delta: 73.25, T7_theta: 13.08, T7_alpha: 6.78, T7_beta: 17.93, T7_gamma: 13.93, Pz_delta: 195.55, Pz_theta: 55.19, Pz_alpha: 21.74, Pz_beta: 17.41, Pz_gamma: 19.90, T8_delta: 114.82, T8_theta: 5.83, T8_alpha: 5.21, T8_beta: 18.66, T8_gamma: 13.10, AF4_delta: 77.71, AF4_theta: 21.64, AF4_alpha: 6.55, AF4_beta: 15.10, AF4_gamma: 16.28 },
  { timestamp: "2026-09-03 14:44:52.719100", delta: 63.91, theta: 13.17, alpha: 8.52, beta: 12.22, gamma: 10.50, focus: 0.2740, engagement: 0.5136, interest: 0.7697, excitement: 0.5224, stress: 0.4346, relaxation: 0.4908, AF3_delta: 65.24, AF3_theta: 18.09, AF3_alpha: 9.80, AF3_beta: 12.99, AF3_gamma: 9.81, T7_delta: 40.00, T7_theta: 14.14, T7_alpha: 7.29, T7_beta: 21.91, T7_gamma: 14.90, Pz_delta: 167.21, Pz_theta: 30.72, Pz_alpha: 13.48, Pz_beta: 12.92, Pz_gamma: 13.35, T8_delta: 27.12, T8_theta: 10.66, T8_alpha: 9.54, T8_beta: 18.94, T8_gamma: 13.90, AF4_delta: 51.32, AF4_theta: 15.96, AF4_alpha: 9.24, AF4_beta: 15.30, AF4_gamma: 12.57 }
];

function App() {
  const [theme, setTheme] = useState('light');
  
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [dataA, setDataA] = useState([]);
  const [dataB, setDataB] = useState([]);
  
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
    setFileA({ name: 'eeg_personA_37col.csv' });
    setFileB({ name: 'eeg_personB_37col.csv' });
    setError('');
    setTimeout(() => {
      // Trigger analyze directly
      computeAnalysis(DEFAULT_SAMPLE_A, DEFAULT_SAMPLE_B);
    }, 50);
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

    for (let i = startIndex; i < minLen; i++) {
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

    // 1. Process Raw Channels
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

    // 2. Compute Tri-Region Weighted Average Gamma Time-Series
    const integratedGammaA = calculateWeightedGamma(pPzA, pT7A, pT8A, wPz, wT7, wT8);
    const integratedGammaB = calculateWeightedGamma(pPzB, pT7B, pT8B, wPz, wT7, wT8);

    // 3. Time-Lag or Standard Correlation on Integrated Gamma
    let pGamma = 0;
    let detectedLag = 0;
    if (useTimeLag) {
      const lagRes = timeLaggedSpearmanCorrelation(integratedGammaA, integratedGammaB, 3);
      pGamma = lagRes.maxCorr;
      detectedLag = lagRes.optimalLag;
    } else {
      pGamma = spearmanCorrelation(integratedGammaA, integratedGammaB);
    }

    // 4. Channel-by-Channel Correlation Coefficients
    const rPz = spearmanCorrelation(pPzA, pPzB);
    const rT7 = spearmanCorrelation(pT7A, pT7B);
    const rT8 = spearmanCorrelation(pT8A, pT8B);

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

    // 6. Continuous Avoidance Penalty
    const avoidanceResult = calculateContinuousAvoidancePenalty(pAF3A, pAF4A, pAF3B, pAF4B, wFaa);
    
    // 7. Advanced TR-SEM v3.0 Final Score
    const syncCalculation = calculateImprovedSyncScore({
      multiGammaCorr: pGamma,
      channelCorrs: { rPz, rT7, rT8 },
      channelWeights: { wPz, wT7, wT8 },
      rAvoidance: avoidanceResult.rAvoidance,
      avoidancePenalty: avoidanceResult.penaltyFactor,
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
      pGamma, rAvoidance: avoidanceResult.rAvoidance, detectedLag,
      avoidancePenalty: avoidanceResult.penaltyFactor,
      emotionHarmony,
      channelCorrs: { rPz, rT7, rT8 },
      weights: { wPz, wT7, wT8 },
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
      legend: { position: 'top', labels: { color: textColor, font: { family: 'Noto Sans KR', size: 12 } } }
    },
    scales: {
      x: { 
        title: { display: true, text: '시간 흐름 (Time / Sec)', color: textColor, font: { family: 'Noto Sans KR', size: 11, weight: 'bold' } },
        grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } 
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
                📐 <strong>가중평균 통합 감마파 공식</strong>: Gamma_Integrated(t) = ({Math.round(wPz*100)}% × Pz + {Math.round(wT7*100)}% × T7 + {Math.round(wT8*100)}% × T8) / {Math.round((wPz+wT7+wT8)*100)}%
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

                {/* TRI-REGION BRAIN MAP & CHANNEL SYNCHRONY STATS */}
                <div className="brain-map-section">
                  <div className="brain-map-header">
                    <h3 className="chart-title">🧠 3개 전극 영역별 개별 동조율 & 뇌 지도 (Topography Map)</h3>
                    <p className="chart-subtitle">Pz(두정엽), T7(좌측두엽), T8(우측두엽) 각 영역별 두 참여자 간의 독립 상관계수</p>
                  </div>

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
                        <circle cx="60" cy="150" r="16" className="sensor-node temporal-t7 active-pulse" />
                        <text x="60" y="154" className="sensor-text active">T7</text>

                        {/* T8 (Right Temporal) */}
                        <circle cx="240" cy="150" r="16" className="sensor-node temporal-t8 active-pulse" />
                        <text x="240" y="154" className="sensor-text active">T8</text>

                        {/* Pz (Parietal Midline) */}
                        <circle cx="150" cy="205" r="18" className="sensor-node parietal-pz active-pulse" />
                        <text x="150" y="209" className="sensor-text active">Pz</text>
                      </svg>
                      <div className="brain-map-caption">
                        <span>● Pz: 두정엽 (주의·인지)</span>
                        <span>● T7: 좌측두엽 (언어)</span>
                        <span>● T8: 우측두엽 (공감)</span>
                      </div>
                    </div>

                    {/* Channel Cards */}
                    <div className="channel-stats-list">
                      
                      <div className="channel-stat-item">
                        <div className="stat-channel-head">
                          <span className="stat-tag pz">Pz 두정엽</span>
                          <span className="stat-role">고차원 인지 몰입 & 주의집중</span>
                          <span className="stat-weight">가중치 {Math.round(wPz * 100)}%</span>
                        </div>
                        <div className="stat-val-bar">
                          <div className="stat-bar-fill pz-fill" style={{ width: `${Math.max(0, Math.min(100, ((results.channelCorrs.rPz + 1) / 2) * 100))}%` }} />
                        </div>
                        <div className="stat-val-text">
                          상관계수 $r = {results.channelCorrs.rPz.toFixed(3)}$ (동조율 {Math.round(((results.channelCorrs.rPz + 1) / 2) * 100)}점)
                        </div>
                      </div>

                      <div className="channel-stat-item">
                        <div className="stat-channel-head">
                          <span className="stat-tag t7">T7 좌측두엽</span>
                          <span className="stat-role">언어적 대화 & 구어 소통</span>
                          <span className="stat-weight">가중치 {Math.round(wT7 * 100)}%</span>
                        </div>
                        <div className="stat-val-bar">
                          <div className="stat-bar-fill t7-fill" style={{ width: `${Math.max(0, Math.min(100, ((results.channelCorrs.rT7 + 1) / 2) * 100))}%` }} />
                        </div>
                        <div className="stat-val-text">
                          상관계수 $r = {results.channelCorrs.rT7.toFixed(3)}$ (동조율 {Math.round(((results.channelCorrs.rT7 + 1) / 2) * 100)}점)
                        </div>
                      </div>

                      <div className="channel-stat-item">
                        <div className="stat-channel-head">
                          <span className="stat-tag t8">T8 우측두엽</span>
                          <span className="stat-role">정서적 억양 & 비언어적 공감</span>
                          <span className="stat-weight">가중치 {Math.round(wT8 * 100)}%</span>
                        </div>
                        <div className="stat-val-bar">
                          <div className="stat-bar-fill t8-fill" style={{ width: `${Math.max(0, Math.min(100, ((results.channelCorrs.rT8 + 1) / 2) * 100))}%` }} />
                        </div>
                        <div className="stat-val-text">
                          상관계수 $r = {results.channelCorrs.rT8.toFixed(3)}$ (동조율 {Math.round(((results.channelCorrs.rT8 + 1) / 2) * 100)}점)
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
              <h3 className="chart-title" style={{ marginBottom: '1.5rem' }}>실험 진행 절차 (총 20분 소요)</h3>
              
              <div className="protocol-timeline">
                <div className="protocol-step-card sensor">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 01</div>
                    <div className="step-time-duration">00:00 ~ 05:00 (5분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Cpu size={20} style={{ color: 'var(--accent-teal)' }} /> 센서 부착 및 3영역 신호 품질 점검</h4>
                    <p className="step-content-desc">AF3, AF4, T7, T8, Pz 5개 채널의 접촉 임피던스를 확인하고 센서 노이즈를 보정합니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card baseline">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 02</div>
                    <div className="step-time-duration">05:00 ~ 08:00 (3분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Zap size={20} style={{ color: 'var(--accent-blue)' }} /> 1차 베이스라인 (휴식기) 측정</h4>
                    <p className="step-content-desc">눈을 감거나 편안히 응시하며 각 개인의 기저 뇌파 주파수 특성을 기록합니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card interaction">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 03</div>
                    <div className="step-time-duration">08:00 ~ 15:00 (7분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Activity size={20} style={{ color: 'var(--accent-purple)' }} /> 1차 대화 세션 (스몰 토크 및 주제 토론)</h4>
                    <p className="step-content-desc">자연스러운 대화를 진행하며 언어(T7), 공감(T8), 인지(Pz) 영역의 감마파 동기화를 실시간 추출합니다.</p>
                  </div>
                </div>

                <div className="protocol-step-card interaction">
                  <div className="step-time-badge">
                    <div className="step-time-title">STEP 04</div>
                    <div className="step-time-duration">15:00 ~ 20:00 (5분)</div>
                  </div>
                  <div>
                    <h4 className="step-content-title"><Sparkles size={20} style={{ color: 'var(--accent-amber)' }} /> 2차 심층 상호작용 및 정서 평가</h4>
                    <p className="step-content-desc">깊은 공감대 형성 대화를 진행하고 설문 및 6대 정서 프로파일과 비교 검증합니다.</p>
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
