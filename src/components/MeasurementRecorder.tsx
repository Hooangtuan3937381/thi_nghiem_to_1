import { useState } from 'react';
import { CheckCircle2, ClipboardCheck, Crosshair, FileText, Trash2 } from 'lucide-react';
import type { MeasurementTrial, OscilloscopeSettings, TuningForkOption } from '../types/lab';
import {
  computeMeasurementFromDivisions,
  formatFreqHz,
  formatPeriodMs,
  formatPeriodSec,
  formatSecPerDivLabel,
  suggestDivisionsForIdealWave,
} from '../utils/physics';

interface MeasurementRecorderProps {
  scope: OscilloscopeSettings;
  selectedFork: TuningForkOption;
  distanceCm: number;
  isSignalPresent: boolean;
  trials: MeasurementTrial[];
  onRecordTrial: (trial: MeasurementTrial) => void;
  onClearTrials: () => void;
  onGoToReport: () => void;
}

export function MeasurementRecorder({
  scope,
  selectedFork,
  distanceCm,
  isSignalPresent,
  trials,
  onRecordTrial,
  onClearTrials,
  onGoToReport,
}: MeasurementRecorderProps) {
  const [periodsCount, setPeriodsCount] = useState<number>(2);
  const [divisionsCount, setDivisionsCount] = useState<number>(() =>
    suggestDivisionsForIdealWave(selectedFork.nominalFreqHz, scope.secPerDiv, 2)
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const nextTrialNum = (trials.length < 3 ? trials.length + 1 : 3) as 1 | 2 | 3;
  const cursorSpanDivs = Math.abs(scope.cursor2Div - scope.cursor1Div);

  const previewResult = (() => {
    try {
      if (divisionsCount <= 0 || periodsCount <= 0) return null;
      return computeMeasurementFromDivisions(divisionsCount, periodsCount, scope.secPerDiv);
    } catch {
      return null;
    }
  })();

  const handleUseCursors = () => {
    setValidationError(null);
    if (cursorSpanDivs <= 0.05) {
      setValidationError('Hãy kéo hoặc nhập hai thước đo T1 và T2 cách nhau ít nhất 0.1 ô trên màn hình.');
      return;
    }
    setDivisionsCount(Number(cursorSpanDivs.toFixed(2)));
    setPeriodsCount(Math.max(1, scope.cursorPeriodsCount));
  };

  const handleReadGridForCurrentFork = () => {
    setValidationError(null);
    const ideal = suggestDivisionsForIdealWave(
      selectedFork.nominalFreqHz,
      scope.secPerDiv,
      periodsCount
    );
    // Simulate realistic slight human reading variance (+/- 0.04 div)
    const offset = ((trials.length % 3) - 1) * 0.03;
    setDivisionsCount(Number(Math.max(0.2, ideal + offset).toFixed(2)));
  };

  const handleRecord = (targetNum: 1 | 2 | 3) => {
    if (!isSignalPresent) {
      setValidationError(
        'Chưa có tín hiệu sóng âm ổn định trên dao động kí. Hãy gõ búa cao su và kiểm tra kết nối dây đo.'
      );
      return;
    }
    if (divisionsCount <= 0 || periodsCount <= 0 || Number.isNaN(divisionsCount)) {
      setValidationError('Số ô ngang (N) và số chu kì (k) phải lớn hơn 0.');
      return;
    }
    setValidationError(null);
    const { periodSec, frequencyHz } = computeMeasurementFromDivisions(
      divisionsCount,
      periodsCount,
      scope.secPerDiv
    );

    onRecordTrial({
      trialNumber: targetNum,
      nominalFreqHz: selectedFork.nominalFreqHz,
      forkName: selectedFork.name,
      divisionsCount,
      periodsCount,
      secPerDiv: scope.secPerDiv,
      voltsPerDiv: scope.voltsPerDiv,
      distanceCm,
      periodSec,
      frequencyHz,
      recordedAt: new Date().toLocaleTimeString('vi-VN'),
    });
  };

  return (
    <section
      aria-label="Ghi nhận kết quả đo vào Bảng 10.1"
      className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Đọc chu kì trên lưới &amp; Ghi nhận vào Bảng 10.1
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Đếm số ô ngang N ứng với k chu kì sóng hoàn chỉnh trên màn hình dao động kí (1 ô ={' '}
            <span className="font-mono font-semibold text-sky-700">
              {formatSecPerDivLabel(scope.secPerDiv)}
            </span>
            ).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {trials.length > 0 && (
            <button
              type="button"
              onClick={onClearTrials}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Xóa dữ liệu đo
            </button>
          )}
          {trials.length >= 3 && (
            <button
              type="button"
              onClick={onGoToReport}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Hoàn tất đo · Mở Báo cáo văn bản
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Input & Formula side */}
        <div className="lg:col-span-7 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="periods-input" className="block text-xs font-semibold text-slate-700 mb-1">
                Số chu kì quan sát (k)
              </label>
              <input
                id="periods-input"
                type="number"
                min={1}
                max={10}
                step={1}
                value={periodsCount}
                onChange={(e) => setPeriodsCount(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-2 text-sm font-mono font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label htmlFor="divisions-input" className="block text-xs font-semibold text-slate-700 mb-1">
                Số ô ngang đo được (N ô)
              </label>
              <input
                id="divisions-input"
                type="number"
                min={0.1}
                max={10}
                step={0.01}
                value={divisionsCount}
                onChange={(e) => setDivisionsCount(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="use-cursors-btn"
              onClick={handleUseCursors}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-md transition-colors cursor-pointer"
            >
              <Crosshair className="w-3.5 h-3.5" />
              Lấy từ con trỏ Δt ({cursorSpanDivs.toFixed(2)} ô · k = {scope.cursorPeriodsCount} chu kì)
            </button>

            <button
              type="button"
              onClick={handleReadGridForCurrentFork}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
            >
              Đọc số ô chuẩn theo lưới
            </button>
          </div>

          {validationError && (
            <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {validationError}
            </p>
          )}

          {/* Live Calculated Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Chu kì tính được T = (N × SEC/DIV) / k
              </span>
              <div className="text-lg font-mono font-bold text-slate-900 tabular-nums">
                {previewResult
                  ? `${formatPeriodSec(previewResult.periodSec)} s (${formatPeriodMs(previewResult.periodSec)})`
                  : '—'}
              </div>
            </div>
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Tần số f = 1 / T
              </span>
              <div className="text-lg font-mono font-bold text-sky-700 tabular-nums">
                {previewResult ? `${formatFreqHz(previewResult.frequencyHz)} Hz` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: 3 Trial Slot Buttons */}
        <div className="lg:col-span-5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Ghi vào các lần đo (Bảng 10.1)
            </span>
            <span className="text-xs font-mono text-slate-500">{trials.length}/3 lần đã ghi</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {([1, 2, 3] as const).map((num) => {
              const existing = trials.find((t) => t.trialNumber === num);
              return (
                <div
                  key={num}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border ${
                    existing
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : num === nextTrialNum
                      ? 'bg-sky-50/60 border-sky-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      {existing && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      <span>Lần đo {num}</span>
                    </div>
                    <div className="text-xs font-mono text-slate-600 tabular-nums truncate">
                      {existing
                        ? `T = ${formatPeriodSec(existing.periodSec)} s · f = ${formatFreqHz(existing.frequencyHz)} Hz`
                        : 'Chưa có số liệu'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRecord(num)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      existing
                        ? 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                        : 'bg-sky-600 text-white hover:bg-sky-700'
                    }`}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    {existing ? `Ghi đè Lần ${num}` : `Ghi Lần ${num}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
