import { type FormEvent, useEffect, useRef, useState } from 'react';
import { calculateBMIResult, getBMICategoryLabel } from './services/bmi';
import {
  createTrendChartScale,
  type TrendChartScale,
  TREND_CHART_VIEWBOX,
} from './services/chart';
import {
  buildImportTemplateCsv,
  buildImportTemplateWorkbook,
  buildRecordsCsv,
  getLatestHistoryRecords,
  mergeRecordsByNewestCreatedAt,
  parseRecordsWorkbook,
  parseRecordsCsv,
  type CsvImportPreview,
} from './services/csv';
import {
  addDaysToDateOnly,
  calculatePregnancyProgress,
  differenceInCalendarDays,
  getGestationalWeekByDate,
  getTodayDateOnly,
  isValidDateOnly,
} from './services/pregnancy';
import {
  createWeightSaveFeedback,
  createWeightRecord,
  formatWeightInput,
  getLatestRecordForDate,
  parseWeightInput,
  QUICK_NOTES,
  removeRecordByDate,
  roundWeightToTwoDecimals,
  upsertRecordByDate,
  type QuickNote,
  type WeightSaveFeedback,
} from './services/records';
import {
  createImportSnapshot,
  loadProfile,
  loadRecords,
  saveProfile,
  saveRecords,
} from './services/storage';
import { buildWeeklyWeightTrend, type WeeklyWeightTrendPoint } from './services/trend';
import {
  BMI_GAIN_STANDARD_TABLE,
  getStandardRange,
  getWeightStatus,
  WEIGHT_STANDARD_SOURCE,
  type GestationalWeightRange,
  type WeightStatus,
} from './services/weightStandards';
import type { PregnancyProfile, WeightRecord } from './types/pregnancy';

type TabId = 'home' | 'trend' | 'settings';
type WeightChartMode = 'day' | 'week' | 'records';

type WeightChartPoint = {
  x: number;
  week: number;
  weightKg: number;
  primaryLabel: string;
  secondaryLabel?: string;
  status: WeightStatus | null;
};

type WeightBandPoint = {
  x: number;
  minWeightKg: number;
  maxWeightKg: number;
};

type TabItem = {
  id: TabId;
  label: string;
  icon: string;
};

const tabs: TabItem[] = [
  {
    id: 'home',
    label: '主页',
    icon: '○',
  },
  {
    id: 'trend',
    label: '趋势',
    icon: '⌁',
  },
  {
    id: 'settings',
    label: '设置',
    icon: '⋯',
  },
];

const loadAppData = () => {
  const profileResult = loadProfile();
  const recordsResult = loadRecords();

  return {
    profile: profileResult.data,
    records: recordsResult.data,
    recordCount: recordsResult.data.length,
  };
};
const formatChartPoint = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;

const buildWeightLinePath = (
  points: WeightChartPoint[],
  chartScale: TrendChartScale,
) =>
  points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';

      return `${command} ${formatChartPoint(
        chartScale.xForWeek(point.x),
        chartScale.yForGain(point.weightKg),
      )}`;
    })
    .join(' ');

const buildWeightBandPath = (
  points: WeightBandPoint[],
  chartScale: TrendChartScale,
) => {
  if (points.length === 0) {
    return '';
  }

  const upperPoints = points.map((point) =>
    formatChartPoint(chartScale.xForWeek(point.x), chartScale.yForGain(point.maxWeightKg)),
  );
  const lowerPoints = points
    .slice()
    .reverse()
    .map((point) =>
      formatChartPoint(chartScale.xForWeek(point.x), chartScale.yForGain(point.minWeightKg)),
    );

  return `M ${upperPoints.join(' L ')} L ${lowerPoints.join(' L ')} Z`;
};

const getReferenceStatusText = (status: WeightStatus | null) => {
  if (status === 'low') {
    return '低于参考区间，仅作趋势参考';
  }

  if (status === 'high') {
    return '高于参考区间，仅作趋势参考';
  }

  if (status === 'normal') {
    return '参考区间内';
  }

  return '暂无参考状态';
};

const getWeightStatusColor = (status: WeightStatus | null) => {
  if (status === 'low') {
    return '#3498db';
  }

  if (status === 'high') {
    return '#f5a623';
  }

  return '#00bfa5';
};

const formatMonthDay = (date: string) => {
  const [, month, day] = date.split('-').map(Number);

  return `${month}/${day}`;
};

const getReferenceStatusNote = (status: WeightStatus | null): string | null => {
  if (status === 'low' || status === 'high') {
    return '如果连续多次明显偏离参考区间，可以在产检时咨询医生。';
  }

  return null;
};

const formatRangeText = (range: GestationalWeightRange | null) => {
  if (!range) {
    return '暂无参考区间';
  }

  return `${formatWeightInput(range.minGainKg)} - ${formatWeightInput(range.maxGainKg)} kg`;
};

const formatWeekDateRange = (point: WeeklyWeightTrendPoint) => {
  if (point.startDate === point.endDate) {
    return point.startDate;
  }

  return `${point.startDate} 至 ${point.endDate}`;
};
const formatGestationalWeekText = (week: number | null) => {
  if (!week) {
    return '孕周待确认';
  }

  return `第 ${week} 周`;
};

const downloadBlobFile = ({
  filename,
  blob,
}: {
  filename: string;
  blob: Blob;
}) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const downloadTextFile = ({
  filename,
  content,
  mimeType,
}: {
  filename: string;
  content: string;
  mimeType: string;
}) => {
  const blob = new Blob([content], { type: mimeType });

  downloadBlobFile({ filename, blob });
};

const shareOrDownloadTextFile = async ({
  filename,
  content,
  mimeType,
}: {
  filename: string;
  content: string;
  mimeType: string;
}) => {
  const file = new File([content], filename, { type: mimeType });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: filename,
    });
    return 'shared';
  }

  downloadBlobFile({ filename, blob: file });
  return 'downloaded';
};

