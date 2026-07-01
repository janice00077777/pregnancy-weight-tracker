import type { PregnancyProfile, WeightRecord } from '../types/pregnancy';

export const STORAGE_KEYS = {
  profile: 'pregnancy_profile',
  records: 'pregnancy_records',
  importSnapshot: 'pregnancy_import_snapshot',
} as const;

export type StorageResult<T> = {
  data: T;
  error?: string;
};

export type LocalDataSnapshot = {
  profile: PregnancyProfile | null;
  records: WeightRecord[];
  createdAt: number;
  reason: 'before-import';
};

const isBrowser = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isString = (value: unknown): value is string => typeof value === 'string';

export const isPregnancyProfile = (value: unknown): value is PregnancyProfile => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.dueDate) &&
    isNumber(value.heightCm) &&
    isNumber(value.preWeightKg) &&
    isNumber(value.preBMI) &&
    isString(value.bmiCategory) &&
    ['underweight', 'normal', 'overweight', 'obese'].includes(value.bmiCategory) &&
    (value.updatedAt === undefined || isNumber(value.updatedAt))
  );
};

export const isWeightRecord = (value: unknown): value is WeightRecord => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.date) &&
    isNumber(value.weightKg) &&
    isNumber(value.createdAt) &&
    (value.note === undefined || isString(value.note))
  );
};

const readJson = <T>(key: string, fallback: T): StorageResult<T> => {
  if (!isBrowser()) {
    return { data: fallback, error: '当前环境不支持 localStorage' };
  }

  try {
    const rawValue = window.localStorage.getItem(key);

    if (rawValue === null) {
      return { data: fallback };
    }

    return { data: JSON.parse(rawValue) as T };
  } catch {
    return { data: fallback, error: `${key} 数据暂时无法读取，已使用空数据兜底` };
  }
};

const writeJson = <T>(key: string, value: T): StorageResult<T> => {
  if (!isBrowser()) {
    return { data: value, error: '当前环境不支持 localStorage' };
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return { data: value };
  } catch {
    return { data: value, error: `${key} 数据暂时没有保存成功` };
  }
};

export const loadProfile = (): StorageResult<PregnancyProfile | null> => {
  const result = readJson<unknown>(STORAGE_KEYS.profile, null);

  if (!isPregnancyProfile(result.data)) {
    return {
      data: null,
      error: result.error ?? (result.data === null ? undefined : '个人信息格式暂时无法读取，已使用空数据兜底'),
    };
  }

  return { data: result.data, error: result.error };
};

export const saveProfile = (profile: PregnancyProfile): StorageResult<PregnancyProfile> =>
  writeJson(STORAGE_KEYS.profile, profile);

export const loadRecords = (): StorageResult<WeightRecord[]> => {
  const result = readJson<unknown>(STORAGE_KEYS.records, []);

  if (!Array.isArray(result.data)) {
    return {
      data: [],
      error: result.error ?? '体重记录格式暂时无法读取，已使用空数据兜底',
    };
  }

  const records = result.data.filter(isWeightRecord);

  return {
    data: records,
    error:
      result.error ??
      (records.length === result.data.length ? undefined : '部分体重记录格式暂时无法读取，已跳过'),
  };
};

export const saveRecords = (records: WeightRecord[]): StorageResult<WeightRecord[]> =>
  writeJson(STORAGE_KEYS.records, records);

export const createImportSnapshot = ({
  profile,
  records,
}: {
  profile: PregnancyProfile | null;
  records: WeightRecord[];
}): StorageResult<LocalDataSnapshot> => {
  const snapshot: LocalDataSnapshot = {
    profile,
    records,
    createdAt: Date.now(),
    reason: 'before-import',
  };

  return writeJson(STORAGE_KEYS.importSnapshot, snapshot);
};
