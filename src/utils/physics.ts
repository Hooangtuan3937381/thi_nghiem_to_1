import type {
  CouplingMode,
  ExperimentStatistics,
  MeasurementTrial,
  MusicalNoteEntry,
  TuningForkOption,
} from '../types/lab';

export const GRID_COLS = 10;
export const GRID_ROWS = 8;

export const SEC_PER_DIV_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.0002, label: '200 µs' },
  { value: 0.0005, label: '500 µs' },
  { value: 0.001, label: '1.00 ms' },
  { value: 0.002, label: '2.00 ms' },
  { value: 0.005, label: '5.00 ms' },
  { value: 0.01, label: '10.0 ms' },
];

export const VOLTS_PER_DIV_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.1, label: '100 mV' },
  { value: 0.2, label: '200 mV' },
  { value: 0.5, label: '500 mV' },
  { value: 1.0, label: '1.00 V' },
  { value: 2.0, label: '2.00 V' },
  { value: 5.0, label: '5.00 V' },
];

export const MUSICAL_NOTES_TABLE_10_2: MusicalNoteEntry[] = [
  { note: 'Đô', symbol: 'C', freqHz: 262 },
  { note: 'Rê', symbol: 'D', freqHz: 294 },
  { note: 'Mi', symbol: 'E', freqHz: 330 },
  { note: 'Pha', symbol: 'F', freqHz: 349 },
  { note: 'Son', symbol: 'G', freqHz: 392 },
  { note: 'La', symbol: 'A', freqHz: 440 },
  { note: 'Si', symbol: 'B', freqHz: 494 },
];

export const TUNING_FORKS: TuningForkOption[] = [
  {
    id: 'fork-440',
    name: 'Âm thoa chuẩn La (A4) · 440 Hz',
    nominalFreqHz: 440,
    noteLabel: 'La (A)',
    description: 'Âm thoa chuẩn phổ biến trong phòng thí nghiệm Vật lí 11',
  },
  {
    id: 'fork-262',
    name: 'Âm thoa nốt Đô (C4) · 262 Hz',
    nominalFreqHz: 262,
    noteLabel: 'Đô (C)',
    description: 'Âm thoa tần số thấp theo Bảng 10.2 SGK',
  },
  {
    id: 'fork-330',
    name: 'Âm thoa nốt Mi (E4) · 330 Hz',
    nominalFreqHz: 330,
    noteLabel: 'Mi (E)',
    description: 'Âm thoa âm trung theo Bảng 10.2 SGK',
  },
  {
    id: 'fork-392',
    name: 'Âm thoa nốt Son (G4) · 392 Hz',
    nominalFreqHz: 392,
    noteLabel: 'Son (G)',
    description: 'Âm thoa nốt Son theo Bảng 10.2 SGK',
  },
  {
    id: 'fork-494',
    name: 'Âm thoa nốt Si (B4) · 494 Hz',
    nominalFreqHz: 494,
    noteLabel: 'Si (B)',
    description: 'Âm thoa tần số cao theo Bảng 10.2 SGK',
  },
  {
    id: 'fork-512',
    name: 'Âm thoa thí nghiệm 512 Hz',
    nominalFreqHz: 512,
    noteLabel: 'Đô cao (C5)',
    description: 'Âm thoa chuẩn vật lí thường dùng kiểm chứng chu kì ngắn',
  },
];

export interface SignalParams {
  nominalFreqHz: number;
  distanceCm: number;
  ampPowerOn: boolean;
  ampGain: number;
  cableMicroToAmpConnected: boolean;
  cableAmpToScopeConnected: boolean;
  scopePowerOn: boolean;
  vibrationStrength: number;
  coupling: CouplingMode;
  ambientNoiseEnabled: boolean;
}

/**
 * Computes the peak voltage (in Volts) reaching the oscilloscope CH1 input.
 * Follows inverse distance attenuation from the tuning fork to the microphone,
 * calibrated so that at d = 20 cm, gain = 5, strength = 1.0 -> ~1.5 V peak.
 */