const downloadBinaryFile = ({
  filename,
  content,
  mimeType,
}: {
  filename: string;
  content: BlobPart;
  mimeType: string;
}) => {
  const blob = new Blob([content], { type: mimeType });

  downloadBlobFile({ filename, blob });
};

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [appData, setAppData] = useState(loadAppData);

  const saveProfileAndRefresh = (profile: PregnancyProfile) => {
    const result = saveProfile(profile);

    if (result.error) {
      return result.error;
    }

    setAppData(loadAppData());
    setActiveTab('home');
    return undefined;
  };

  const handleRecordCreated = (record: WeightRecord) => {
    const result = saveRecords(upsertRecordByDate(appData.records, record));

    if (result.error) {
      return result.error;
    }

    setAppData(loadAppData());
    return undefined;
  };

  const handleRecordDeleted = (date: string) => {
    const result = saveRecords(removeRecordByDate(appData.records, date));

    if (result.error) {
      return result.error;
    }

    setAppData(loadAppData());
    return undefined;
  };

  const handleRecordsImported = (nextRecords: WeightRecord[]) => {
    const result = saveRecords(nextRecords);

    if (result.error) {
      return result.error;
    }

    setAppData(loadAppData());
    return undefined;
  };

  if (!appData.profile) {
    return <OnboardingPage onComplete={saveProfileAndRefresh} />;
  }

  return (
    <div className="min-h-dvh bg-mist text-forest-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <main className="flex-1 px-5 pb-28 pt-5">
          {activeTab === 'home' && (
            <HomePage
              profile={appData.profile}
              records={appData.records}
              onRecordCreated={handleRecordCreated}
              onRecordDeleted={handleRecordDeleted}
            />
          )}
          {activeTab === 'trend' && (
            <TrendPage
              profile={appData.profile}
              records={appData.records}
              recordCount={appData.recordCount}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsPage
              profile={appData.profile}
              records={appData.records}
              recordCount={appData.recordCount}
              onProfileUpdated={saveProfileAndRefresh}
              onRecordsImported={handleRecordsImported}
            />
          )}
        </main>

        <BottomTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>
    </div>
  );
}

