import { addDaysToDateOnly, getTodayDateOnly } from './pregnancy';
import type { WeightRecord } from '../types/pregnancy';

export const QUICK_NOTES = ['晨起空腹', '浮肿日'] as const;

export type QuickNote = (typeof QUICK_NOTES)[number];

export type WeightSaveFeedback = {
  todayWeightKg: number;
  lastWeekAverageKg: number | null;
  differenceKg: number | null;
  sampleCount: number;
};

export const roundWeightToOneDecimal = (weight: number) => Math.round(weight * 10) / 10;

export const formatWeightInput = (weight: number) => roundWeightToOneDecimal(weight).toFixed(1);

export const parseWeightInput = (value: string): number | null => {
  const trimmedValue = value.trim();

  if (!/^\d{1,3}(\.\d)?$/.test(trimmedValue)) {
    return null;
  }

  const weight = Number(trimmedValue);

  if (!Number.isFinite(weight) || weight <= 0) {
    return null;
  }

  return roundWeightToOneDecimal(weight);
};

export const getLatestRecordForDate = (
  records: WeightRecord[],
  date = getTodayDateOnly(),
): WeightRecord | null => {
  const matchedRecords = records.filter((record) => record.date === date);

  if (matchedRecords.length === 0) {
    return null;
  }

  return matchedRecords.reduce((latestRecord, record) =>
    record.createdAt > latestRecord.createdAt ? record : latestRecord,
  );
};

export const createWeightRecord = ({
  date = getTodayDateOnly(),
  weightKg,
  note,
}: {
  date?: string;
  weightKg: number;
  note?: string;
}): WeightRecord => ({
  date,
  weightKg: roundWeightToOneDecimal(weightKg),
  note,
  createdAt: Date.now(),
});

export const sortRecordsByDateDesc = (records: WeightRecord[]) =>
  [...records].sort((a, b) => {
    if (a.date === b.date) {
      return b.createdAt - a.createdAt;
    }

    return b.date.localeCompare(a.date);
  });

export const upsertRecordByDate = (records: WeightRecord[], nextRecord: WeightRecord) => {
  const recordsWithoutSameDate = records.filter((record) => record.date !== nextRecord.date);

  return sortRecordsByDateDesc([...recordsWithoutSameDate, nextRecord]);
};

export const calculateLastWeekAverage = (
  records: WeightRecord[],
  date = getTodayDateOnly(),
): { averageKg: number; sampleCount: number } | null => {
  const startDate = addDaysToDateOnly(date, -7);

  if (!startDate) {
    return null;
  }

  const latestRecordsByDate = new Map<string, WeightRecord>();

  records.forEach((record) => {
    if (record.date < startDate || record.date >= date) {
      return;
    }

    const currentRecord = latestRecordsByDate.get(record.date);

    if (!currentRecord || record.createdAt > currentRecord.createdAt) {
      latestRecordsByDate.set(record.date, record);
    }
  });

  const lastWeekRecords = Array.from(latestRecordsByDate.values());

  if (lastWeekRecords.length === 0) {
    return null;
  }

  const totalWeight = lastWeekRecords.reduce((sum, record) => sum + record.weightKg, 0);

  return {
    averageKg: roundWeightToOneDecimal(totalWeight / lastWeekRecords.length),
    sampleCount: lastWeekRecords.length,
  };
};

export const createWeightSaveFeedback = (
  records: WeightRecord[],
  todayRecord: WeightRecord,
): WeightSaveFeedback => {
  const lastWeekAverage = calculateLastWeekAverage(records, todayRecord.date);

  if (!lastWeekAverage) {
    return {
      todayWeightKg: todayRecord.weightKg,
      lastWeekAverageKg: null,
      differenceKg: null,
      sampleCount: 0,
    };
  }

  return {
    todayWeightKg: todayRecord.weightKg,
    lastWeekAverageKg: lastWeekAverage.averageKg,
    differenceKg: roundWeightToOneDecimal(todayRecord.weightKg - lastWeekAverage.averageKg),
    sampleCount: lastWeekAverage.sampleCount,
  };
};