export function computeSignalPeakVolts(params: SignalParams): number {
  if (
    !params.scopePowerOn ||
    !params.cableMicroToAmpConnected ||
    !params.cableAmpToScopeConnected ||
    !params.ampPowerOn
  ) {
    return 0;
  }

  const safeDistance = Math.max(5, Math.min(60, params.distanceCm));
  // Reference distance in textbook (Hình 10.4 step 2) is 20 cm
  const distanceAttenuation = 20 / safeDistance;
  const clampedAttenuation = Math.min(2.2, Math.max(0.25, distanceAttenuation));
  const baseMicVolts = 0.3 * params.vibrationStrength * clampedAttenuation;
  const amplified = baseMicVolts * (params.ampGain / 1.0);
  // Amplifier output rail clips around +/- 8 V
  return Math.min(8.0, Math.max(0, amplified));
}

/**
 * Evaluates instantaneous waveform voltage u(t) at time tSeconds.
 * Deterministic pseudo-noise is used when ambientNoiseEnabled is true so
 * simulations and snapshots remain crisp and reproducible.
 */
export function evaluateWaveformVoltage(
  tSeconds: number,
  params: SignalParams,
  phaseOffsetRad = 0
): number {
  if (!params.scopePowerOn) return 0;

  const isChainReady =
    params.cableMicroToAmpConnected &&
    params.cableAmpToScopeConnected &&
    params.ampPowerOn;

  if (!isChainReady) {
    // Only tiny open-probe residual 50 Hz hum when disconnected
    return 0.015 * Math.sin(2 * Math.PI * 50 * tSeconds);
  }

  const peakVolts = computeSignalPeakVolts(params);
  const dcBiasVolts = params.coupling === 'DC' ? 0.65 * (params.ampGain / 5) : 0;

  // Fundamental acoustic signal from tuning fork
  const fundamental =
    peakVolts * Math.sin(2 * Math.PI * params.nominalFreqHz * tSeconds + phaseOffsetRad);

  // Subtle 2nd harmonic (~3% realism) from rubber hammer strike transient
  const harmonic2 =
    peakVolts * 0.03 * Math.sin(4 * Math.PI * params.nominalFreqHz * tSeconds + phaseOffsetRad);

  let noise = 0;
  if (params.ambientNoiseEnabled) {
    // Environmental room noise: 50 Hz mains hum + higher-frequency room chatter
    const hum50 = 0.14 * (params.ampGain / 5) * Math.sin(2 * Math.PI * 50 * tSeconds + 0.4);
    const chatter =
      0.08 *
      (params.ampGain / 5) *
      (Math.sin(2 * Math.PI * 1130 * tSeconds) * 0.6 +
        Math.sin(2 * Math.PI * 1870 * tSeconds + 1.2) * 0.4);
    noise = hum50 + chatter;
  }

  const raw = dcBiasVolts + fundamental + harmonic2 + noise;
  // Amplifier saturation clipping at +/- 8.5 V
  return Math.max(-8.5, Math.min(8.5, raw));
}

/**
 * Computes period T (seconds) and frequency f (Hz) from oscilloscope horizontal grid reading:
 * T = (divisionsCount * secPerDiv) / periodsCount; f = 1 / T.
 */
export function computeMeasurementFromDivisions(
  divisionsCount: number,
  periodsCount: number,
  secPerDiv: number
): { periodSec: number; frequencyHz: number } {
  if (divisionsCount <= 0 || periodsCount <= 0 || secPerDiv <= 0) {
    throw new Error('Các thông số đo (số ô, số chu kì, SEC/DIV) phải lớn hơn 0.');
  }
  const totalTimeSec = divisionsCount * secPerDiv;
  const periodSec = totalTimeSec / periodsCount;
  const frequencyHz = 1 / periodSec;
  return { periodSec, frequencyHz };
}

