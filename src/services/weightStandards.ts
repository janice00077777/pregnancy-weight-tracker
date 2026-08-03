import type { BMICategory } from '../types/pregnancy';

export type GestationalWeightRange = {
  week: number;
  minGainKg: number;
  maxGainKg: number;
};

export type WeightStatus = 'low' | 'normal' | 'high';

export type BMIGainStandard = {
  category: BMICategory;
  bmiLabel: string;
  bmiRangeText: string;
  totalGainRangeKg: {
    min: number;
    max: number;
  };
  firstTrimesterGainRangeKg: {
    min: number;
    max: number;
  };
  weeklyGainFromSecondTrimesterKg: {
    recommended: number;
    min: number;
    max: number;
  };
  weeklyRanges: GestationalWeightRange[];
};

export const GESTATIONAL_WEEK_MIN = 1;
export const GESTATIONAL_WEEK_MAX = 40;
export const FIRST_TRIMESTER_END_WEEK = 13;

export const WEIGHT_STANDARD_SOURCE = {
  code: 'WS/T 801—2022',
  title: '妊娠期妇女体重增长推荐值标准',
  note:
    '适用于我国妇女单胎自然妊娠；逐周累计参考带是依据标准中的孕早期和全孕期总增重范围生成的估算轨迹，并非标准原文提供的逐周界值。',
} as const;

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const buildWeeklyRanges = ({
  totalGainMinKg,
  totalGainMaxKg,
  firstTrimesterMinKg,
  firstTrimesterMaxKg,
}: {
  totalGainMinKg: number;
  totalGainMaxKg: number;
  firstTrimesterMinKg: number;
  firstTrimesterMaxKg: number;
}): GestationalWeightRange[] => {
  const laterPregnancyWeeks = GESTATIONAL_WEEK_MAX - FIRST_TRIMESTER_END_WEEK;
  const minWeeklyGainAfterWeek12 = (totalGainMinKg - firstTrimesterMinKg) / laterPregnancyWeeks;
  const maxWeeklyGainAfterWeek12 = (totalGainMaxKg - firstTrimesterMaxKg) / laterPregnancyWeeks;

  return Array.from({ length: GESTATIONAL_WEEK_MAX }, (_, index) => {
    const week = index + 1;

    if (week <= FIRST_TRIMESTER_END_WEEK) {
      const progress = week / FIRST_TRIMESTER_END_WEEK;

      return {
        week,
        minGainKg: roundToOneDecimal(firstTrimesterMinKg * progress),
        maxGainKg: roundToOneDecimal(firstTrimesterMaxKg * progress),
      };
    }

    const weeksAfterFirstTrimester = week - FIRST_TRIMESTER_END_WEEK;

    return {
      week,
      minGainKg: roundToOneDecimal(
        firstTrimesterMinKg + minWeeklyGainAfterWeek12 * weeksAfterFirstTrimester,
      ),
      maxGainKg: roundToOneDecimal(
        firstTrimesterMaxKg + maxWeeklyGainAfterWeek12 * weeksAfterFirstTrimester,
      ),
    };
  });
};

const createBMIGainStandard = ({
  category,
  bmiLabel,
  bmiRangeText,
  totalGainMinKg,
  totalGainMaxKg,
  firstTrimesterMinKg = 0,
  firstTrimesterMaxKg = 2,
  laterWeeklyRecommendedKg,
  laterWeeklyMinKg,
  laterWeeklyMaxKg,
}: {
  category: BMICategory;
  bmiLabel: string;
  bmiRangeText: string;
  totalGainMinKg: number;
  totalGainMaxKg: number;
  firstTrimesterMinKg?: number;
  firstTrimesterMaxKg?: number;
  laterWeeklyRecommendedKg: number;
  laterWeeklyMinKg: number;
  laterWeeklyMaxKg: number;
}): BMIGainStandard => {
  const laterPregnancyWeeks = GESTATIONAL_WEEK_MAX - FIRST_TRIMESTER_END_WEEK;

  return {
    category,
    bmiLabel,
    bmiRangeText,
    totalGainRangeKg: {
      min: totalGainMinKg,
      max: totalGainMaxKg,
    },
    firstTrimesterGainRangeKg: {
      min: firstTrimesterMinKg,
      max: firstTrimesterMaxKg,
    },
    weeklyGainFromSecondTrimesterKg: {
      recommended: laterWeeklyRecommendedKg,
      min: laterWeeklyMinKg,
      max: laterWeeklyMaxKg,
    },
    weeklyRanges: buildWeeklyRanges({
      totalGainMinKg,
      totalGainMaxKg,
      firstTrimesterMinKg,
      firstTrimesterMaxKg,
    }),
  };
};

