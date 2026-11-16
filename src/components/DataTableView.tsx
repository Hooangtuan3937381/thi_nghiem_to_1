import { Music, Trash2, FileText } from 'lucide-react';
import type { ExperimentStatistics, MeasurementTrial, TuningForkOption } from '../types/lab';
import {
  formatFreqHz,
  formatPeriodMs,
  formatPeriodSec,
  formatSecPerDivLabel,
  MUSICAL_NOTES_TABLE_10_2,
} from '../utils/physics';
import { soundEngine } from '../utils/soundEngine';

interface DataTableViewProps {
  trials: MeasurementTrial[];
  stats: ExperimentStatistics | null;
  selectedFork: TuningForkOption;
  onClearTrials: () => void;
  onDeleteTrial: (trialNumber: 1 | 2 | 3) => void;
  onSelectNoteFreq: (freqHz: number) => void;
  onGoToReport: () => void;
}

export function DataTableView({
  trials,
  stats,
  selectedFork,
  onClearTrials,
  onDeleteTrial,
  onSelectNoteFreq,
  onGoToReport,
}: DataTableViewProps) {
  const t1 = trials.find((t) => t.trialNumber === 1);
  const t2 = trials.find((t) => t.trialNumber === 2);
  const t3 = trials.find((t) => t.trialNumber === 3);

  return (
    <div className="space-y-6">
      {/* Bảng 10.1 Card */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              4. Kết quả thí nghiệm — Bảng 10.1
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Âm thoa đang khảo sát: <strong className="text-slate-900">{selectedFork.name}</strong> (Tần số ghi trên âm thoa{' '}
              <span className="font-mono font-semibold text-sky-700">f₀ = {selectedFork.nominalFreqHz} Hz</span>)
            </p>
          </div>

          <div className="flex items-center gap-2">
            {trials.length > 0 && (
              <button
                type="button"
                onClick={onClearTrials}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Làm mới bảng
              </button>
            )}
            <button
              type="button"
              onClick={onGoToReport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Đưa vào Báo cáo PDF
            </button>
          </div>
        </div>

        {/* Exact Textbook Table 10.1 */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs sm:text-sm">
                <th className="py-3 px-4 font-semibold border-r border-slate-700" rowSpan={2}>
                  Đại lượng
                </th>
                <th className="py-2 px-4 font-semibold text-center border-b border-r border-slate-700" colSpan={3}>
                  Lần đo
                </th>
                <th className="py-3 px-4 font-semibold text-center" rowSpan={2}>
                  Giá trị trung bình
                </th>
              </tr>
              <tr className="bg-slate-800 text-slate-200 text-xs">
                <th className="py-2 px-4 font-semibold text-center border-r border-slate-700">Lần 1</th>
                <th className="py-2 px-4 font-semibold text-center border-r border-slate-700">Lần 2</th>
                <th className="py-2 px-4 font-semibold text-center border-r border-slate-700">Lần 3</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              <tr className="bg-white">
                <td className="py-3.5 px-4 font-semibold text-slate-900 border-r border-slate-200">
                  Chu kì T (s)
                </td>
                {[t1, t2, t3].map((tr, i) => (
                  <td
                    key={i}
                    className="py-3.5 px-4 text-center font-mono tabular-nums text-slate-800 border-r border-slate-200"
                  >
                    {tr ? formatPeriodSec(tr.periodSec) : '—'}
                  </td>
                ))}
                <td className="py-3.5 px-4 text-center font-mono font-bold tabular-nums text-sky-700">
                  {stats ? `${formatPeriodSec(stats.meanPeriodSec)} ± ${stats.randomErrorPeriodSec.toFixed(5)}` : '—'}
                </td>
              </tr>

              <tr className="bg-slate-50/70">
                <td className="py-3.5 px-4 font-semibold text-slate-900 border-r border-slate-200">
                  Tần số f (Hz)
                </td>
                {[t1, t2, t3].map((tr, i) => (
                  <td
                    key={i}
                    className="py-3.5 px-4 text-center font-mono tabular-nums text-slate-800 border-r border-slate-200"
                  >
                    {tr ? formatFreqHz(tr.frequencyHz) : '—'}
                  </td>
                ))}
                <td className="py-3.5 px-4 text-center font-mono font-bold tabular-nums text-emerald-700">
                  {stats ? `${formatFreqHz(stats.meanFreqHz)} ± ${stats.randomErrorFreqHz.toFixed(1)}` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Detailed Trial Log */}
        {trials.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">
                Chi tiết thông số đọc trên dao động kí
              </h3>
              <div className="space-y-2">
                {trials
                  .slice()
                  .sort((a, b) => a.trialNumber - b.trialNumber)
                  .map((tr) => (
                    <div
                      key={tr.trialNumber}
                      className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-md px-3 py-2 text-xs font-mono tabular-nums"
                    >
                      <span className="font-sans font-semibold text-slate-900">
                        Lần {tr.trialNumber}
                      </span>
                      <span className="text-slate-600">
                        N = {tr.divisionsCount} ô / {tr.periodsCount} chu kì · SEC/DIV ={' '}
                        {formatSecPerDivLabel(tr.secPerDiv)}
                      </span>
                      <span className="text-sky-700 font-semibold">
                        f = {formatFreqHz(tr.frequencyHz)} Hz
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteTrial(tr.trialNumber)}
                        aria-label={`Xóa lần đo ${tr.trialNumber}`}
                        className="text-rose-600 hover:text-rose-800 font-sans font-medium cursor-pointer"
                      >
                        Xóa
                      </button>
                    </div>
                  ))}
              </div>
            </div>

            {/* Error Calculation Summary */}
            {stats && (
              <div className="lg:col-span-5 bg-slate-900 text-slate-100 rounded-lg p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-white">
                  Xử lí kết quả &amp; Sai số phép đo
                </h3>
                <div className="space-y-1.5 text-xs font-mono tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Chu kì trung bình T̄:</span>
                    <span className="text-white font-semibold">
                      {formatPeriodSec(stats.meanPeriodSec)} s ({formatPeriodMs(stats.meanPeriodSec)})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sai số ngẫu nhiên ΔT:</span>
                    <span className="text-sky-300">± {stats.randomErrorPeriodSec.toFixed(5)} s</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800">
                    <span className="text-slate-400">Tần số trung bình f̄:</span>
                    <span className="text-amber-300 font-bold">{formatFreqHz(stats.meanFreqHz)} Hz</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sai số tuyệt đối Δf:</span>
                    <span className="text-sky-300">± {stats.randomErrorFreqHz.toFixed(2)} Hz</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Sai số tỉ đối δf:</span>
                    <span className="text-emerald-300">{stats.relativeErrorPct.toFixed(2)} %</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800">
                    <span className="text-slate-400">So với f₀ ({selectedFork.nominalFreqHz} Hz):</span>
                    <span className="text-white">
                      Lệch {stats.errorVsNominalPct.toFixed(2)} % (Gần nốt {stats.closestNote.note})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-600">
            Chưa có lần đo nào được ghi nhận. Hãy quay lại tab <strong>Thí nghiệm</strong>, gõ búa cao su và nhấn{' '}
            <strong>Ghi Lần 1 / 2 / 3</strong> để hoàn thiện Bảng 10.1.
          </div>
        )}
      </section>

      {/* Bảng 10.2: Tần số các nốt nhạc cơ bản */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="pb-3 mb-4 border-b border-slate-100">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            Em có biết — Bảng 10.2: Tần số các nốt nhạc cơ bản
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Nhấn nghe thử hoặc nạp nhanh tần số tương ứng vào bộ mô phỏng để đối chiếu với âm thoa.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {MUSICAL_NOTES_TABLE_10_2.map((item) => {
            const isClosest = stats && stats.closestNote.symbol === item.symbol;
            return (
              <div
                key={item.symbol}
                className={`border rounded-lg p-3 flex flex-col justify-between gap-2 ${
                  isClosest ? 'bg-sky-50 border-sky-300' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {item.note} ({item.symbol})
                  </div>
                  <div className="text-lg font-mono font-bold text-sky-700 tabular-nums">
                    {item.freqHz} Hz
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => soundEngine.playTuningFork(item.freqHz, 0.2, 1.2, false)}
                    className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded cursor-pointer"
                  >
                    <Music className="w-3 h-3" />
                    Nghe thử
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectNoteFreq(item.freqHz)}
                    className="px-2 py-1 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded cursor-pointer"
                  >
                    Đo nốt này
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
