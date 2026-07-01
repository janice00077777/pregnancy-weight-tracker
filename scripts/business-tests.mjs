import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = resolve(projectRoot, '.tmp-business-tests');

const services = {
  bmi: 'src/services/bmi.ts',
  pregnancy: 'src/services/pregnancy.ts',
  records: 'src/services/records.ts',
  standards: 'src/services/weightStandards.ts',
  csv: 'src/services/csv.ts',
  storage: 'src/services/storage.ts',
};

const bundleServices = async () => {
  await mkdir(outputDir, { recursive: true });

  await Promise.all(
    Object.entries(services).map(([name, entryPoint]) =>
      build({
        entryPoints: [resolve(projectRoot, entryPoint)],
        outfile: resolve(outputDir, `${name}.mjs`),
        bundle: true,
        format: 'esm',
        platform: 'node',
        logLevel: 'silent',
      }),
    ),
  );
};

const importService = async (name) =>
  import(`${pathToFileURL(resolve(outputDir, `${name}.mjs`)).href}?v=${Date.now()}`);

const testBMI = async () => {
  const bmi = await importService('bmi');

  assert.equal(bmi.calculateBMI({ heightCm: 165, weightKg: 55 }), 20.2);
  assert.equal(bmi.getBMICategory(18.4), 'underweight');
  assert.equal(bmi.getBMICategory(18.5), 'normal');
  assert.equal(bmi.getBMICategory(23.9), 'normal');
  assert.equal(bmi.getBMICategory(24), 'overweight');
  assert.equal(bmi.getBMICategory(27.9), 'overweight');
  assert.equal(bmi.getBMICategory(28), 'obese');
  assert.ok(Number.isNaN(bmi.calculateBMI({ heightCm: 0, weightKg: 55 })));
};

const testPregnancyDates = async () => {
  const pregnancy = await importService('pregnancy');

  assert.equal(pregnancy.isValidDateOnly('2026-02-29'), false);
  assert.equal(pregnancy.addDaysToDateOnly('2026-12-31', 1), '2027-01-01');
  assert.equal(pregnancy.getPregnancyStartDate('2026-11-01'), '2026-01-25');

  const progress = pregnancy.calculatePregnancyProgress('2026-11-01', '2026-06-30');

  assert.equal(progress.gestationalDay, 156);
  assert.equal(progress.gestationalWeek, 23);
  assert.equal(progress.remainingDays, 124);
  assert.equal(progress.progressPercent, 56);
  assert.equal(pregnancy.getGestationalWeekByDate('2026-11-01', '2026-11-01'), 40);
};

const testRecords = async () => {
  const records = await importService('records');
  const originalRecords = [
    { date: '2026-06-29', weightKg: 61.8, note: '晨起空腹', createdAt: 1 },
    { date: '2026-06-30', weightKg: 62.5, note: '晚餐后', createdAt: 2 },
  ];
  const nextRecord = { date: '2026-06-30', weightKg: 62.9, note: '浮肿日', createdAt: 3 };
  const merged = records.upsertRecordByDate(originalRecords, nextRecord);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], nextRecord);
  assert.equal(merged[1].date, '2026-06-29');

  const lastWeekAverage = records.calculateLastWeekAverage(
    [
      { date: '2026-06-23', weightKg: 60, createdAt: 1 },
      { date: '2026-06-23', weightKg: 61, createdAt: 2 },
      { date: '2026-06-26', weightKg: 63, createdAt: 3 },
      { date: '2026-06-30', weightKg: 80, createdAt: 4 },
      { date: '2026-06-22', weightKg: 58, createdAt: 5 },
    ],
    '2026-06-30',
  );

  assert.deepEqual(lastWeekAverage, { averageKg: 62, sampleCount: 2 });
  assert.equal(records.calculateLastWeekAverage([], '2026-06-30'), null);
};

const testStandards = async () => {
  const standards = await importService('standards');
  const normalWeek40 = standards.getStandardRange('normal', 40);

  assert.deepEqual(normalWeek40, { week: 40, minGainKg: 8, maxGainKg: 14 });
  assert.equal(standards.getStandardRange('normal', 0), null);
  assert.equal(standards.getStandardRange('normal', 41), null);
  assert.equal(standards.getWeightStatus(8, normalWeek40), 'normal');
  assert.equal(standards.getWeightStatus(14, normalWeek40), 'normal');
  assert.equal(standards.getWeightStatus(7.9, normalWeek40), 'low');
  assert.equal(standards.getWeightStatus(14.1, normalWeek40), 'high');
  assert.equal(standards.getWeightStatus(Number.NaN, normalWeek40), null);
};

