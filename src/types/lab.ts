export type CouplingMode = 'AC' | 'DC';
export type TriggerMode = 'Auto' | 'Normal';
export type RunState = 'RUN' | 'STOP';
export type AppTab = 'lab' | 'data' | 'report' | 'theory';

export interface TuningForkOption {
  id: string;
  name: string;
  nominalFreqHz: number;
  noteLabel: string;
  description: string;
}

export interface MusicalNoteEntry {
  note: string;
  symbol: string;
  freqHz: number;
}

export interface OscilloscopeSettings {
  powerOn: boolean;
  coupling: CouplingMode;
  triggerMode: TriggerMode;
  runState: RunState;
  voltsPerDiv: number; // Volts per vertical division
  secPerDiv: number; // Seconds per horizontal division
  verticalOffsetDiv: number; // Vertical shift in divisions (-3 to +3)
  cursorsEnabled: boolean;
  cursor1Div: number; // 0 to 10 (grid has 10 horizontal divs)
  cursor2Div: number; // 0 to 10
  cursorLocked: boolean; // lock Δx distance when moving either cursor
  cursorPeriodsCount: number; // number of wave periods spanned between T1 and T2
}

export interface LabApparatusState {
  selectedForkId: string;
  distanceCm: number; // 5 to 50 cm, textbook default 20 cm
  ampPowerOn: boolean;
  ampGain: number; // 1 to 10
  ambientNoiseEnabled: boolean;
  cableMicroToAmpConnected: boolean;
  cableAmpToScopeConnected: boolean;
  isVibrating: boolean;
  vibrationStrength: number; // 0 to 1 decaying over time after strike
  strikeTimestamp: number;
  continuousMode: boolean; // keep fork sustained for steady classroom measurement
}

export interface MeasurementTrial {
  trialNumber: 1 | 2 | 3;
  nominalFreqHz: number;
  forkName: string;
  divisionsCount: number; // N horizontal divisions measured
  periodsCount: number; // k periods spanning N divisions
  secPerDiv: number;
  voltsPerDiv: number;
  distanceCm: number;
  periodSec: number;
  frequencyHz: number;
  recordedAt: string;
}

export interface ExperimentStatistics {
  count: number;
  meanPeriodSec: number;
  randomErrorPeriodSec: number;
  meanFreqHz: number;
  randomErrorFreqHz: number;
  relativeErrorPct: number;
  errorVsNominalPct: number;
  closestNote: MusicalNoteEntry;
  noteDiffHz: number;
}

export interface ReportMetadata {
  studentName: string;
  teamName: string;
  className: string;
  schoolName: string;
  teacherName: string;
  experimentDate: string;
  conclusion: string;
}

