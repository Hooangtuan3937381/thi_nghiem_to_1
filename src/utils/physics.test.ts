import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCursorMeasurement,
  computeDampedVibrationStrength,
  computeExperimentStatistics,
  computeMeasurementFromDivisions,
  computeSignalPeakVolts,
  evaluateWaveformVoltage,
  findClosestMusicalNote,
  moveCursorWithOptionalLock,
  setCursorDistanceSpan,
  suggestDivisionsForIdealWave,
} from './physics';
import type { MeasurementTrial } from '../types/lab';

test('computeMeasurementFromDivisions computes accurate T and f for 440 Hz tuning fork', () => {
  // At 0.5 ms/div, 2 periods of 440 Hz (T = 2.2727 ms) span 9.09 divisions
  const { periodSec, frequencyHz } = computeMeasurementFromDivisions(9.09, 2, 0.0005);
  assert.ok(Math.abs(periodSec - 0.0022725) < 1e-6);
  assert.ok(Math.abs(frequencyHz - 440) < 0.2);
});

test('computeMeasurementFromDivisions rejects non-positive inputs', () => {
  assert.throws(() => computeMeasurementFromDivisions(0, 1, 0.001));
  assert.throws(() => computeMeasurementFromDivisions(4, 0, 0.001));
  assert.throws(() => computeMeasurementFromDivisions(4, 1, -0.001));
});

test('computeSignalPeakVolts returns 0 when cables or power are disconnected', () => {
  const base = {
    nominalFreqHz: 440,
    distanceCm: 20,
    ampPowerOn: true,
    ampGain: 5,
    cableMicroToAmpConnected: true,
    cableAmpToScopeConnected: true,
    scopePowerOn: true,
    vibrationStrength: 1,
    coupling: 'AC' as const,
    ambientNoiseEnabled: false,
  };

  assert.ok(computeSignalPeakVolts(base) > 1.0);
  assert.equal(computeSignalPeakVolts({ ...base, scopePowerOn: false }), 0);
  assert.equal(computeSignalPeakVolts({ ...base, ampPowerOn: false }), 0);
  assert.equal(computeSignalPeakVolts({ ...base, cableMicroToAmpConnected: false }), 0);
  assert.equal(computeSignalPeakVolts({ ...base, cableAmpToScopeConnected: false }), 0);
});

test('computeSignalPeakVolts attenuates with distance', () => {
  const near = computeSignalPeakVolts({
    nominalFreqHz: 440,
    distanceCm: 15,
    ampPowerOn: true,
    ampGain: 4,
    cableMicroToAmpConnected: true,
    cableAmpToScopeConnected: true,
    scopePowerOn: true,
    vibrationStrength: 1,
    coupling: 'AC',
    ambientNoiseEnabled: false,
  });
  const far = computeSignalPeakVolts({
    nominalFreqHz: 440,
    distanceCm: 40,
    ampPowerOn: true,
    ampGain: 4,
    cableMicroToAmpConnected: true,
    cableAmpToScopeConnected: true,
    scopePowerOn: true,
    vibrationStrength: 1,
    coupling: 'AC',
    ambientNoiseEnabled: false,
  });
  assert.ok(near > far);
});

test('DC coupling adds positive DC offset while AC coupling centers at 0 V', () => {
  const acVal = evaluateWaveformVoltage(0, {
    nominalFreqHz: 440,
    distanceCm: 20,
    ampPowerOn: true,
    ampGain: 5,
    cableMicroToAmpConnected: true,
    cableAmpToScopeConnected: true,
    scopePowerOn: true,
    vibrationStrength: 1,
    coupling: 'AC',
    ambientNoiseEnabled: false,
  });
  const dcVal = evaluateWaveformVoltage(0, {
    nominalFreqHz: 440,
    distanceCm: 20,
    ampPowerOn: true,
    ampGain: 5,
    cableMicroToAmpConnected: true,
    cableAmpToScopeConnected: true,
    scopePowerOn: true,
    vibrationStrength: 1,
    coupling: 'DC',
    ambientNoiseEnabled: false,
  });
  assert.ok(Math.abs(acVal) < 1e-6);
  assert.ok(dcVal > 0.5);
});

