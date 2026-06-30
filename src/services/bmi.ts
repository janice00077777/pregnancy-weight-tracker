import type { BMICategory } from '../types/pregnancy';

export type BMIInput = {
  heightCm: number;
  weightKg: number;
};

export type BMIResult = {
  bmi: number;
  category: BMICategory;
};

export const BMI_CATEGORY_LABELS: Record<BMICategory, string> = {
  underweight: '偏瘦',
  normal: '正常',
  overweight: '超重',
  obese: '肥胖',
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

export const isValidBMIInput = ({ heightCm, weightKg }: BMIInput) =>
  Number.isFinite(heightCm) && Number.isFinite(weightKg) && heightCm > 0 && weightKg > 0;

export const calculateBMI = ({ heightCm, weightKg }: BMIInput): number => {
  if (!isValidBMIInput({ heightCm, weightKg })) {
    return Number.NaN;
  }

  const heightM = heightCm / 100;
  return roundToOneDecimal(weightKg / (heightM * heightM));
};

export const getBMICategory = (bmi: number): BMICategory => {
  if (!Number.isFinite(bmi)) {
    return 'normal';
  }

  if (bmi < 18.5) {
    return 'underweight';
  }

  if (bmi < 24) {
    return 'normal';
  }

  if (bmi < 28) {
    return 'overweight';
  }

  return 'obese';
};

export const getBMICategoryLabel = (category: BMICategory) => BMI_CATEGORY_LABELS[category];

export const calculateBMIResult = (input: BMIInput): BMIResult => {
  const bmi = calculateBMI(input);

  return {
    bmi,
    category: getBMICategory(bmi),
  };
};

