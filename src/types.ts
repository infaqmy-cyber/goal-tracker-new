export interface MonthlyData {
  month: string;
  targetAce: number;
  achievedAce: number;
  targetCases: number;
  cases: number;
  averageCaseSize: number;
}

export interface BusinessTarget {
  year: number;
  overallTargetAce: number;
  overallTargetCases: number;
  overallTargetAcs: number;
  monthlyBreakdown: MonthlyData[];
  closingRatio?: number;
  closingRatioPresentation?: number;
}

export type Currency = 'MYR';

export const MONTHS = [
  'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 
  'Oktober', 'November', 'Disember', 'Januari', 'Februari', 'Mac'
];