/**
 * Finds the closest musical note from Textbook Table 10.2.
 */
export function findClosestMusicalNote(freqHz: number): {
  note: MusicalNoteEntry;
  diffHz: number;
} {
  let best = MUSICAL_NOTES_TABLE_10_2[0];
  let minDiff = Math.abs(freqHz - best.freqHz);
  for (const item of MUSICAL_NOTES_TABLE_10_2) {
    const d = Math.abs(freqHz - item.freqHz);
    if (d < minDiff) {
      minDiff = d;
      best = item;
    }
  }
  return { note: best, diffHz: freqHz - best.freqHz };
}

/**
 * Computes Table 10.1 mean values and experimental errors from recorded trials.
 */
export function computeExperimentStatistics(
  trials: MeasurementTrial[],
  nominalFreqHz: number
): ExperimentStatistics | null {
  if (trials.length === 0) return null;

  const n = trials.length;
  const meanPeriodSec = trials.reduce((acc, t) => acc + t.periodSec, 0) / n;
  const meanFreqHz = trials.reduce((acc, t) => acc + t.frequencyHz, 0) / n;

  const randomErrorPeriodSec =
    trials.reduce((acc, t) => acc + Math.abs(t.periodSec - meanPeriodSec), 0) / n;
  const randomErrorFreqHz =
    trials.reduce((acc, t) => acc + Math.abs(t.frequencyHz - meanFreqHz), 0) / n;

  const relativeErrorPct = meanFreqHz > 0 ? (randomErrorFreqHz / meanFreqHz) * 100 : 0;
  const errorVsNominalPct =
    nominalFreqHz > 0 ? (Math.abs(meanFreqHz - nominalFreqHz) / nominalFreqHz) * 100 : 0;

  const closest = findClosestMusicalNote(meanFreqHz);

  return {
    count: n,
    meanPeriodSec,
    randomErrorPeriodSec,
    meanFreqHz,
    randomErrorFreqHz,
    relativeErrorPct,
    errorVsNominalPct,
    closestNote: closest.note,
    noteDiffHz: closest.diffHz,
  };
}

/**
 * Generates a realistic slight experimental reading (simulating human visual grid reading
 * error around +/- 1.5%) so the student can practice taking 3 slightly varying trials
 * or directly read from the oscilloscope cursors.
 */
export function suggestDivisionsForIdealWave(
  freqHz: number,
  secPerDiv: number,
  periodsCount = 2
): number {
  const periodSec = 1 / freqHz;
  const idealDivs = (periodSec * periodsCount) / secPerDiv;
  return Number(idealDivs.toFixed(2));
}

export function formatPeriodMs(periodSec: number): string {
  return `${(periodSec * 1000).toFixed(3)} ms`;
}

export function formatPeriodSec(periodSec: number): string {
  return periodSec.toFixed(5);
}

export function formatFreqHz(freqHz: number): string {
  return freqHz.toFixed(1);
}

export function formatSecPerDivLabel(secPerDiv: number): string {
  const found = SEC_PER_DIV_OPTIONS.find((o) => Math.abs(o.value - secPerDiv) < 1e-9);
  if (found) return found.label;
  if (secPerDiv < 0.001) return `${Math.round(secPerDiv * 1e6)} µs`;
  return `${(secPerDiv * 1000).toFixed(2)} ms`;
}

export function formatVoltsPerDivLabel(voltsPerDiv: number): string {
  const found = VOLTS_PER_DIV_OPTIONS.find((o) => Math.abs(o.value - voltsPerDiv) < 1e-9);
  if (found) return found.label;
  if (voltsPerDiv < 1) return `${Math.round(voltsPerDiv * 1000)} mV`;
  return `${voltsPerDiv.toFixed(2)} V`;
}

export function clampCursorDiv(val: number): number {
  if (Number.isNaN(val)) return 0;
  return Number(Math.max(0, Math.min(GRID_COLS, val)).toFixed(2));
}