function OnboardingPage({
  onComplete,
}: {
  onComplete: (profile: PregnancyProfile) => string | undefined;
}) {
  const [dueDate, setDueDate] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [preWeightKg, setPreWeightKg] = useState('');
  const [error, setError] = useState('');

  const parsedHeightCm = Number(heightCm);
  const parsedPreWeightKg = Number(preWeightKg);
  const bmiPreview =
    Number.isFinite(parsedHeightCm) && Number.isFinite(parsedPreWeightKg)
      ? calculateBMIResult({ heightCm: parsedHeightCm, weightKg: parsedPreWeightKg })
      : null;
  const canShowBMI = bmiPreview !== null && Number.isFinite(bmiPreview.bmi);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!isValidDateOnly(dueDate)) {
      setError('请填写有效的预产期。');
      return;
    }

    if (!Number.isFinite(parsedHeightCm) || parsedHeightCm < 120 || parsedHeightCm > 220) {
      setError('请填写合理的孕前身高。');
      return;
    }

    if (
      !Number.isFinite(parsedPreWeightKg) ||
      parsedPreWeightKg < 30 ||
      parsedPreWeightKg > 180
    ) {
      setError('请填写合理的孕前体重。');
      return;
    }

    const bmiResult = calculateBMIResult({
      heightCm: parsedHeightCm,
      weightKg: parsedPreWeightKg,
    });

    if (!Number.isFinite(bmiResult.bmi)) {
      setError('身高和体重暂时无法计算 BMI，请检查后再保存。');
      return;
    }

    const saveError = onComplete({
      dueDate,
      heightCm: parsedHeightCm,
      preWeightKg: parsedPreWeightKg,
      preBMI: bmiResult.bmi,
      bmiCategory: bmiResult.category,
      updatedAt: Date.now(),
    });

    if (saveError) {
      setError(saveError);
    }
  };

  return (
    <main className="min-h-dvh bg-mist px-5 py-8 text-forest-900">
      <section
        className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-md flex-col justify-center"
        aria-labelledby="onboarding-title"
      >
        <div className="rounded-[24px] border border-stone-200 bg-warm-white p-6 shadow-soft">
          <h1 id="onboarding-title" className="text-3xl font-semibold leading-tight">
            先填一点基础资料
          </h1>

          <form className="mt-7 grid gap-5" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-forest-700" htmlFor="due-date">
                预产期
              </label>
              <input
                id="due-date"
                className="app-input"
                inputMode="numeric"
                placeholder="例如 2026-11-01"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
              <p className="text-xs text-moss-600">格式 YYYY-MM-DD</p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-forest-700" htmlFor="height-cm">
                孕前身高
              </label>
              <input
                id="height-cm"
                className="app-input"
                inputMode="decimal"
                placeholder="例如 165"
                value={heightCm}
                onChange={(event) => setHeightCm(event.target.value)}
              />
              <p className="text-xs text-moss-600">单位 cm</p>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-forest-700" htmlFor="pre-weight">
                孕前体重
              </label>
              <input
                id="pre-weight"
                className="app-input"
                inputMode="decimal"
                placeholder="例如 55.0"
                value={preWeightKg}
                onChange={(event) => setPreWeightKg(event.target.value)}
              />
              <p className="text-xs text-moss-600">单位 kg</p>
            </div>

            <div className="rounded-[20px] border border-stone-200 bg-mist p-4">
              <p className="text-sm text-moss-600">孕前 BMI</p>
              <p className="mt-1 text-xl font-semibold text-forest-900">
                {canShowBMI
                  ? `${bmiPreview.bmi} · ${getBMICategoryLabel(bmiPreview.category)}`
                  : '填写身高体重后自动计算'}
              </p>
            </div>

            {error && (
              <p className="rounded-[16px] border border-wood-200 bg-wood-100/55 px-4 py-3 text-sm leading-6 text-forest-800">
                {error}
              </p>
            )}

            <p className="text-xs leading-5 text-moss-600">数据仅保存在当前浏览器。</p>

            <button className="app-button" type="submit">
              保存并开始
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function HomePage({
  profile,
  records,
  onRecordCreated,
  onRecordDeleted,
}: {
  profile: PregnancyProfile;
  records: WeightRecord[];
  onRecordCreated: (record: WeightRecord) => string | undefined;
  onRecordDeleted: (date: string) => string | undefined;
}) {
  return (
    <section className="space-y-5" aria-labelledby="home-title">
      <WeightCheckInPanel
        profile={profile}
        records={records}
        onRecordCreated={onRecordCreated}
        onRecordDeleted={onRecordDeleted}
      />
    </section>
  );
}
function WeightCheckInPanel({
  profile,
  records,
  onRecordCreated,
  onRecordDeleted,
}: {
  profile: PregnancyProfile;
  records: WeightRecord[];
  onRecordCreated: (record: WeightRecord) => string | undefined;
  onRecordDeleted: (date: string) => string | undefined;
}) {
  const todayDate = getTodayDateOnly();
  const todayRecord = getLatestRecordForDate(records, todayDate);
  const initialNote = todayRecord?.note ?? '';
  const [weightInput, setWeightInput] = useState(
    todayRecord ? formatWeightInput(todayRecord.weightKg) : '',
  );
  const [recordDate, setRecordDate] = useState(todayDate);
  const [selectedNote, setSelectedNote] = useState<QuickNote | ''>(
    QUICK_NOTES.find((note) => note === initialNote) ?? '',
  );
  const [customNote, setCustomNote] = useState(
    QUICK_NOTES.some((note) => note === initialNote) ? '' : initialNote,
  );
  const [feedback, setFeedback] = useState<WeightSaveFeedback | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const record = getLatestRecordForDate(records, recordDate);
    const note = record?.note ?? '';

    setWeightInput(record ? formatWeightInput(record.weightKg) : '');
    setSelectedNote(QUICK_NOTES.find((quickNote) => quickNote === note) ?? '');
    setCustomNote(QUICK_NOTES.some((quickNote) => quickNote === note) ? '' : note);
  }, [recordDate, records]);

  useEffect(() => {
    setFeedback(null);
    setMessage('');
    setError('');
  }, [recordDate]);

  const buildNote = () => {
    const trimmedCustomNote = customNote.trim();

    return [selectedNote, trimmedCustomNote].filter(Boolean).join(' · ') || undefined;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const weightKg = parseWeightInput(weightInput);

    if (!isValidDateOnly(recordDate)) {
      setError('请选择有效的记录日期。');
      return;
    }

    if (weightKg === null || weightKg < 30 || weightKg > 180) {
      setError('请填写合理的体重，最多保留 2 位小数。');
      return;
    }

    const record = createWeightRecord({
      date: recordDate,
      weightKg,
      note: buildNote(),
    });
    const nextFeedback = createWeightSaveFeedback(records, record);
    const saveError = onRecordCreated(record);

    if (saveError) {
      setError(saveError);
      return;
    }

    setWeightInput(formatWeightInput(weightKg));
    setFeedback(nextFeedback);
    setMessage(`已保存 ${recordDate} 的记录。`);
  };

  const handleDelete = () => {
    const record = getLatestRecordForDate(records, recordDate);

    if (!record) {
      return;
    }

    if (!window.confirm(`确定删除 ${recordDate} 的体重记录吗？删除后无法撤销。`)) {
      return;
    }

    setError('');
    const deleteError = onRecordDeleted(recordDate);

    if (deleteError) {
      setError(deleteError);
      return;
    }

    setWeightInput('');
    setSelectedNote('');
    setCustomNote('');
    setFeedback(null);
    setMessage(`已删除 ${recordDate} 的记录。`);
  };

  return (
    <form
      className="rounded-[24px] border border-stone-200 bg-warm-white p-5 shadow-soft"
      aria-labelledby="home-title"
      onSubmit={handleSubmit}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="home-title" className="mt-1 text-3xl font-semibold">
            记录体重
          </h2>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-forest-700" htmlFor="record-date">
            记录日期
          </label>
          <input
            id="record-date"
            className="app-input"
            max={todayDate}
            type="date"
            value={recordDate}
            onChange={(event) => {
              setRecordDate(event.target.value);
            }}
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-forest-700" htmlFor="weight-check-in">
            体重
          </label>
          <input
            id="weight-check-in"
            className="app-input text-2xl font-semibold"
            inputMode="decimal"
            placeholder="62.50"
            value={weightInput}
            onChange={(event) => {
              setWeightInput(event.target.value);
              setFeedback(null);
              setError('');
              setMessage('');
            }}
          />
          <p className="text-xs text-moss-600">单位 kg，最多 2 位小数</p>
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium text-forest-700">备注</p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_NOTES.map((note) => {
              const isSelected = selectedNote === note;

              return (
                <button
                  key={note}
                  className={`note-button ${isSelected ? 'note-button-active' : ''}`}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedNote((currentNote) => (currentNote === note ? '' : note));
                    setFeedback(null);
                    setError('');
                    setMessage('');
                  }}
                >
                  {note}
                </button>
              );
            })}
          </div>
          <input
            className="app-input"
            maxLength={24}
            placeholder="也可以自己写一句"
            value={customNote}
            onChange={(event) => {
              setCustomNote(event.target.value);
              setFeedback(null);
              setError('');
              setMessage('');
            }}
          />
        </div>

        {error && (
          <p className="rounded-[16px] border border-wood-200 bg-wood-100/55 px-4 py-3 text-sm leading-6 text-forest-800">
            {error}
          </p>
        )}

        {message && (
          <div
            className="rounded-[16px] border border-leaf-400 bg-mist px-4 py-3 text-sm leading-6 text-forest-800"
            role="status"
          >
            <p>{message}</p>
            {feedback && (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-moss-600">本次</p>
                  <p className="text-base font-semibold">{formatWeightInput(feedback.todayWeightKg)} kg</p>
                </div>

                {feedback.lastWeekAverageKg === null || feedback.differenceKg === null ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-moss-600">近 7 天参考</p>
                    <p className="text-base font-semibold">记录还不多，先安静保存这一条。</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-moss-600">近 7 天均值</p>
                      <p className="text-base font-semibold">
                        {formatWeightInput(feedback.lastWeekAverageKg)} kg
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-moss-600">
                        与 {feedback.sampleCount} 条记录相比
                      </p>
                      <p className="text-base font-semibold">
                        {feedback.differenceKg > 0 ? '+' : ''}
                        {formatWeightInput(feedback.differenceKg)} kg
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <button className="app-button" type="submit">
          保存记录
        </button>
        {getLatestRecordForDate(records, recordDate) && (
          <button
            className="app-button app-button-secondary"
            type="button"
            onClick={handleDelete}
          >
            删除这天的记录
          </button>
        )}
      </div>
    </form>
  );
}

function TrendPage({
  profile,
  records,
  recordCount,
}: {
  profile: PregnancyProfile;
  records: WeightRecord[];
  recordCount: number;
}) {
  const trendPoints = buildWeeklyWeightTrend(records, profile);
  const currentPregnancyWeek = calculatePregnancyProgress(profile.dueDate)?.gestationalWeek ?? null;
  const [selectedWeek, setSelectedWeek] = useState<number | null>(currentPregnancyWeek);
  const [showAllWeeklyRows, setShowAllWeeklyRows] = useState(false);
  const [showLocalRecords, setShowLocalRecords] = useState(false);
  const [showStandardInfo, setShowStandardInfo] = useState(false);
  const [chartMode, setChartMode] = useState<WeightChartMode>('week');
  const standardRanges = BMI_GAIN_STANDARD_TABLE[profile.bmiCategory].weeklyRanges;
  const historyRecords = getLatestHistoryRecords(records);
  const historyRecordsAsc = historyRecords.slice().reverse();
  const todayDate = getTodayDateOnly();
  const sevenDaysAgo = addDaysToDateOnly(todayDate, -6) ?? todayDate;
  const earliestRecordDate = historyRecordsAsc[0]?.date;
  const dailyStartDate =
    earliestRecordDate && earliestRecordDate < sevenDaysAgo ? earliestRecordDate : sevenDaysAgo;
  const dailyDateCount = Math.max(
    7,
    (differenceInCalendarDays(dailyStartDate, todayDate) ?? 6) + 1,
  );
  const dailyDates = Array.from({ length: dailyDateCount }, (_, index) =>
    addDaysToDateOnly(dailyStartDate, index),
  ).filter((date): date is string => date !== null);

  const createChartPoint = ({
    x,
    week,
    weightKg,
    primaryLabel,
    secondaryLabel,
  }: Omit<WeightChartPoint, 'status'>): WeightChartPoint => {
    const standardRange = getStandardRange(profile.bmiCategory, week);

    return {
      x,
      week,
      weightKg,
      primaryLabel,
      secondaryLabel,
      status: getWeightStatus(weightKg - profile.preWeightKg, standardRange),
    };
  };

  const weeklyChartPoints = trendPoints.map((point) =>
    createChartPoint({
      x: point.week,
      week: point.week,
      weightKg: point.averageWeightKg,
      primaryLabel: String(point.week),
    }),
  );
  const dailyChartPoints = dailyDates.flatMap((date, index) => {
    const record = getLatestRecordForDate(records, date);
    const progress = calculatePregnancyProgress(profile.dueDate, date);

    if (!record || !progress) {
      return [];
    }

    return [
      createChartPoint({
        x: index,
        week: progress.gestationalWeek,
        weightKg: record.weightKg,
        primaryLabel: date === todayDate ? '今天' : formatMonthDay(date),
        secondaryLabel: `${progress.gestationalWeek}周${progress.gestationalDayOfWeek}天`,
      }),
    ];
  });
  const recordedChartPoints = historyRecordsAsc.map((record, index) => {
    const progress = calculatePregnancyProgress(profile.dueDate, record.date);

    return createChartPoint({
      x: index,
      week: progress?.gestationalWeek ?? 1,
      weightKg: record.weightKg,
      primaryLabel: record.date === todayDate ? '今天' : formatMonthDay(record.date),
      secondaryLabel: progress
        ? `${progress.gestationalWeek}周${progress.gestationalDayOfWeek}天`
        : undefined,
    });
  });
  const chartPoints =
    chartMode === 'week'
      ? weeklyChartPoints
      : chartMode === 'day'
        ? dailyChartPoints
        : recordedChartPoints;
  const chartBandPoints: WeightBandPoint[] =
    chartMode === 'records'
      ? []
      : chartMode === 'week'
        ? standardRanges.map((range) => ({
            x: range.week,
            minWeightKg: profile.preWeightKg + range.minGainKg,
            maxWeightKg: profile.preWeightKg + range.maxGainKg,
          }))
        : dailyDates.flatMap((date, index) => {
            const week = getGestationalWeekByDate(profile.dueDate, date);
            const range = week ? getStandardRange(profile.bmiCategory, week) : null;

            return range
              ? [{
                  x: index,
                  minWeightKg: profile.preWeightKg + range.minGainKg,
                  maxWeightKg: profile.preWeightKg + range.maxGainKg,
                }]
              : [];
          });
  const allChartWeights = [
    ...chartPoints.map((point) => point.weightKg),
    ...chartBandPoints.flatMap((point) => [point.minWeightKg, point.maxWeightKg]),
    profile.preWeightKg,
  ];
  const minChartWeight = Math.floor(Math.min(...allChartWeights) - 2);
  const maxChartWeight = Math.ceil(Math.max(...allChartWeights) + 2);
  const xDomainMax =
    chartMode === 'week'
      ? 40
      : chartMode === 'day'
        ? Math.max(6, dailyDates.length - 1)
        : Math.max(6, recordedChartPoints.length - 1);
  const chartWidth =
    chartMode === 'week'
      ? TREND_CHART_VIEWBOX.width
      : chartMode === 'day'
        ? Math.max(TREND_CHART_VIEWBOX.width, 46 + (dailyDates.length - 1) * 48 + 18)
        : Math.max(TREND_CHART_VIEWBOX.width, 46 + (recordedChartPoints.length - 1) * 72 + 18);
  const chartScale = createTrendChartScale({
    width: chartWidth,
    domain: {
      minWeek: chartMode === 'week' ? 1 : 0,
      maxWeek: xDomainMax,
      minGainKg: minChartWeight,
      maxGainKg: maxChartWeight,
    },
  });
  const chartBandPath = buildWeightBandPath(chartBandPoints, chartScale);
  const weightLinePath = buildWeightLinePath(chartPoints, chartScale);
  const yTickStep = (maxChartWeight - minChartWeight) / 4;
  const weightTicks = Array.from({ length: 5 }, (_, index) =>
    roundWeightToTwoDecimals(minChartWeight + index * yTickStep),
  );
  const xTicks: Array<{
    x: number;
    primaryLabel: string;
    secondaryLabel?: string;
  }> =
    chartMode === 'week'
      ? Array.from({ length: 10 }, (_, index) => (index + 1) * 4).map((week) => ({
          x: week,
          primaryLabel: String(week),
        }))
      : chartMode === 'day'
        ? dailyDates.map((date, index) => {
            const progress = calculatePregnancyProgress(profile.dueDate, date);

            return {
              x: index,
              primaryLabel: date === todayDate ? '今天' : formatMonthDay(date),
              secondaryLabel: progress
                ? `${progress.gestationalWeek}周${progress.gestationalDayOfWeek}天`
                : undefined,
            };
          })
        : recordedChartPoints.map((point) => ({
            x: point.x,
            primaryLabel: point.primaryLabel,
            secondaryLabel: point.secondaryLabel,
          }));
  const chartScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const container = chartScrollRef.current;

      if (container) {
        container.scrollLeft = chartMode === 'week' ? 0 : container.scrollWidth;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [chartMode, chartWidth]);
  const selectedPoint =
    trendPoints.find((point) => point.week === selectedWeek) ?? trendPoints[trendPoints.length - 1];
  const selectedStandardRange = selectedPoint
    ? getStandardRange(profile.bmiCategory, selectedPoint.week)
    : null;
  const selectedStatus = selectedPoint
    ? getWeightStatus(selectedPoint.gainKg, selectedStandardRange)
    : null;
  const weeklyTrendRows = trendPoints.map((point, index) => {
    const previousPoint = trendPoints[index - 1];
    const standardRange = getStandardRange(profile.bmiCategory, point.week);
    const changeFromPreviousWeek =
      previousPoint === undefined
        ? null
        : roundWeightToTwoDecimals(point.averageWeightKg - previousPoint.averageWeightKg);

    return {
      ...point,
      changeFromPreviousWeek,
      suggestedWeightRange: standardRange
        ? {
            minWeightKg: profile.preWeightKg + standardRange.minGainKg,
            maxWeightKg: profile.preWeightKg + standardRange.maxGainKg,
          }
        : null,
      };
  });
  const weeklyTrendRowsDesc = weeklyTrendRows.slice().reverse();
  const visibleWeeklyTrendRows = showAllWeeklyRows
    ? weeklyTrendRowsDesc
    : weeklyTrendRowsDesc.slice(0, 2);

  return (
    <section className="space-y-5" aria-labelledby="trend-title">
      <div className="rounded-[24px] border border-stone-200 bg-warm-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="trend-title" className="text-2xl font-semibold">体重曲线</h2>
          <div className="inline-flex rounded-full bg-stone-100 p-1" aria-label="体重曲线视图">
            {([
              ['day', '日'],
              ['week', '孕周'],
              ['records', '仅看有记录'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                className={`rounded-full px-3 py-2 text-sm transition ${
                  chartMode === mode
                    ? 'bg-warm-white font-semibold text-forest-900 shadow-sm'
                    : 'text-moss-600'
                }`}
                type="button"
                aria-pressed={chartMode === mode}
                onClick={() => setChartMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 rounded-[20px] border border-stone-200 bg-warm-white p-3">
          <div
            ref={chartScrollRef}
            className={chartMode === 'week' ? 'overflow-hidden pb-2' : 'overflow-x-auto overscroll-x-contain pb-2'}
            aria-label={
              chartMode === 'week'
                ? '完整孕周体重曲线'
                : '体重曲线，可左右滑动查看更早数据'
            }
          >
          <svg
            className="h-auto max-w-none overflow-visible"
            width={chartWidth}
            viewBox={`0 0 ${chartWidth} ${TREND_CHART_VIEWBOX.height}`}
            role="img"
            aria-labelledby="trend-chart-title trend-chart-desc"
          >
            <title id="trend-chart-title">孕期体重曲线图</title>
            <desc id="trend-chart-desc">
              纵轴为体重千克，可切换按日、按孕周或仅查看有记录的数据。
            </desc>
            <rect
              x={chartScale.padding.left}
              y={chartScale.padding.top}
              width={chartScale.plotWidth}
              height={chartScale.plotHeight}
              rx="8"
              fill="#fffdf8"
              opacity="0.72"
            />

            {chartBandPath && (
              <path
                d={chartBandPath}
                fill="#b8efe5"
                opacity="0.55"
                stroke="#43cdb7"
                strokeWidth="1"
                strokeDasharray="5 5"
                strokeLinejoin="round"
              />
            )}

            {weightTicks.map((tick) => {
              const y = chartScale.yForGain(tick);

              return (
                <g key={tick}>
                  <line
                    x1={chartScale.padding.left}
                    y1={y}
                    x2={chartScale.width - chartScale.padding.right}
                    y2={y}
                    stroke="#d8dedb"
                    strokeWidth="1"
                    strokeDasharray="5 5"
                  />
                  <text
                    x={chartScale.padding.left - 10}
                    y={y + 4}
                    fill="#687965"
                    fontSize="10"
                    textAnchor="end"
                  >
                    {tick.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {xTicks.map((tick) => {
              const x = chartScale.xForWeek(tick.x);

              return (
                <g key={`${tick.x}-${tick.primaryLabel}`}>
                  <line
                    x1={x}
                    y1={chartScale.padding.top}
                    x2={x}
                    y2={chartScale.height - chartScale.padding.bottom}
                    stroke="#d8dedb"
                    strokeWidth="1"
                    strokeDasharray="5 5"
                  />
                  <text
                    x={x}
                    y={chartScale.height - 28}
                    fill="#687965"
                    fontSize="10"
                    textAnchor="middle"
                  >
                    <tspan x={x}>{tick.primaryLabel}</tspan>
                    {tick.secondaryLabel && (
                      <tspan x={x} dy="11">{tick.secondaryLabel}</tspan>
                    )}
                  </text>
                </g>
              );
            })}

            <line
              x1={chartScale.padding.left}
              y1={chartScale.height - chartScale.padding.bottom}
              x2={chartScale.width - chartScale.padding.right}
              y2={chartScale.height - chartScale.padding.bottom}
              stroke="#cbd3cf"
              strokeWidth="1"
            />
            <line
              x1={chartScale.padding.left}
              y1={chartScale.padding.top}
              x2={chartScale.padding.left}
              y2={chartScale.height - chartScale.padding.bottom}
              stroke="#cbd3cf"
              strokeWidth="1"
            />

            {weightLinePath && (
              <path
                d={weightLinePath}
                fill="none"
                stroke="#00bfa5"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {chartPoints.map((point, index) => {
              const x = chartScale.xForWeek(point.x);
              const y = chartScale.yForGain(point.weightKg);
              const isLatest = index === chartPoints.length - 1;
              const color = getWeightStatusColor(point.status);
              const showPointLabel = chartMode !== 'week' || isLatest;

              return (
                <g
                  key={`${chartMode}-${point.x}-${point.week}`}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer outline-none"
                  aria-label={`查看第 ${point.week} 周详情`}
                  onClick={() => setSelectedWeek(point.week)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedWeek(point.week);
                    }
                  }}
                >
                  <circle cx={x} cy={y} r="13" fill="transparent" />
                  {isLatest && (
                    <circle
                      cx={x}
                      cy={y}
                      r="9"
                      fill="#fffdf8"
                      stroke={color}
                      strokeWidth="4"
                    />
                  )}
                  {!isLatest && <circle cx={x} cy={y} r="4" fill={color} />}
                  {showPointLabel && (
                    <text
                      x={x}
                      y={y - 12}
                      fill={isLatest ? color : '#687965'}
                      fontSize={isLatest ? '11' : '9'}
                      fontWeight={isLatest ? '700' : '600'}
                      textAnchor="middle"
                    >
                      {formatWeightInput(point.weightKg)}{isLatest ? ' kg' : ''}
                    </text>
                  )}
                </g>
              );
            })}

            <text x="10" y="14" fill="#4a5e4e" fontSize="10">
              体重 kg
            </text>
            <text
              x={chartScale.width - chartScale.padding.right}
              y={chartScale.height - 4}
              fill="#4a5e4e"
              fontSize="10"
              textAnchor="end"
            >
              {chartMode === 'week' ? '孕周' : '日期'}
            </text>
          </svg>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-moss-600">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3498db]" />
              偏低
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#00bfa5]" />
              正常
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f5a623]" />
              偏高
            </span>
          </div>
          <button
            className="mt-3 text-xs font-medium text-moss-700 underline decoration-stone-300 underline-offset-4"
            type="button"
            aria-expanded={showStandardInfo}
            aria-controls="weight-standard-info"
            onClick={() => setShowStandardInfo((current) => !current)}
          >
            参考标准：{WEIGHT_STANDARD_SOURCE.code} {showStandardInfo ? '收起' : 'ⓘ'}
          </button>
          {showStandardInfo && (
            <p id="weight-standard-info" className="mt-2 text-xs leading-5 text-moss-600">
              《{WEIGHT_STANDARD_SOURCE.title}》。逐周色带是根据标准总增重范围生成的估算轨迹，仅供观察趋势；不适用于多胎妊娠，合并症或并发症请结合产检医生意见。
            </p>
          )}
          {selectedPoint ? (
            <div className="mt-4 rounded-[16px] border border-stone-200 bg-warm-white/85 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold text-forest-900">
                    第 {selectedPoint.week} 周
                  </h3>
                </div>
                <p className="text-right text-xs leading-5 text-moss-600">
                  {formatWeekDateRange(selectedPoint)}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-moss-600">周均体重</p>
                  <p className="mt-1 font-semibold text-forest-900">
                    {formatWeightInput(selectedPoint.averageWeightKg)} kg
                  </p>
                </div>
                <div>
                  <p className="text-xs text-moss-600">相对增重</p>
                  <p className="mt-1 font-semibold text-forest-900">
                    {selectedPoint.gainKg > 0 ? '+' : ''}
                    {formatWeightInput(selectedPoint.gainKg)} kg
                  </p>
                </div>
                <div>
                  <p className="text-xs text-moss-600">记录数量</p>
                  <p className="mt-1 font-semibold text-forest-900">
                    {selectedPoint.recordCount} 条
                  </p>
                </div>
                <div>
                  <p className="text-xs text-moss-600">参考区间</p>
                  <p className="mt-1 font-semibold text-forest-900">
                    {formatRangeText(selectedStandardRange)}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-moss-600">参考状态</p>
                  <p className="mt-1 font-semibold text-forest-900">
                    {getReferenceStatusText(selectedStatus)}
                  </p>
                  {getReferenceStatusNote(selectedStatus) && (
                    <p className="mt-1 text-xs leading-5 text-moss-600">
                      {getReferenceStatusNote(selectedStatus)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-center text-sm leading-6 text-forest-700">
              暂无趋势数据
            </p>
          )}
        </div>
      </div>

      <div className="rounded-[20px] border border-stone-200 bg-warm-white/80 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-forest-900">每周体重变化</h3>
          </div>
          <div className="text-right">
            {weeklyTrendRows.length > 0 && (
              <p className="text-xs leading-5 text-moss-600">共 {weeklyTrendRows.length} 周</p>
            )}
            {weeklyTrendRows.length > 2 && (
              <button
                className="mt-1 text-sm font-medium text-forest-700 underline decoration-stone-300 underline-offset-4"
                type="button"
                aria-expanded={showAllWeeklyRows}
                aria-controls="weekly-weight-rows"
                onClick={() => setShowAllWeeklyRows((current) => !current)}
              >
                {showAllWeeklyRows ? '收起' : '查看全部'}
              </button>
            )}
          </div>
        </div>

        {weeklyTrendRows.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-[16px] border border-stone-200">
            <div className="grid grid-cols-[0.85fr_1fr_1fr] gap-2 border-b border-stone-200 bg-mist px-3 py-2 text-xs font-medium text-moss-600">
              <span>周数</span>
              <span className="text-right">周均体重</span>
              <span className="text-right">较上周</span>
            </div>
            <div id="weekly-weight-rows" className="divide-y divide-stone-200/80 bg-warm-white/80">
              {visibleWeeklyTrendRows.map((point) => (
                  <article
                    key={point.week}
                    className="grid gap-2 px-3 py-3 text-sm"
                  >
                    <div className="grid grid-cols-[0.85fr_1fr_1fr] gap-2">
                      <div>
                        <p className="font-semibold text-forest-900">第 {point.week} 周</p>
                        <p className="mt-1 text-xs text-moss-600">{point.recordCount} 条</p>
                      </div>
                      <p className="text-right font-semibold text-forest-900">
                        {formatWeightInput(point.averageWeightKg)} kg
                      </p>
                      <p className="text-right font-semibold text-forest-900">
                        {point.changeFromPreviousWeek === null
                          ? '—'
                          : `${point.changeFromPreviousWeek > 0 ? '+' : ''}${formatWeightInput(
                              point.changeFromPreviousWeek,
                            )} kg`}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-[12px] bg-mist px-3 py-2 text-xs text-moss-700">
                      <span>建议体重范围</span>
                      <span className="text-right font-semibold text-forest-800">
                        {point.suggestedWeightRange
                          ? `${formatWeightInput(
                              point.suggestedWeightRange.minWeightKg,
                            )} - ${formatWeightInput(point.suggestedWeightRange.maxWeightKg)} kg`
                          : '暂无'}
                      </span>
                    </div>
                  </article>
                ))}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm leading-6 text-forest-700">
            暂无每周数据
          </p>
        )}
      </div>

      <div className="rounded-[20px] border border-stone-200 bg-warm-white/80 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-forest-900">本地体重记录</h3>
          </div>
          <div className="text-right">
            {recordCount > 0 && (
              <p className="text-xs leading-5 text-moss-600">共 {historyRecords.length} 天</p>
            )}
            {historyRecords.length > 0 && (
              <button
                className="mt-1 text-sm font-medium text-forest-700 underline decoration-stone-300 underline-offset-4"
                type="button"
                aria-expanded={showLocalRecords}
                aria-controls="local-weight-records"
                onClick={() => setShowLocalRecords((current) => !current)}
              >
                {showLocalRecords ? '收起' : '展开记录'}
              </button>
            )}
          </div>
        </div>

        {historyRecords.length > 0 && showLocalRecords ? (
          <div id="local-weight-records" className="mt-4 divide-y divide-stone-200/80">
            {historyRecords.map((record) => {
              const gestationalWeek = getGestationalWeekByDate(profile.dueDate, record.date);

              return (
                <article key={record.date} className="grid grid-cols-[1fr_auto] gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-forest-900">{record.date}</p>
                    <p className="mt-1 text-xs text-moss-600">
                      {formatGestationalWeekText(gestationalWeek)}
                      {record.note ? ` · ${record.note}` : ''}
                    </p>
                  </div>
                  <p className="text-right text-base font-semibold text-forest-900">
                    {formatWeightInput(record.weightKg)} kg
                  </p>
                </article>
              );
            })}
          </div>
        ) : historyRecords.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-forest-700">
            暂无记录
          </p>
        ) : null}
      </div>
    </section>
  );
}

function SettingsPage({
  profile,
  records,
  recordCount,
  onProfileUpdated,
  onRecordsImported,
}: {
  profile: PregnancyProfile;
  records: WeightRecord[];
  recordCount: number;
  onProfileUpdated: (profile: PregnancyProfile) => string | undefined;
  onRecordsImported: (records: WeightRecord[]) => string | undefined;
}) {
  const [dueDate, setDueDate] = useState(profile.dueDate);
  const [heightCm, setHeightCm] = useState(formatWeightInput(profile.heightCm));
  const [preWeightKg, setPreWeightKg] = useState(formatWeightInput(profile.preWeightKg));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const [exportBackupText, setExportBackupText] = useState('');
  const [exportBackupFilename, setExportBackupFilename] = useState('');
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<CsvImportPreview | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');

  const parsedHeightCm = Number(heightCm);
  const parsedPreWeightKg = Number(preWeightKg);
  const bmiPreview =
    Number.isFinite(parsedHeightCm) && Number.isFinite(parsedPreWeightKg)
      ? calculateBMIResult({ heightCm: parsedHeightCm, weightKg: parsedPreWeightKg })
      : null;
  const canShowBMI = bmiPreview !== null && Number.isFinite(bmiPreview.bmi);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!isValidDateOnly(dueDate)) {
      setError('请填写有效的预产期。');
      return;
    }

    if (!Number.isFinite(parsedHeightCm) || parsedHeightCm < 120 || parsedHeightCm > 220) {
      setError('请填写合理的孕前身高。');
      return;
    }

    if (
      !Number.isFinite(parsedPreWeightKg) ||
      parsedPreWeightKg < 30 ||
      parsedPreWeightKg > 180
    ) {
      setError('请填写合理的孕前体重。');
      return;
    }

    const bmiResult = calculateBMIResult({
      heightCm: parsedHeightCm,
      weightKg: parsedPreWeightKg,
    });

    if (!Number.isFinite(bmiResult.bmi)) {
      setError('身高和体重暂时无法计算 BMI，请检查后再保存。');
      return;
    }

    const saveError = onProfileUpdated({
      dueDate,
      heightCm: parsedHeightCm,
      preWeightKg: parsedPreWeightKg,
      preBMI: bmiResult.bmi,
      bmiCategory: bmiResult.category,
      updatedAt: Date.now(),
    });

    if (saveError) {
      setError(saveError);
      return;
    }

    setHeightCm(formatWeightInput(parsedHeightCm));
    setPreWeightKg(formatWeightInput(parsedPreWeightKg));
    setMessage('个人信息已保存，孕周和趋势会按新资料更新。');
  };

  const handleExportCsv = async () => {
    setExportError('');
    setExportMessage('');
    setExportBackupText('');
    setExportBackupFilename('');

    if (records.length === 0) {
      setExportError('还没有体重记录，先不用导出。');
      return;
    }

    const csv = `\uFEFF${buildRecordsCsv(records)}`;
    const exportDate = getTodayDateOnly();
    const filename = `pregnancy-weight-records-${exportDate}.csv`;

    setExportBackupText(csv);
    setExportBackupFilename(filename);

    try {
      const result = await shareOrDownloadTextFile({
        filename,
        content: csv,
        mimeType: 'text/csv;charset=utf-8',
      });

      setExportMessage(
        result === 'shared'
          ? `已打开系统分享面板，共 ${getLatestHistoryRecords(records).length} 天记录。`
          : `已生成 ${getLatestHistoryRecords(records).length} 天记录。若手机没有弹出文件，请复制下方备份文本。`,
      );
    } catch {
      setExportMessage(`已生成 ${getLatestHistoryRecords(records).length} 天记录。请复制下方备份文本。`);
    }
  };

  const handleCopyExportBackup = async () => {
    setExportError('');

    if (!exportBackupText) {
      setExportError('请先导出一次 CSV 备份。');
      return;
    }

    try {
      await navigator.clipboard.writeText(exportBackupText.replace(/^\uFEFF/, ''));
      setExportMessage(`已复制 ${exportBackupFilename || 'CSV 备份'} 内容。`);
    } catch {
      setExportError('暂时无法自动复制，可以长按下方文本框手动全选复制。');
    }
  };

  const handleDownloadCsvTemplate = () => {
    downloadTextFile({
      filename: 'pregnancy-weight-import-template.csv',
      content: `\uFEFF${buildImportTemplateCsv()}`,
      mimeType: 'text/csv;charset=utf-8',
    });
  };

  const handleDownloadExcelTemplate = async () => {
    downloadBinaryFile({
      filename: 'pregnancy-weight-import-template.xlsx',
      content: await buildImportTemplateWorkbook(),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  };

  const handlePreviewImport = () => {
    setImportError('');
    setImportMessage('');

    const preview = parseRecordsCsv(importText);
    setImportPreview(preview);

    if (preview.records.length === 0) {
      setImportError('没有找到可导入的记录。请至少保留 date 和 weightKg 两列。');
      return;
    }

    setImportMessage(
      `准备导入 ${preview.records.length} 条记录，${preview.skippedRows.length} 行会被跳过。`,
    );
  };

  const handleImportFile = async (file: File | undefined) => {
    setImportError('');
    setImportMessage('');
    setImportPreview(null);

    if (!file) {
      return;
    }

    const fileName = file.name.toLowerCase();
    const isCsvLike =
      fileName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain' || file.type === '';
    const isExcelLike =
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls') ||
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel';

    if (!isCsvLike && !isExcelLike) {
      setImportError('请选择 CSV 或 Excel 文件，也可以粘贴 CSV 内容导入。');
      return;
    }

    try {
      const fileText = isExcelLike ? '' : await file.text();
      const preview = isExcelLike
        ? await parseRecordsWorkbook(await file.arrayBuffer())
        : parseRecordsCsv(fileText);

      setImportText(fileText);
      setImportPreview(preview);

      if (preview.records.length === 0) {
        setImportError('文件已读取，但没有找到可导入的记录。请至少保留 date 和 weightKg 两列。');
        return;
      }

      setImportMessage(
        `已读取 ${file.name}，准备导入 ${preview.records.length} 条记录，${preview.skippedRows.length} 行会被跳过。`,
      );
    } catch {
      setImportError('文件暂时无法读取，可以下载模板后，把记录复制进去再导入。');
    }
  };

  const handleConfirmImport = () => {
    if (!importPreview || importPreview.records.length === 0) {
      setImportError('请先选择文件或预览可导入的 CSV 内容。');
      return;
    }

    const snapshotResult = createImportSnapshot({ profile, records });

    if (snapshotResult.error) {
      setImportError(`${snapshotResult.error}，导入暂未继续。`);
      return;
    }

    const nextRecords = mergeRecordsByNewestCreatedAt(records, importPreview.records);
    const saveError = onRecordsImported(nextRecords);

    if (saveError) {
      setImportError(saveError);
      return;
    }

    setImportText('');
    setImportPreview(null);
    setImportError('');
    setImportMessage(`已导入 ${importPreview.records.length} 条记录，并按日期合并。`);
  };

  return (
    <section className="space-y-5" aria-label="设置与数据">
      <div className="rounded-[24px] border border-stone-200 bg-warm-white p-5 shadow-soft">
        <div className="grid gap-3">
          <a className="app-button app-button-secondary grid place-items-center" href="#profile-settings">
            个人信息
          </a>
          <button
            className="app-button app-button-secondary"
            type="button"
            onClick={() => {
              void handleExportCsv();
            }}
          >
            导出 CSV
          </button>
          <a className="app-button app-button-secondary grid place-items-center" href="#csv-import">
            导入数据
          </a>
        </div>
        {(exportError || exportMessage) && (
          <p className="mt-4 rounded-[16px] border border-stone-200 bg-mist px-4 py-3 text-sm leading-6 text-forest-800">
            {exportError || exportMessage}
          </p>
        )}
        {exportBackupText && (
          <div className="mt-4 grid gap-3 rounded-[16px] border border-stone-200 bg-mist p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-forest-900">CSV 备份文本</p>
                <p className="mt-1 text-xs leading-5 text-moss-600">
                  {exportBackupFilename || 'pregnancy-weight-records.csv'}
                </p>
              </div>
              <button
                className="app-button app-button-secondary min-h-11 px-4"
                type="button"
                onClick={() => {
                  void handleCopyExportBackup();
                }}
              >
                复制
              </button>
            </div>
            <textarea
              className="app-input min-h-32 py-3 text-xs leading-5"
              readOnly
              value={exportBackupText.replace(/^\uFEFF/, '')}
            />
          </div>
        )}
      </div>

      <form
        id="profile-settings"
        className="rounded-[24px] border border-stone-200 bg-warm-white p-5 shadow-soft"
        aria-labelledby="profile-settings-title"
        onSubmit={handleSubmit}
      >
        <h3 id="profile-settings-title" className="text-xl font-semibold text-forest-900">
          基础资料
        </h3>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-forest-700" htmlFor="settings-due-date">
              预产期
            </label>
            <input
              id="settings-due-date"
              className="app-input"
              inputMode="numeric"
              placeholder="例如 2026-11-01"
              value={dueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
                setError('');
                setMessage('');
              }}
            />
            <p className="text-xs text-moss-600">格式 YYYY-MM-DD</p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-forest-700" htmlFor="settings-height-cm">
              孕前身高
            </label>
            <input
              id="settings-height-cm"
              className="app-input"
              inputMode="decimal"
              placeholder="例如 165"
              value={heightCm}
              onChange={(event) => {
                setHeightCm(event.target.value);
                setError('');
                setMessage('');
              }}
            />
            <p className="text-xs text-moss-600">单位 cm</p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-forest-700" htmlFor="settings-pre-weight">
              孕前体重
            </label>
            <input
              id="settings-pre-weight"
              className="app-input"
              inputMode="decimal"
              placeholder="例如 55.0"
              value={preWeightKg}
              onChange={(event) => {
                setPreWeightKg(event.target.value);
                setError('');
                setMessage('');
              }}
            />
            <p className="text-xs text-moss-600">单位 kg</p>
          </div>

          <div className="rounded-[16px] border border-stone-200 bg-mist p-4">
            <p className="text-sm text-moss-600">孕前 BMI</p>
            <p className="mt-1 text-lg font-semibold text-forest-900">
              {canShowBMI
                ? `${bmiPreview.bmi} · ${getBMICategoryLabel(bmiPreview.category)}`
                : '填写身高体重后自动计算'}
            </p>
          </div>

          {error && (
            <p className="rounded-[16px] border border-wood-200 bg-wood-100/55 px-4 py-3 text-sm leading-6 text-forest-800">
              {error}
            </p>
          )}

          {message && (
            <p className="rounded-[16px] border border-leaf-400 bg-mist px-4 py-3 text-sm leading-6 text-forest-800">
              {message}
            </p>
          )}

          <button className="app-button" type="submit">
            保存个人信息
          </button>
        </div>
      </form>

      <div
        id="csv-import"
        className="rounded-[24px] border border-stone-200 bg-warm-white p-5 shadow-soft"
      >
        <h3 className="text-xl font-semibold text-forest-900">导入记录</h3>
        <div className="mt-5 grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="app-button app-button-secondary"
              type="button"
              onClick={() => {
                void handleDownloadExcelTemplate();
              }}
            >
              下载 Excel 模板
            </button>
            <button
              className="app-button app-button-secondary"
              type="button"
              onClick={handleDownloadCsvTemplate}
            >
              下载 CSV 模板
            </button>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-forest-700" htmlFor="csv-file-import">
              选择 CSV 或 Excel 文件
            </label>
            <input
              id="csv-file-import"
              className="app-input py-3"
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => {
                void handleImportFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <p className="text-xs leading-5 text-moss-600">
              支持 date/日期 + weightKg/体重 两列；日期可写 2026-02-08 或 2026/2/8。
            </p>
          </div>

          <textarea
            className="app-input min-h-40 py-3 leading-6"
            placeholder="也可以粘贴 CSV 内容，例如：date,weightKg,note"
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setImportPreview(null);
              setImportError('');
              setImportMessage('');
            }}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="app-button app-button-secondary" type="button" onClick={handlePreviewImport}>
              预览导入
            </button>
            <button className="app-button" type="button" onClick={handleConfirmImport}>
              确认导入
            </button>
          </div>

          {(importError || importMessage) && (
            <p className="rounded-[16px] border border-stone-200 bg-mist px-4 py-3 text-sm leading-6 text-forest-800">
              {importError || importMessage}
            </p>
          )}

          {importPreview && (
            <div className="rounded-[16px] border border-stone-200 bg-mist p-4 text-sm text-forest-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-moss-600">可导入记录</p>
                  <p className="mt-1 font-semibold">{importPreview.records.length} 条</p>
                </div>
                <div>
                  <p className="text-xs text-moss-600">跳过行</p>
                  <p className="mt-1 font-semibold">{importPreview.skippedRows.length} 行</p>
                </div>
              </div>

              {importPreview.records.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {importPreview.records.slice(0, 3).map((record) => (
                    <div key={`${record.date}-${record.createdAt}`} className="flex justify-between gap-3">
                      <span>{record.date}</span>
                      <span className="font-semibold">{formatWeightInput(record.weightKg)} kg</span>
                    </div>
                  ))}
                </div>
              )}

              {importPreview.skippedRows.length > 0 && (
                <p className="mt-4 text-xs leading-5 text-moss-600">
                  第 {importPreview.skippedRows[0].rowNumber} 行：{importPreview.skippedRows[0].reason}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="rounded-[20px] border border-stone-200 bg-warm-white/80 p-5">
        <h3 className="text-xl font-semibold text-forest-900">本地保存与备份</h3>
        <p className="mt-3 text-sm leading-6 text-forest-700">
          数据仅保存在当前浏览器，现有 {recordCount} 条记录。更换设备或清理浏览器数据前，建议导出备份。
        </p>
        <button
          className="app-button app-button-secondary mt-5 w-full"
          type="button"
          onClick={() => {
            void handleExportCsv();
          }}
        >
          导出 CSV 备份
        </button>
        {exportBackupText && (
          <div className="mt-4 grid gap-3 rounded-[16px] border border-stone-200 bg-mist p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-forest-900">CSV 备份文本</p>
                <p className="mt-1 text-xs leading-5 text-moss-600">
                  {exportBackupFilename || 'pregnancy-weight-records.csv'}
                </p>
              </div>
              <button
                className="app-button app-button-secondary min-h-11 px-4"
                type="button"
                onClick={() => {
                  void handleCopyExportBackup();
                }}
              >
                复制
              </button>
            </div>
            <textarea
              className="app-input min-h-32 py-3 text-xs leading-5"
              readOnly
              value={exportBackupText.replace(/^\uFEFF/, '')}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function BottomTabs({
  activeTab,
  onChange,
}: {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-warm-white/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2" aria-label="主导航">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              className={`tab-button ${isActive ? 'tab-button-active' : ''}`}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onChange(tab.id)}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {tab.icon}
              </span>
              <span className="text-sm font-semibold leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default App;
