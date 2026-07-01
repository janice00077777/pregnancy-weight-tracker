import { isValidDateOnly } from './pregnancy';
import { formatWeightInput, parseWeightInput, sortRecordsByDateDesc } from './records';
import type { WeightRecord } from '../types/pregnancy';

export type CsvImportPreview = {
  records: WeightRecord[];
  skippedRows: { rowNumber: number; reason: string }[];
};

type ImportFieldIndexes = {
  date: number;
  weightKg: number;
  note: number;
  createdAt: number;
};

const IMPORT_TEMPLATE_ROWS = [
  ['date', 'weightKg', 'note'],
  ['2026-02-08', '58.8', '晨起空腹'],
  ['2026-02-25', '58.5', ''],
];

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, '')
    .replace(/[（）()_\-./\\]/g, '');

const DATE_HEADERS = new Set(['date', 'day', 'recorddate', '记录日期', '日期', '时间']);
const WEIGHT_HEADERS = new Set([
  'weight',
  'weightkg',
  'kg',
  '体重',
  '体重kg',
  '体重公斤',
  '孕期体重',
]);
const NOTE_HEADERS = new Set(['note', 'notes', 'remark', 'remarks', '备注', '说明']);
const CREATED_AT_HEADERS = new Set(['createdat', 'createdtime', 'timestamp', '创建时间', '记录时间']);

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

const buildCsv = (rows: (string | number)[][]) =>
  rows.map((row) => row.map((field) => escapeCsvField(field)).join(',')).join('\r\n');

export const buildRecordsCsv = (records: WeightRecord[]) => {
  const header = ['date', 'weightKg', 'note', 'createdAt'];
  const rows = getLatestHistoryRecords(records).map((record) => [
    record.date,
    formatWeightInput(record.weightKg),
    record.note ?? '',
    record.createdAt,
  ]);

  return buildCsv([header, ...rows]);
};

export const buildImportTemplateCsv = () => buildCsv(IMPORT_TEMPLATE_ROWS);

export const buildImportTemplateWorkbook = async () => {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.aoa_to_sheet(IMPORT_TEMPLATE_ROWS);
  const workbook = XLSX.utils.book_new();

  worksheet['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, worksheet, '体重记录');

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
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

const padDatePart = (value: number) => String(value).padStart(2, '0');

const normalizeDateOnly = (value: string) => {
  const trimmedValue = value.trim();

  if (isValidDateOnly(trimmedValue)) {
    return trimmedValue;
  }

  const matchedDate = trimmedValue.match(/^(\d{4})[/.年-](\d{1,2})[/.月-](\d{1,2})日?$/);

  if (!matchedDate) {
    return null;
  }

  const year = Number(matchedDate[1]);
  const month = Number(matchedDate[2]);
  const day = Number(matchedDate[3]);
  const normalizedDate = `${year}-${padDatePart(month)}-${padDatePart(day)}`;

  return isValidDateOnly(normalizedDate) ? normalizedDate : null;
};

const getHeaderIndexes = (headerRow: string[]): ImportFieldIndexes | null => {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const findHeaderIndex = (candidates: Set<string>) =>
    normalizedHeaders.findIndex((header) => candidates.has(header));

  const date = findHeaderIndex(DATE_HEADERS);
  const weightKg = findHeaderIndex(WEIGHT_HEADERS);

  if (date < 0 || weightKg < 0) {
    return null;
  }

  return {
    date,
    weightKg,
    note: findHeaderIndex(NOTE_HEADERS),
    createdAt: findHeaderIndex(CREATED_AT_HEADERS),
  };
};

const getFallbackFieldIndexes = (): ImportFieldIndexes => ({
  date: 0,
  weightKg: 1,
  note: 2,
  createdAt: 3,
});

export const parseRecordsRows = (rows: string[][]): CsvImportPreview => {
  const firstRow = rows[0]?.map((cell) => cell.trim()) ?? [];
  const headerIndexes = getHeaderIndexes(firstRow);
  const fieldIndexes = headerIndexes ?? getFallbackFieldIndexes();
  const dataRows = headerIndexes ? rows.slice(1) : rows;
  const rowOffset = headerIndexes ? 2 : 1;
  const importStartedAt = Date.now();
  const records: WeightRecord[] = [];
  const skippedRows: CsvImportPreview['skippedRows'] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = index + rowOffset;
    const date = normalizeDateOnly(row[fieldIndexes.date]?.trim() ?? '');
    const weightKg = parseWeightInput(row[fieldIndexes.weightKg]?.trim() ?? '');
    const note = fieldIndexes.note >= 0 ? row[fieldIndexes.note]?.trim() : '';
    const createdAt =
      fieldIndexes.createdAt >= 0
        ? parseCsvTimestamp(row[fieldIndexes.createdAt]?.trim() ?? '')
        : importStartedAt + index;

    if (!date) {
      skippedRows.push({ rowNumber, reason: '日期格式需要是 2026-02-08 或 2026/2/8' });
      return;
    }

    if (weightKg === null || weightKg < 30 || weightKg > 180) {
      skippedRows.push({ rowNumber, reason: '体重需要在 30-180 kg 之间，最多 1 位小数' });
      return;
    }

    if (createdAt === null) {
      skippedRows.push({ rowNumber, reason: 'createdAt 不是有效时间戳，可删除这一列让系统自动补齐' });
      return;
    }

    records.push({ date, weightKg, note: note || undefined, createdAt });
  });

  return { records, skippedRows };
};

export const parseRecordsCsv = (csvText: string): CsvImportPreview => {
  const normalizedText = csvText.replace(/^\uFEFF/, '').trim();

  if (!normalizedText) {
    return { records: [], skippedRows: [] };
  }

  return parseRecordsRows(parseCsvRows(normalizedText));
};

export const parseRecordsWorkbook = async (arrayBuffer: ArrayBuffer): Promise<CsvImportPreview> => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, { cellDates: false, type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { records: [], skippedRows: [] };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    blankrows: false,
    defval: '',
    header: 1,
    raw: false,
  });

  return parseRecordsRows(rows.map((row) => row.map((cell) => String(cell))));
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
