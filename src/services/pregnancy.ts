export type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

export type PregnancyProgress = {
  dueDate: string;
  pregnancyStartDate: string;
  today: string;
  gestationalDay: number;
  gestationalWeek: number;
  gestationalDayOfWeek: number;
  remainingDays: number;
  progressRatio: number;
  progressPercent: number;
};

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const PREGNANCY_TOTAL_DAYS = 280;
export const DAYS_PER_WEEK = 7;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const pad2 = (value: number) => String(value).padStart(2, '0');

export const parseDateOnly = (value: string): DateOnlyParts | null => {
  const match = DATE_ONLY_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

export const formatDateOnly = ({ year, month, day }: DateOnlyParts) =>
  `${year}-${pad2(month)}-${pad2(day)}`;

const partsToUtcTime = ({ year, month, day }: DateOnlyParts) =>
  Date.UTC(year, month - 1, day);

export const isValidDateOnly = (value: string) => parseDateOnly(value) !== null;

export const getTodayDateOnly = () => {
  const now = new Date();

  return formatDateOnly({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
};

export const addDaysToDateOnly = (dateOnly: string, days: number): string | null => {
  const parts = parseDateOnly(dateOnly);

  if (!parts || !Number.isFinite(days)) {
    return null;
  }

  const date = new Date(partsToUtcTime(parts) + days * MS_PER_DAY);

  return formatDateOnly({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
};

export const differenceInCalendarDays = (startDate: string, endDate: string): number | null => {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) {
    return null;
  }

  return Math.round((partsToUtcTime(end) - partsToUtcTime(start)) / MS_PER_DAY);
};

export const getPregnancyStartDate = (dueDate: string) =>
  addDaysToDateOnly(dueDate, -PREGNANCY_TOTAL_DAYS);

export const calculatePregnancyProgress = (
  dueDate: string,
  today = getTodayDateOnly(),
): PregnancyProgress | null => {
  const pregnancyStartDate = getPregnancyStartDate(dueDate);

  if (!pregnancyStartDate || !isValidDateOnly(today)) {
    return null;
  }

  const rawGestationalDay = differenceInCalendarDays(pregnancyStartDate, today);
  const rawRemainingDays = differenceInCalendarDays(today, dueDate);

  if (rawGestationalDay === null || rawRemainingDays === null) {
    return null;
  }

  const gestationalDay = clamp(rawGestationalDay, 0, PREGNANCY_TOTAL_DAYS);
  const gestationalWeek = clamp(
    Math.floor(gestationalDay / DAYS_PER_WEEK) + 1,
    1,
    PREGNANCY_TOTAL_DAYS / DAYS_PER_WEEK,
  );
  const progressRatio = gestationalDay / PREGNANCY_TOTAL_DAYS;

  return {
    dueDate,
    pregnancyStartDate,
    today,
    gestationalDay,
    gestationalWeek,
    gestationalDayOfWeek: gestationalDay % DAYS_PER_WEEK,
    remainingDays: clamp(rawRemainingDays, 0, PREGNANCY_TOTAL_DAYS),
    progressRatio,
    progressPercent: Math.round(progressRatio * 100),
  };
};

export const getGestationalWeekByDate = (dueDate: string, date: string): number | null =>
  calculatePregnancyProgress(dueDate, date)?.gestationalWeek ?? null;