/**
 * Moves cursor1Div or cursor2Div. When locked=true, shifts the partner cursor
 * to preserve Δx while staying within [0, GRID_COLS].
 */
export function moveCursorWithOptionalLock(
  which: 'T1' | 'T2',
  nextPos: number,
  cursor1Div: number,
  cursor2Div: number,
  locked: boolean
): { cursor1Div: number; cursor2Div: number } {
  const clamped = clampCursorDiv(nextPos);
  if (!locked) {
    return which === 'T1'
      ? { cursor1Div: clamped, cursor2Div }
      : { cursor1Div, cursor2Div: clamped };
  }

  const signedSpan = cursor2Div - cursor1Div;
  if (which === 'T1') {
    let next1 = clamped;
    let next2 = next1 + signedSpan;
    if (next2 > GRID_COLS) {
      next2 = GRID_COLS;
      next1 = GRID_COLS - signedSpan;
    } else if (next2 < 0) {
      next2 = 0;
      next1 = -signedSpan;
    }
    return {
      cursor1Div: clampCursorDiv(next1),
      cursor2Div: clampCursorDiv(next2),
    };
  }

  let next2 = clamped;
  let next1 = next2 - signedSpan;
  if (next1 < 0) {
    next1 = 0;
    next2 = signedSpan;
  } else if (next1 > GRID_COLS) {
    next1 = GRID_COLS;
    next2 = GRID_COLS + signedSpan;
  }
  return {
    cursor1Div: clampCursorDiv(next1),
    cursor2Div: clampCursorDiv(next2),
  };
}

/**
 * Sets a custom distance Δx (in grid divisions, 0..10) between T1 and T2.
 * Anchors T1 where possible, or shifts T1 left if T1 + Δx exceeds GRID_COLS.
 */
export function setCursorDistanceSpan(
  desiredSpanDivs: number,
  cursor1Div: number,
  cursor2Div: number
): { cursor1Div: number; cursor2Div: number } {
  const span = clampCursorDiv(Math.max(0, desiredSpanDivs));
  const anchor = Math.min(cursor1Div, cursor2Div);
  let next1 = clampCursorDiv(anchor);
  let next2 = next1 + span;
  if (next2 > GRID_COLS) {
    next2 = GRID_COLS;
    next1 = clampCursorDiv(GRID_COLS - span);
  }
  return {
    cursor1Div: next1,
    cursor2Div: clampCursorDiv(next2),
  };
}

export function computeCursorMeasurement(
  cursor1Div: number,
  cursor2Div: number,
  secPerDiv: number,
  periodsCount = 1
): {
  deltaDivs: number;
  deltaTimeSec: number;
  periodSec: number;
  frequencyHz: number;
} {
  const deltaDivs = Math.abs(cursor2Div - cursor1Div);
  const deltaTimeSec = deltaDivs * secPerDiv;
  const safePeriods = Math.max(1, Math.round(periodsCount));
  const periodSec = deltaTimeSec > 0 ? deltaTimeSec / safePeriods : 0;
  const frequencyHz = periodSec > 0 ? 1 / periodSec : 0;
  return { deltaDivs, deltaTimeSec, periodSec, frequencyHz };
}

export const DEFAULT_FORK_DECAY_RATE = 0.12;
export const MIN_VIBRATION_STRENGTH = 0.035;

/**
 * Computes the next tuning-fork vibration amplitude (0..1) after dtSec under
 * natural exponential acoustic/internal damping: A(t + dt) = A(t) * e^(-decayRate * dt).
 */
export function computeDampedVibrationStrength(
  currentStrength: number,
  dtSec: number,
  decayRate = DEFAULT_FORK_DECAY_RATE
): number {
  if (currentStrength <= 0 || dtSec <= 0) return Math.max(0, currentStrength);
  const next = currentStrength * Math.exp(-decayRate * dtSec);
  return next < MIN_VIBRATION_STRENGTH ? 0 : next;
}


