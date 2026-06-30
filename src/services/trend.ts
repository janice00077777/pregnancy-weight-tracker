import { getGestationalWeekByDate } from './pregnancy';
import { roundWeightToOneDecimal } from './records';
import type { PregnancyProfile, WeightRecord } from '../types/pregnancy';

export type WeeklyWeightTrendPoint = {
  week: number;
  averageWeightKg: number;
  gainKg: number;
  recordCount: number;
  startDate: string;
  endDate: string;
};

type WeeklyRecordGroup = {
  week: number;
  records: WeightRecord[];
};

const compareDateAsc = (a: string, b: string) => a.localeCompare(b);

const getLatestRecordsByDate = (records: WeightRecord[]) => {
  const latestRecordsByDate = new Map<string, WeightRecord>();

  records.forEach((record) => {
    const currentRecord = latestRecordsByDate.get(record.date);

    if (!currentRecord || record.createdAt > currentRecord.createdAt) {
      latestRecordsByDate.set(record.date, record);
    }
  });

  return Array.from(latestRecordsByDate.values()).sort((a, b) => compareDateAsc(a.date, b.date));
};

export const buildWeeklyWeightTrend = (
  records: WeightRecord[],
  profile: Pick<PregnancyProfile, 'dueDate' | 'preWeightKg'>,
): WeeklyWeightTrendPoint[] => {
  if (records.length === 0) {
    return [];
  }

  const weeklyGroups = new Map<number, WeeklyRecordGroup>();

  getLatestRecordsByDate(records).forEach((record) => {
    const week = getGestationalWeekByDate(profile.dueDate, record.date);

    if (!week) {
      return;
    }

    const group = weeklyGroups.get(week) ?? {
      week,
      records: [],
    };

    group.records.push(record);
    weeklyGroups.set(week, group);
  });

  return Array.from(weeklyGroups.values())
    .sort((a, b) => a.week - b.week)
    .map(({ week, records: groupRecords }) => {
      const totalWeight = groupRecords.reduce((sum, record) => sum + record.weightKg, 0);
      const averageWeightKg = roundWeightToOneDecimal(totalWeight / groupRecords.length);
      const sortedDates = groupRecords.map((record) => record.date).sort(compareDateAsc);

      return {
        week,
        averageWeightKg,
        gainKg: roundWeightToOneDecimal(averageWeightKg - profile.preWeightKg),
        recordCount: groupRecords.length,
        startDate: sortedDates[0],
        endDate: sortedDates[sortedDates.length - 1],
      };
    });
};