const testCSV = async () => {
  const csv = await importService('csv');
  const source = [
    { date: '2026-06-29', weightKg: 61.8, note: '晨起,空腹', createdAt: 1 },
    { date: '2026-06-30', weightKg: 62.5, note: '晚餐后 "偏晚"', createdAt: 2 },
  ];
  const exported = csv.buildRecordsCsv(source);

  assert.match(exported, /^date,weightKg,note,createdAt/);
  assert.match(exported, /"晨起,空腹"/);
  assert.match(exported, /"晚餐后 ""偏晚"""/);

  const preview = csv.parseRecordsCsv(
    `\uFEFFdate,weightKg,note,createdAt\r\n2026-06-30,62.5,晚餐后,2\r\nbad-date,62.9,浮肿日,3\r\n2026-07-01,181,过高,4\r\n2026-07-02,63.1,晨起空腹,not-time`,
  );

  assert.equal(preview.records.length, 1);
  assert.equal(preview.records[0].date, '2026-06-30');
  assert.equal(preview.skippedRows.length, 3);

  const simplePreview = csv.parseRecordsCsv(
    'date,weightKg\r\n2026/2/8,58.8\r\n2026/2/25,58.5',
  );

  assert.equal(simplePreview.records.length, 2);
  assert.equal(simplePreview.records[0].date, '2026-02-08');
  assert.equal(simplePreview.records[0].weightKg, 58.8);
  assert.equal(simplePreview.records[0].createdAt > 0, true);

  const chineseHeaderPreview = csv.parseRecordsCsv('日期,体重,备注\r\n2026年3月5日,58.1,晨起');

  assert.equal(chineseHeaderPreview.records.length, 1);
  assert.equal(chineseHeaderPreview.records[0].date, '2026-03-05');
  assert.equal(chineseHeaderPreview.records[0].note, '晨起');

  const merged = csv.mergeRecordsByNewestCreatedAt(
    [{ date: '2026-06-30', weightKg: 62, note: '旧', createdAt: 1 }],
    [
      { date: '2026-06-30', weightKg: 62.5, note: '新', createdAt: 2 },
      { date: '2026-06-29', weightKg: 61.5, createdAt: 3 },
    ],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].date, '2026-06-30');
  assert.equal(merged[0].weightKg, 62.5);
  assert.equal(merged[1].date, '2026-06-29');
};

const createMockWindow = ({ failWrite = false } = {}) => {
  const store = new Map();

  globalThis.window = {
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => {
        if (failWrite) {
          throw new Error('mock write unavailable');
        }

        store.set(key, value);
      },
    },
  };

  return store;
};

const testStorage = async () => {
  const storage = await importService('storage');
  const store = createMockWindow();
  const profile = {
    dueDate: '2026-11-01',
    heightCm: 165,
    preWeightKg: 55,
    preBMI: 20.2,
    bmiCategory: 'normal',
    updatedAt: 1,
  };
  const records = [{ date: '2026-06-30', weightKg: 62.5, note: '晨起空腹', createdAt: 2 }];

  assert.equal(storage.saveProfile(profile).error, undefined);
  assert.equal(storage.saveRecords(records).error, undefined);
  assert.equal(storage.loadProfile().data.dueDate, '2026-11-01');
  assert.equal(storage.loadRecords().data.length, 1);

  store.set(storage.STORAGE_KEYS.records, 'not-json');
  const fallbackRecords = storage.loadRecords();

  assert.deepEqual(fallbackRecords.data, []);
  assert.match(fallbackRecords.error, /暂时无法读取/);

  const snapshot = storage.createImportSnapshot({ profile, records });
  const savedSnapshot = JSON.parse(store.get(storage.STORAGE_KEYS.importSnapshot));

  assert.equal(snapshot.error, undefined);
  assert.equal(savedSnapshot.reason, 'before-import');
  assert.equal(savedSnapshot.records.length, 1);

  createMockWindow({ failWrite: true });

  assert.match(storage.saveRecords(records).error, /暂时没有保存成功/);
  assert.match(storage.createImportSnapshot({ profile, records }).error, /暂时没有保存成功/);
};

await bundleServices();
await testBMI();
await testPregnancyDates();
await testRecords();
await testStandards();
await testCSV();
await testStorage();

console.log('business tests ok');
