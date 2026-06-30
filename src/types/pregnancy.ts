export type BMICategory = 'underweight' | 'normal' | 'overweight' | 'obese';

export type PregnancyProfile = {
  dueDate: string;
  heightCm: number;
  preWeightKg: number;
  preBMI: number;
  bmiCategory: BMICategory;
  updatedAt?: number;
};

export type WeightRecord = {
  date: string;
  weightKg: number;
  note?: string;
  createdAt: number;
};

