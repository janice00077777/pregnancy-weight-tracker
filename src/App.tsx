import { type FormEvent, useMemo, useState } from 'react';
import { calculateBMIResult, getBMICategoryLabel } from './services/bmi';
import { calculatePregnancyProgress, isValidDateOnly } from './services/pregnancy';
import {
  createWeightSaveFeedback,
  createWeightRecord,
  formatWeightInput,
  getLatestRecordForDate,
  parseWeightInput,
  QUICK_NOTES,
  roundWeightToOneDecimal,
  upsertRecordByDate,
  type QuickNote,
  type WeightSaveFeedback,
} from './services/records';
import { loadProfile, loadRecords, saveProfile, saveRecords } from './services/storage';
import type { PregnancyProfile, WeightRecord } from './types/pregnancy';

type TabId = 'home' | 'trend' | 'settings';

type TabItem = {
  id: TabId;
  label: string;
  description: string;
  icon: string;
};

const tabs: TabItem[] = [
  {
    id: 'home',
    label: '主页',
    description: '体重打卡',
    icon: '○',
  },
  {
    id: 'trend',
    label: '趋势',
    description: '曲线参考',
    icon: '⌁',
  },
  {
    id: 'settings',
    label: '设置',
    description: '资料备份',
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

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [appData, setAppData] = useState(loadAppData);

  const activeTitle = useMemo(
    () => tabs.find((tab) => tab.id === activeTab)?.label ?? '主页',
    [activeTab],
  );

  const handleProfileCreated = (profile: PregnancyProfile) => {
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

  if (!appData.profile) {
    return <OnboardingPage onComplete={handleProfileCreated} />;
  }

  return (
    <div className="min-h-dvh bg-mist text-forest-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <header className="px-5 pb-3 pt-5">
          <p className="text-sm text-moss-600">孕期体重助手</p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight">{activeTitle}</h1>
        </header>

        <main className="flex-1 px-5 pb-28">
          {activeTab === 'home' && (
            <HomePage
              profile={appData.profile}
              records={appData.records}
              onRecordCreated={handleRecordCreated}
            />
          )}
          {activeTab === 'trend' && <TrendPage recordCount={appData.recordCount} />}
          {activeTab === 'settings' && (
            <SettingsPage hasProfile={Boolean(appData.profile)} recordCount={appData.recordCount} />
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
          <p className="text-sm text-moss-600">首次使用</p>
          <h1 id="onboarding-title" className="mt-1 text-3xl font-semibold leading-tight">
            先填一点基础资料
          </h1>
          <p className="mt-3 text-base leading-7 text-forest-700">
            用来计算孕周和孕前 BMI，数据只保存在当前浏览器。
          </p>

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
}: {
  profile: PregnancyProfile;
  records: WeightRecord[];
  onRecordCreated: (record: WeightRecord) => string | undefined;
}) {
  return (
    <section className="space-y-5" aria-labelledby="home-title">
      <PregnancyProgressHeader profile={profile} />

      <WeightCheckInPanel
        profile={profile}
        records={records}
        onRecordCreated={onRecordCreated}
      />

      <div className="rounded-[20px] border border-stone-200 bg-warm-white/80 p-5">
        <p className="text-sm text-moss-600">孕周进度</p>
        <p className="mt-2 text-base leading-7 text-forest-700">
          进度会随日期自动更新，用来安静地看见现在走到哪里。
        </p>
      </div>
    </section>
  );
}

function WeightCheckInPanel({
  profile,
  records,
  onRecordCreated,
}: {
  profile: PregnancyProfile;
  records: WeightRecord[];
  onRecordCreated: (record: WeightRecord) => string | undefined;
}) {
  const todayRecord = getLatestRecordForDate(records);
  const initialWeight = todayRecord?.weightKg ?? profile.preWeightKg;
  const initialNote = QUICK_NOTES.find((note) => note === todayRecord?.note) ?? '';
  const [weightInput, setWeightInput] = useState(formatWeightInput(initialWeight));
  const [selectedNote, setSelectedNote] = useState<QuickNote | ''>(initialNote);
  const [feedback, setFeedback] = useState<WeightSaveFeedback | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const adjustWeight = (delta: number) => {
    const currentWeight = parseWeightInput(weightInput) ?? initialWeight;
    const nextWeight = Math.max(0, roundWeightToOneDecimal(currentWeight + delta));

    setWeightInput(formatWeightInput(nextWeight));
    setFeedback(null);
    setError('');
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const weightKg = parseWeightInput(weightInput);

    if (weightKg === null || weightKg < 30 || weightKg > 180) {
      setError('请填写合理的体重，最多保留 1 位小数。');
      return;
    }

    const record = createWeightRecord({
      weightKg,
      note: selectedNote || undefined,
    });
    const nextFeedback = createWeightSaveFeedback(records, record);
    const saveError = onRecordCreated(record);

    if (saveError) {
      setError(saveError);
      return;
    }

    setWeightInput(formatWeightInput(weightKg));
    setFeedback(nextFeedback);
    setMessage('已保存今天的记录。');
  };

  return (
    <form
      className="rounded-[24px] border border-stone-200 bg-warm-white p-5 shadow-soft"
      aria-labelledby="home-title"
      onSubmit={handleSubmit}
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-moss-600">今日</p>
          <h2 id="home-title" className="mt-1 text-3xl font-semibold">
            记录体重
          </h2>
        </div>
        <p className="text-right text-sm leading-6 text-forest-700">
          打开
          <br />
          记录
          <br />
          关闭
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-forest-700" htmlFor="weight-check-in">
            今日体重
          </label>
          <input
            id="weight-check-in"
            className="app-input text-2xl font-semibold"
            inputMode="decimal"
            placeholder="62.5"
            value={weightInput}
            onChange={(event) => {
              setWeightInput(event.target.value);
              setFeedback(null);
              setError('');
              setMessage('');
            }}
          />
          <p className="text-xs text-moss-600">单位 kg，最多 1 位小数</p>
        </div>

        <div className="grid grid-cols-4 gap-2" aria-label="快速微调">
          {[
            { label: '-0.5', value: -0.5 },
            { label: '-0.1', value: -0.1 },
            { label: '+0.1', value: 0.1 },
            { label: '+0.5', value: 0.5 },
          ].map((item) => (
            <button
              key={item.label}
              className="app-button app-button-secondary min-h-11 px-2"
              type="button"
              onClick={() => adjustWeight(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium text-forest-700">备注</p>
          <div className="grid grid-cols-3 gap-2">
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
                  <p className="text-xs text-moss-600">今日</p>
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
      </div>
    </form>
  );
}

function PregnancyProgressHeader({ profile }: { profile: PregnancyProfile }) {
  const progress = calculatePregnancyProgress(profile.dueDate);

  if (!progress) {
    return (
      <section className="rounded-[20px] border border-stone-200 bg-warm-white/80 p-4">
        <p className="text-sm text-moss-600">孕周进度</p>
        <p className="mt-2 text-base leading-7 text-forest-700">
          预产期暂时无法计算，可以稍后在设置里调整。
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-[20px] border border-stone-200 bg-warm-white/80 p-4"
      aria-label="孕周进度"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-moss-600">孕周进度</p>
          <p className="mt-1 text-2xl font-semibold text-forest-900">
            第 {progress.gestationalWeek} 周
          </p>
        </div>
        <div className="text-right text-sm leading-6 text-forest-700">
          <p>孕 {progress.gestationalDay} 天</p>
          <p>剩余 {progress.remainingDays} 天</p>
        </div>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.progressPercent}
        aria-label="280 天进度"
      >
        <div
          className="h-full rounded-full bg-sage-500"
          style={{ width: `${progress.progressPercent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-moss-600">280 天进度 {progress.progressPercent}%</p>
    </section>
  );
}

function TrendPage({ recordCount }: { recordCount: number }) {
  return (
    <section className="space-y-5" aria-labelledby="trend-title">
      <div className="rounded-[24px] border border-stone-200 bg-warm-white p-5 shadow-soft">
        <p className="text-sm text-moss-600">趋势参考</p>
        <h2 id="trend-title" className="mt-1 text-2xl font-semibold">
          增重曲线
        </h2>
        <div className="mt-6 flex aspect-[4/3] items-center justify-center rounded-[20px] border border-stone-200 bg-mist text-center text-sm leading-6 text-forest-700">
          Issue 15 后接入 SVG 趋势图
        </div>
      </div>

      <div className="rounded-[20px] border border-stone-200 bg-warm-white/80 p-5">
        <p className="text-sm text-moss-600">历史记录</p>
        <p className="mt-2 text-base leading-7 text-forest-700">
          {recordCount > 0
            ? `已读取 ${recordCount} 条本地记录，后续会按日期倒序展示。`
            : '保存体重后，记录会按日期倒序展示在这里。'}
        </p>
      </div>
    </section>
  );
}

function SettingsPage({
  hasProfile,
  recordCount,
}: {
  hasProfile: boolean;
  recordCount: number;
}) {
  return (
    <section className="space-y-5" aria-labelledby="settings-title">
      <div className="rounded-[24px] border border-stone-200 bg-warm-white p-5 shadow-soft">
        <p className="text-sm text-moss-600">本地资料</p>
        <h2 id="settings-title" className="mt-1 text-2xl font-semibold">
          设置与数据
        </h2>
        <div className="mt-6 grid gap-3">
          <button className="app-button app-button-secondary" type="button">
            个人信息
          </button>
          <button className="app-button app-button-secondary" type="button">
            导出 CSV
          </button>
          <button className="app-button app-button-secondary" type="button">
            导入数据
          </button>
        </div>
      </div>

      <div className="rounded-[20px] border border-stone-200 bg-warm-white/80 p-5">
        <p className="text-sm text-moss-600">数据说明</p>
        <p className="mt-2 text-base leading-7 text-forest-700">
          数据仅保存在当前浏览器。当前本地资料：{hasProfile ? '已填写' : '未填写'}，
          体重记录 {recordCount} 条。
        </p>
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
              <span className="text-[11px] leading-none text-moss-600">{tab.description}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default App;
