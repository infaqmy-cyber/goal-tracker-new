import { BusinessTarget, MONTHS } from './types';

export const INITIAL_DATA: BusinessTarget = {
  year: 2024,
  overallTargetAce: 120000,
  overallTargetCases: 48,
  overallTargetAcs: 2500,
  monthlyBreakdown: MONTHS.map((month, index) => ({
    month,
    targetAce: 10000,
    achievedAce: index < 2 ? Math.floor(Math.random() * 12000) + 5000 : 0,
    targetCases: 4,
    cases: index < 2 ? Math.floor(Math.random() * 5) + 2 : 0,
    averageCaseSize: index < 2 ? 3000 : 0,
  })),
};