test('computeExperimentStatistics computes mean and errors across 3 trials', () => {
  const trials: MeasurementTrial[] = [
    {
      trialNumber: 1,
      nominalFreqHz: 440,
      forkName: 'Âm thoa chuẩn La',
      divisionsCount: 4.54,
      periodsCount: 2,
      secPerDiv: 0.001,
      voltsPerDiv: 0.5,
      distanceCm: 20,
      periodSec: 0.00227,
      frequencyHz: 440.53,
      recordedAt: '10:00:00',
    },
    {
      trialNumber: 2,
      nominalFreqHz: 440,
      forkName: 'Âm thoa chuẩn La',
      divisionsCount: 4.56,
      periodsCount: 2,
      secPerDiv: 0.001,
      voltsPerDiv: 0.5,
      distanceCm: 20,
      periodSec: 0.00228,
      frequencyHz: 438.6,
      recordedAt: '10:01:00',
    },
    {
      trialNumber: 3,
      nominalFreqHz: 440,
      forkName: 'Âm thoa chuẩn La',
      divisionsCount: 4.55,
      periodsCount: 2,
      secPerDiv: 0.001,
      voltsPerDiv: 0.5,
      distanceCm: 20,
      periodSec: 0.002275,
      frequencyHz: 439.56,
      recordedAt: '10:02:00',
    },
  ];

  const stats = computeExperimentStatistics(trials, 440);
  assert.ok(stats !== null);
  assert.equal(stats.count, 3);
  assert.ok(Math.abs(stats.meanPeriodSec - 0.002275) < 1e-6);
  assert.ok(Math.abs(stats.meanFreqHz - 439.5633) < 0.05);
  assert.ok(stats.randomErrorFreqHz > 0);
  assert.ok(stats.relativeErrorPct < 1.0);
  assert.equal(stats.closestNote.symbol, 'A');
});

test('findClosestMusicalNote matches Table 10.2 notes accurately', () => {
  assert.equal(findClosestMusicalNote(261.5).note.note, 'Đô');
  assert.equal(findClosestMusicalNote(329.8).note.note, 'Mi');
  assert.equal(findClosestMusicalNote(441.2).note.note, 'La');
});

test('suggestDivisionsForIdealWave returns expected horizontal divisions', () => {
  // 250 Hz -> T = 4 ms. At 1 ms/div, 2 periods = 8.00 divs
  assert.equal(suggestDivisionsForIdealWave(250, 0.001, 2), 8);
});

test('moveCursorWithOptionalLock preserves span when locked and clamps to 0..10', () => {
  const unlocked = moveCursorWithOptionalLock('T1', 2.5, 1.0, 5.5, false);
  assert.deepEqual(unlocked, { cursor1Div: 2.5, cursor2Div: 5.5 });

  const locked = moveCursorWithOptionalLock('T1', 3.0, 1.0, 5.5, true);
  assert.deepEqual(locked, { cursor1Div: 3.0, cursor2Div: 7.5 });

  const clampedAtRight = moveCursorWithOptionalLock('T1', 8.0, 1.0, 5.5, true);
  assert.deepEqual(clampedAtRight, { cursor1Div: 5.5, cursor2Div: 10 });
});

test('setCursorDistanceSpan updates T2 from T1 or shifts T1 at right edge', () => {
  const normal = setCursorDistanceSpan(4.5, 1.2, 3.0);
  assert.deepEqual(normal, { cursor1Div: 1.2, cursor2Div: 5.7 });

  const shifted = setCursorDistanceSpan(6.0, 7.0, 8.0);
  assert.deepEqual(shifted, { cursor1Div: 4.0, cursor2Div: 10 });
});

test('computeCursorMeasurement supports multi-period k division between T1 and T2', () => {
  // 9.09 divs over 2 periods at 500 us/div => T = 2.2725 ms, f = 440.04 Hz
  const res = computeCursorMeasurement(0.5, 9.59, 0.0005, 2);
  assert.ok(Math.abs(res.deltaDivs - 9.09) < 1e-6);
  assert.ok(Math.abs(res.periodSec - 0.0022725) < 1e-6);
  assert.ok(Math.abs(res.frequencyHz - 440.04) < 0.2);
});

test('computeDampedVibrationStrength decays exponentially over time and stops at 0', () => {
  const s1 = computeDampedVibrationStrength(1.0, 1.0);
  const s2 = computeDampedVibrationStrength(s1, 1.0);
  assert.ok(s1 < 1.0 && s1 > 0.7);
  assert.ok(s2 < s1 && s2 > 0.5);

  const faded = computeDampedVibrationStrength(0.04, 2.0);
  assert.equal(faded, 0);
});


