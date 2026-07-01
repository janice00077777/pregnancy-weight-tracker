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
  weeklyGainAfterWeek12Kg: {
    min: number;
    max: number;
  };
  weeklyRanges: GestationalWeightRange[];
};

export const GESTATIONAL_WEEK_MIN = 1;
export const GESTATIONAL_WEEK_MAX = 40;
export const FIRST_TRIMESTER_END_WEEK = 12;

export const WEIGHT_STANDARD_SOURCE = {
  code: 'WS/T 809-2022',
  title: '孕期体重增长监测与评价',
  note:
    '本表按产品架构中指定的 WS/T 809-2022 作为标准来源集中维护；上线前应以正式标准原文再次复核参数。',
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
}: {
  category: BMICategory;
  bmiLabel: string;
  bmiRangeText: string;
  totalGainMinKg: number;
  totalGainMaxKg: number;
  firstTrimesterMinKg?: number;
  firstTrimesterMaxKg?: number;
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
    weeklyGainAfterWeek12Kg: {
      min: roundToOneDecimal((totalGainMinKg - firstTrimesterMinKg) / laterPregnancyWeeks),
      max: roundToOneDecimal((totalGainMaxKg - firstTrimesterMaxKg) / laterPregnancyWeeks),
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
  }),
  normal: createBMIGainStandard({
    category: 'normal',
    bmiLabel: '正常',
    bmiRangeText: '18.5 <= BMI < 24',
    totalGainMinKg: 8,
    totalGainMaxKg: 14,
  }),
  overweight: createBMIGainStandard({
    category: 'overweight',
    bmiLabel: '偏高',
    bmiRangeText: '24 <= BMI < 28',
    totalGainMinKg: 7,
    totalGainMaxKg: 11,
  }),
  obese: createBMIGainStandard({
    category: 'obese',
    bmiLabel: '偏高较多',
    bmiRangeText: 'BMI >= 28',
    totalGainMinKg: 5,
    totalGainMaxKg: 9,
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
