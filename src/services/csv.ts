import { isValidDateOnly } from './pregnancy';
import { formatWeightInput, parseWeightInput, sortRecordsByDateDesc } from './records';
import type { WeightRecord } from '../types/pregnancy';

export type CsvImportPreview = {
  records: WeightRecord[];
  skippedRows: { rowNumber: number; reason: string }[];
};

export const getLatestHistoryRecords = (records: WeightRecord[]) => {
  const latestRecordsByDate = new Map<string, WeightRecord>();

  records.forEach((record) => {
    const currentRecord = latestRecordsByDate.get(record.date);

    if (!currentRecord || record.createdAt > currentRecord.createdAt) {
      latestRecordsByDate.set(record.date, record);
    }
  });

  return sortRecordsByDateDesc(Array.from(latestRecordsByDate.values()));
};

const escapeCsvField = (value: string | number) => {
  const stringValue = String(value);

  if (!/[",\r\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
};

export const buildRecordsCsv = (records: WeightRecord[]) => {
  const header = ['date', 'weightKg', 'note', 'createdAt'];
  const rows = getLatestHistoryRecords(records).map((record) => [
    record.date,
    formatWeightInput(record.weightKg),
    record.note ?? '',
    record.createdAt,
  ]);

  return [header, ...rows]
    .map((row) => row.map((field) => escapeCsvField(field)).join(','))
    .join('\r\n');
};

export const parseCsvRows = (value: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const nextChar = value[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      row.push(field);
      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) {
    rows.push(row);
  }

  return rows;
};

const parseCsvTimestamp = (value: string) => {
  const timestamp = Number(value.trim());

  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
};

export const parseRecordsCsv = (csvText: string): CsvImportPreview => {
  const normalizedText = csvText.replace(/^\uFEFF/, '').trim();

  if (!normalizedText) {
    return { records: [], skippedRows: [] };
  }

  const rows = parseCsvRows(normalizedText);
  const firstRow = rows[0]?.map((cell) => cell.trim()) ?? [];
  const hasHeader = firstRow.includes('date') && firstRow.includes('weightKg');
  const fieldIndexes = hasHeader
    ? {
        date: firstRow.indexOf('date'),
        weightKg: firstRow.indexOf('weightKg'),
        note: firstRow.indexOf('note'),
        createdAt: firstRow.indexOf('createdAt'),
      }
    : { date: 0, weightKg: 1, note: 2, createdAt: 3 };
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const rowOffset = hasHeader ? 2 : 1;
  const records: WeightRecord[] = [];
  const skippedRows: CsvImportPreview['skippedRows'] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + rowOffset;
    const date = row[fieldIndexes.date]?.trim() ?? '';
    const weightKg = parseWeightInput(row[fieldIndexes.weightKg]?.trim() ?? '');
    const note = fieldIndexes.note >= 0 ? row[fieldIndexes.note]?.trim() : '';
    const createdAt = parseCsvTimestamp(row[fieldIndexes.createdAt]?.trim() ?? '');

    if (!isValidDateOnly(date)) {
      skippedRows.push({ rowNumber, reason: '日期格式不是 YYYY-MM-DD' });
      return;
    }

    if (weightKg === null || weightKg < 30 || weightKg > 180) {
      skippedRows.push({ rowNumber, reason: '体重数值不在可导入范围内' });
      return;
    }

    if (createdAt === null) {
      skippedRows.push({ rowNumber, reason: 'createdAt 不是有效时间戳' });
      return;
    }

    records.push({ date, weightKg, note: note || undefined, createdAt });
  });

  return { records, skippedRows };
};

export const mergeRecordsByNewestCreatedAt = (
  currentRecords: WeightRecord[],
  importedRecords: WeightRecord[],
) => {
  const recordsByDate = new Map<string, WeightRecord>();

  [...currentRecords, ...importedRecords].forEach((record) => {
    const currentRecord = recordsByDate.get(record.date);

    if (!currentRecord || record.createdAt > currentRecord.createdAt) {
      recordsByDate.set(record.date, record);
    }
  });

  return sortRecordsByDateDesc(Array.from(recordsByDate.values()));
};