export const BMI_GAIN_STANDARD_TABLE: Record<BMICategory, BMIGainStandard> = {
  underweight: createBMIGainStandard({
    category: 'underweight',
    bmiLabel: '偏瘦',
    bmiRangeText: 'BMI < 18.5',
    totalGainMinKg: 11,
    totalGainMaxKg: 16,
    laterWeeklyRecommendedKg: 0.46,
    laterWeeklyMinKg: 0.37,
    laterWeeklyMaxKg: 0.56,
  }),
  normal: createBMIGainStandard({
    category: 'normal',
    bmiLabel: '正常',
    bmiRangeText: '18.5 <= BMI < 24',
    totalGainMinKg: 8,
    totalGainMaxKg: 14,
    laterWeeklyRecommendedKg: 0.37,
    laterWeeklyMinKg: 0.26,
    laterWeeklyMaxKg: 0.48,
  }),
  overweight: createBMIGainStandard({
    category: 'overweight',
    bmiLabel: '偏高',
    bmiRangeText: '24 <= BMI < 28',
    totalGainMinKg: 7,
    totalGainMaxKg: 11,
    laterWeeklyRecommendedKg: 0.3,
    laterWeeklyMinKg: 0.22,
    laterWeeklyMaxKg: 0.37,
  }),
  obese: createBMIGainStandard({
    category: 'obese',
    bmiLabel: '偏高较多',
    bmiRangeText: 'BMI >= 28',
    totalGainMinKg: 5,
    totalGainMaxKg: 9,
    laterWeeklyRecommendedKg: 0.22,
    laterWeeklyMinKg: 0.15,
    laterWeeklyMaxKg: 0.3,
  }),
};

export const BMI_GAIN_STANDARD_CATEGORIES = Object.keys(
  BMI_GAIN_STANDARD_TABLE,
) as BMICategory[];

export const WEIGHT_STATUS_LABELS: Record<WeightStatus, string> = {
  low: '低于参考范围',
  normal: '参考范围内',
  high: '高于参考范围',
};

export const isValidGestationalWeek = (week: number) =>
  Number.isInteger(week) && week >= GESTATIONAL_WEEK_MIN && week <= GESTATIONAL_WEEK_MAX;

export const getStandardRange = (
  bmiCategory: BMICategory,
  gestationalWeek: number,
): GestationalWeightRange | null => {
  if (!isValidGestationalWeek(gestationalWeek)) {
    return null;
  }

  return BMI_GAIN_STANDARD_TABLE[bmiCategory].weeklyRanges[gestationalWeek - 1] ?? null;
};

export const getWeightStatus = (
  actualGainKg: number,
  standardRange: Pick<GestationalWeightRange, 'minGainKg' | 'maxGainKg'> | null,
): WeightStatus | null => {
  if (!standardRange || !Number.isFinite(actualGainKg)) {
    return null;
  }

  if (actualGainKg < standardRange.minGainKg) {
    return 'low';
  }

  if (actualGainKg > standardRange.maxGainKg) {
    return 'high';
  }

  return 'normal';
};

export const getWeightStatusLabel = (status: WeightStatus) => WEIGHT_STATUS_LABELS[status];
