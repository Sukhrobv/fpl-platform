export interface ForecastValueRange {
  min: number;
  max: number;
  sortedValues?: readonly number[];
}

export function forecastValueRange(
  values: readonly number[],
): ForecastValueRange {
  const sortedValues = values
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);

  if (!sortedValues.length) {
    return { min: 0, max: 0, sortedValues };
  }

  return {
    min: sortedValues[0],
    max: sortedValues[sortedValues.length - 1],
    sortedValues,
  };
}

function upperBound(values: readonly number[], value: number) {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function forecastScaleLevel(
  value: number | null | undefined,
  range: ForecastValueRange,
  direction: "higher" | "lower" = "higher",
) {
  if (value == null || range.max - range.min < 0.05) {
    return null;
  }

  const percentile =
    range.sortedValues && range.sortedValues.length > 1
      ? (upperBound(range.sortedValues, value) - 1) /
        (range.sortedValues.length - 1)
      : (value - range.min) / (range.max - range.min);
  const relativeValue = direction === "higher" ? percentile : 1 - percentile;

  if (relativeValue >= 0.9) {
    return 10 + Math.min(4, Math.floor(((relativeValue - 0.9) / 0.1) * 5));
  }

  if (relativeValue >= 0.55) {
    return 6 + Math.min(3, Math.floor(((relativeValue - 0.55) / 0.35) * 4));
  }

  return 1 + Math.min(4, Math.floor((relativeValue / 0.55) * 5));
}

export function forecastValueTone(
  value: number | null | undefined,
  range: ForecastValueRange,
  direction: "higher" | "lower" = "higher",
) {
  const level = forecastScaleLevel(value, range, direction);
  return level == null
    ? "text-muted-foreground"
    : `text-[color:var(--forecast-scale-${level})]`;
}

export function forecastValueSurface(
  value: number | null | undefined,
  range: ForecastValueRange,
  direction: "higher" | "lower" = "higher",
) {
  const level = forecastScaleLevel(value, range, direction);
  const surfaceAlpha =
    level === 14
      ? 32
      : level === 13
        ? 27
        : level === 12
          ? 23
          : level === 11
            ? 20
            : 18;

  return level == null
    ? undefined
    : `color-mix(in oklch, var(--forecast-scale-${level}) ${surfaceAlpha}%, transparent)`;
}
