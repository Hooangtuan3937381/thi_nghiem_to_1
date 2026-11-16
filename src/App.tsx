import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type {
  AppTab,
  LabApparatusState,
  MeasurementTrial,
  OscilloscopeSettings,
  ReportMetadata,
} from './types/lab';
import {
  computeDampedVibrationStrength,
  computeExperimentStatistics,
  SEC_PER_DIV_OPTIONS,
  TUNING_FORKS,
} from './utils/physics';
import {
  createDefaultReportMetadata,
  exportWrittenReportPdf,
} from './utils/pdfReportGenerator';
import { soundEngine } from './utils/soundEngine';
import { TopBar } from './components/TopBar';
import { LabBench3D } from './components/LabBench3D';
import { OscilloscopePanel } from './components/OscilloscopePanel';
import { MeasurementRecorder } from './components/MeasurementRecorder';
import { DataTableView } from './components/DataTableView';
import { LabReportDocumentStudio } from './components/LabReportDocumentStudio';
import { TheoryGuideView } from './components/TheoryGuideView';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('lab');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [capturedSnapshotUrl, setCapturedSnapshotUrl] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const [apparatus, setApparatus] = useState<LabApparatusState>({
    selectedForkId: 'fork-440',
    distanceCm: 20,
    ampPowerOn: true,
    ampGain: 5,
    ambientNoiseEnabled: false,
    cableMicroToAmpConnected: true,
    cableAmpToScopeConnected: true,
    isVibrating: true,
    vibrationStrength: 1.0,
    strikeTimestamp: Date.now(),
    continuousMode: false,
  });

  const [scope, setScope] = useState<OscilloscopeSettings>({
    powerOn: true,
    coupling: 'AC',
    triggerMode: 'Auto',
    runState: 'RUN',
    voltsPerDiv: 1.0,
    secPerDiv: 0.0005, // 500 µs/div -> ideal for 440 Hz (T = 2.27 ms -> ~4.55 div/period)
    verticalOffsetDiv: 0,
    cursorsEnabled: true,
    cursor1Div: 1.0,
    cursor2Div: 5.55,
    cursorLocked: false,
    cursorPeriodsCount: 1,
  });

  const [trials, setTrials] = useState<MeasurementTrial[]>([]);
  const [metadata, setMetadata] = useState<ReportMetadata>(() =>
    createDefaultReportMetadata()
  );

  const selectedFork = useMemo(
    () => TUNING_FORKS.find((f) => f.id === apparatus.selectedForkId) ?? TUNING_FORKS[0],
    [apparatus.selectedForkId]
  );

  const stats = useMemo(
    () => computeExperimentStatistics(trials, selectedFork.nominalFreqHz),
    [trials, selectedFork.nominalFreqHz]
  );

  // Natural exponential amplitude decay when continuousMode is disabled
  useEffect(() => {
    if (apparatus.continuousMode || !apparatus.isVibrating) return;

    const timer = window.setInterval(() => {
      setApparatus((prev) => {
        if (prev.continuousMode || !prev.isVibrating) return prev;
        const nextStrength = computeDampedVibrationStrength(prev.vibrationStrength, 0.08);
        if (nextStrength <= 0) {
          return { ...prev, isVibrating: false, vibrationStrength: 0 };
        }
        return { ...prev, vibrationStrength: nextStrength };
      });
    }, 80);

    return () => window.clearInterval(timer);
  }, [apparatus.continuousMode, apparatus.isVibrating]);

  // Stop audio on unmount
  useEffect(() => {
    return () => soundEngine.stop();
  }, []);

  // Auto-clear status banner after 5s
  useEffect(() => {
    if (!statusBanner) return;
    const t = window.setTimeout(() => setStatusBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [statusBanner]);

  const showNotice = (msg: string) => {
    setStatusBanner(msg);
  };

  const handleStrikeHammer = () => {
    setApparatus((prev) => ({
      ...prev,
      isVibrating: true,
      vibrationStrength: 1.0,
      strikeTimestamp: Date.now(),
    }));
    setScope((prev) => (prev.runState === 'STOP' ? { ...prev, runState: 'RUN' } : prev));

    if (soundEnabled) {
      soundEngine.playTuningFork(
        selectedFork.nominalFreqHz,
        0.22,
        5.5,
        apparatus.continuousMode
      );
    }
  };

  const handleSelectFork = (forkId: string) => {
    const fork = TUNING_FORKS.find((f) => f.id === forkId);
    if (!fork) return;
    setApparatus((prev) => ({
      ...prev,
      selectedForkId: forkId,
      isVibrating: true,
      vibrationStrength: 0.9,
      strikeTimestamp: Date.now(),
    }));
    if (soundEnabled) {
      soundEngine.playTuningFork(fork.nominalFreqHz, 0.2, 2.8, apparatus.continuousMode);
    }
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next && apparatus.isVibrating) {
      soundEngine.playTuningFork(
        selectedFork.nominalFreqHz,
        0.2,
        3.2,
        apparatus.continuousMode
      );
    } else {
      soundEngine.stop();
    }
  };

  const handleAutoScaleScope = () => {
    // Pick SEC/DIV so ~2 periods span 4 to 8 horizontal divisions
    const periodSec = 1 / selectedFork.nominalFreqHz;
    const targetTotalTime = periodSec * 2.5;
    const idealSecPerDiv = targetTotalTime / 10;
    const bestSec =
      SEC_PER_DIV_OPTIONS.find((opt) => opt.value >= idealSecPerDiv) ??
      SEC_PER_DIV_OPTIONS[1];

    const onePeriodDivs = periodSec / bestSec.value;
    setScope((prev) => ({
      ...prev,
      powerOn: true,
      coupling: 'AC',
      triggerMode: 'Auto',
      secPerDiv: bestSec.value,
      voltsPerDiv: 1.0,
      verticalOffsetDiv: 0,
      cursorsEnabled: true,
      cursorLocked: false,
      cursorPeriodsCount: 2,
      cursor1Div: 1.0,
      cursor2Div: Number(Math.min(9.5, 1.0 + onePeriodDivs * 2).toFixed(2)),
    }));
    showNotice('Đã tự động căn chuẩn Trigger Auto, AC và thang đo dao động kí.');
  };

  const handleRecordTrial = (trial: MeasurementTrial) => {
    setTrials((prev) => {
      const filtered = prev.filter((t) => t.trialNumber !== trial.trialNumber);
      return [...filtered, trial].sort((a, b) => a.trialNumber - b.trialNumber);
    });
    showNotice(
      `Đã ghi nhận Lần đo ${trial.trialNumber}: T = ${trial.periodSec.toFixed(5)} s, f = ${trial.frequencyHz.toFixed(1)} Hz.`
    );
  };

  const handleDeleteTrial = (trialNumber: 1 | 2 | 3) => {
    setTrials((prev) => prev.filter((t) => t.trialNumber !== trialNumber));
  };

  const handleSelectNoteFreq = (freqHz: number) => {
    const matchingFork = TUNING_FORKS.find((f) => f.nominalFreqHz === freqHz);
    if (matchingFork) {
      handleSelectFork(matchingFork.id);
    }
    setActiveTab('lab');
  };

  const handleQuickExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const filename = await exportWrittenReportPdf({
        metadata,
        trials,
        stats,
        fork: selectedFork,
        apparatus,
        scope,
        capturedSnapshotUrl,
      });
      showNotice(`Đã xuất bản báo cáo thực hành PDF (khổ A4): ${filename}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const hardwareChainReady =
    scope.powerOn &&
    apparatus.ampPowerOn &&
    apparatus.cableMicroToAmpConnected &&
    apparatus.cableAmpToScopeConnected;

  const isSignalPresent =
    hardwareChainReady &&
    ((apparatus.isVibrating && apparatus.vibrationStrength > 0.035) || scope.runState === 'STOP');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onQuickExportPdf={handleQuickExportPdf}
        trialsCount={trials.length}
        isExporting={isExportingPdf}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {statusBanner && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-medium px-4 py-2.5 rounded-lg flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusBanner}</span>
          </div>
        )}

        {activeTab === 'lab' && (
          <div className="space-y-5">
            <LabBench3D
              apparatus={apparatus}
              scope={scope}
              soundEnabled={soundEnabled}
              selectedFork={selectedFork}
              onSelectFork={handleSelectFork}
              onStrikeHammer={handleStrikeHammer}
              onToggleRunState={() =>
                setScope((prev) => ({
                  ...prev,
                  runState: prev.runState === 'RUN' ? 'STOP' : 'RUN',
                }))
              }
              onChangeDistance={(cm) =>
                setApparatus((prev) => ({ ...prev, distanceCm: cm }))
              }
              onToggleAmpPower={() =>
                setApparatus((prev) => ({ ...prev, ampPowerOn: !prev.ampPowerOn }))
              }
              onChangeAmpGain={(gain) =>
                setApparatus((prev) => ({ ...prev, ampGain: gain }))
              }
              onToggleMicroCable={() =>
                setApparatus((prev) => ({
                  ...prev,
                  cableMicroToAmpConnected: !prev.cableMicroToAmpConnected,
                }))
              }
              onToggleScopeCable={() =>
                setApparatus((prev) => ({
                  ...prev,
                  cableAmpToScopeConnected: !prev.cableAmpToScopeConnected,
                }))
              }
              onToggleAmbientNoise={() =>
                setApparatus((prev) => ({
                  ...prev,
                  ambientNoiseEnabled: !prev.ambientNoiseEnabled,
                }))
              }
              onToggleContinuousMode={() =>
                setApparatus((prev) => ({
                  ...prev,
                  continuousMode: !prev.continuousMode,
                  isVibrating: !prev.continuousMode ? true : prev.isVibrating,
                  vibrationStrength: !prev.continuousMode ? 0.9 : prev.vibrationStrength,
                }))
              }
              onToggleSound={handleToggleSound}
              onConnectAll={() => {
                setApparatus((prev) => ({
                  ...prev,
                  ampPowerOn: true,
                  cableMicroToAmpConnected: true,
                  cableAmpToScopeConnected: true,
                  isVibrating: true,
                  vibrationStrength: 0.95,
                }));
                setScope((prev) => ({ ...prev, powerOn: true }));
                showNotice('Đã nối đầy đủ dây đo và bật nguồn bộ khuếch đại + dao động kí.');
              }}
            />

            <OscilloscopePanel
              scope={scope}
              apparatus={apparatus}
              selectedFork={selectedFork}
              onUpdateScope={(patch) => setScope((prev) => ({ ...prev, ...patch }))}
              onStrikeHammer={handleStrikeHammer}
              onAutoScale={handleAutoScaleScope}
              onCaptureSnapshot={(url) => {
                setCapturedSnapshotUrl(url);
                showNotice('Đã lưu ảnh màn hình dao động kí vào Mục III của Báo cáo văn bản.');
              }}
              hasCapturedSnapshot={Boolean(capturedSnapshotUrl)}
            />

            <MeasurementRecorder
              scope={scope}
              selectedFork={selectedFork}
              distanceCm={apparatus.distanceCm}
              isSignalPresent={isSignalPresent}
              trials={trials}
              onRecordTrial={handleRecordTrial}
              onClearTrials={() => setTrials([])}
              onGoToReport={() => setActiveTab('report')}
            />
          </div>
        )}

        {activeTab === 'data' && (
          <DataTableView
            trials={trials}
            stats={stats}
            selectedFork={selectedFork}
            onClearTrials={() => setTrials([])}
            onDeleteTrial={handleDeleteTrial}
            onSelectNoteFreq={handleSelectNoteFreq}
            onGoToReport={() => setActiveTab('report')}
          />
        )}

        {activeTab === 'report' && (
          <LabReportDocumentStudio
            metadata={metadata}
            onUpdateMetadata={(patch) =>
              setMetadata((prev) => ({ ...prev, ...patch }))
            }
            trials={trials}
            stats={stats}
            fork={selectedFork}
            apparatus={apparatus}
            scope={scope}
            capturedSnapshotUrl={capturedSnapshotUrl}
          />
        )}

        {activeTab === 'theory' && (
          <TheoryGuideView onStartExperiment={() => setActiveTab('lab')} />
        )}
      </main>
    </div>
  );
}
