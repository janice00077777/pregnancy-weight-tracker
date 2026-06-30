export type ChartPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TrendChartDomain = {
  minWeek: number;
  maxWeek: number;
  minGainKg: number;
  maxGainKg: number;
};

export type TrendChartScale = {
  width: number;
  height: number;
  padding: ChartPadding;
  plotWidth: number;
  plotHeight: number;
  domain: TrendChartDomain;
  xForWeek: (week: number) => number;
  yForGain: (gainKg: number) => number;
};

export const TREND_CHART_VIEWBOX = {
  width: 340,
  height: 228,
} as const;

export const TREND_CHART_PADDING: ChartPadding = {
  top: 20,
  right: 18,
  bottom: 42,
  left: 46,
};

export const TREND_CHART_WEEK_TICKS = [1, 12, 24, 40] as const;
export const TREND_CHART_GAIN_TICKS = [0, 5, 10, 15] as const;

const clampRatio = (value: number) => Math.min(Math.max(value, 0), 1);

export const createTrendChartScale = ({
  width = TREND_CHART_VIEWBOX.width,
  height = TREND_CHART_VIEWBOX.height,
  padding = TREND_CHART_PADDING,
  domain = {
    minWeek: 1,
    maxWeek: 40,
    minGainKg: 0,
    maxGainKg: 16,
  },
}: {
  width?: number;
  height?: number;
  padding?: ChartPadding;
  domain?: TrendChartDomain;
} = {}): TrendChartScale => {
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const weekRange = Math.max(1, domain.maxWeek - domain.minWeek);
  const gainRange = Math.max(1, domain.maxGainKg - domain.minGainKg);

  return {
    width,
    height,
    padding,
    plotWidth,
    plotHeight,
    domain,
    xForWeek: (week: number) =>
      padding.left + clampRatio((week - domain.minWeek) / weekRange) * plotWidth,
    yForGain: (gainKg: number) =>
      padding.top + (1 - clampRatio((gainKg - domain.minGainKg) / gainRange)) * plotHeight,
  };
};
