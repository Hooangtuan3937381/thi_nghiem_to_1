import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, Printer } from 'lucide-react';
import type {
  ExperimentStatistics,
  LabApparatusState,
  MeasurementTrial,
  OscilloscopeSettings,
  ReportMetadata,
  TuningForkOption,
} from '../types/lab';
import {
  exportWrittenReportPdf,
  renderReportPageToCanvas,
  REPORT_PAGE_TITLES,
  TOTAL_REPORT_PAGES,
} from '../utils/pdfReportGenerator';

interface LabReportDocumentStudioProps {
  metadata: ReportMetadata;
  onUpdateMetadata: (patch: Partial<ReportMetadata>) => void;
  trials: MeasurementTrial[];
  stats: ExperimentStatistics | null;
  fork: TuningForkOption;
  apparatus: LabApparatusState;
  scope: OscilloscopeSettings;
  capturedSnapshotUrl: string | null;
}

export function LabReportDocumentStudio({
  metadata,
  onUpdateMetadata,
  trials,
  stats,
  fork,
  apparatus,
  scope,
  capturedSnapshotUrl,
}: LabReportDocumentStudioProps) {
  const [activePage, setActivePage] = useState(0);
  const [viewMode, setViewMode] = useState<'single' | 'all'>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const page1CanvasRef = useRef<HTMLCanvasElement | null>(null);
  const page2CanvasRef = useRef<HTMLCanvasElement | null>(null);

  const payload = {
    metadata,
    trials,
    stats,
    fork,
    apparatus,
    scope,
    capturedSnapshotUrl,
  };

  useEffect(() => {
    if (viewMode === 'all' || activePage === 0) {
      if (page1CanvasRef.current) {
        void renderReportPageToCanvas(page1CanvasRef.current, 0, payload);
      }
    }
    if (viewMode === 'all' || activePage === 1) {
      if (page2CanvasRef.current) {
        void renderReportPageToCanvas(page2CanvasRef.current, 1, payload);
      }
    }
  }, [viewMode, activePage, metadata, trials, stats, fork, apparatus, scope, capturedSnapshotUrl]);

  const handleExportPdf = async () => {
    if (
      !metadata.studentName.trim() ||
      !metadata.teamName.trim() ||
      !metadata.className.trim()
    ) {
      setFormError('Vui lòng nhập Họ và tên học sinh, Tổ và Lớp trước khi xuất bản báo cáo PDF.');
      return;
    }
    setFormError(null);
    setIsExporting(true);
    setExportStatus(null);
    try {
      const filename = await exportWrittenReportPdf(payload);
      setExportStatus(`Đã xuất bản thành công báo cáo cá nhân khổ A4 (2 trang): ${filename}`);
    } catch {
      setFormError('Không thể tạo tệp PDF. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header action bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Báo cáo thực hành cá nhân (Khổ A4 · 2 trang)
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Điền thông tin cá nhân, tổ thực hành và kết luận thí nghiệm, kiểm tra trực tiếp văn bản A4 và tải xuống tệp PDF hoàn chỉnh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            In văn bản
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Đang tạo tệp PDF...' : 'Xuất bản báo cáo PDF (A4)'}
          </button>
        </div>
      </div>

      {formError && (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium px-4 py-3 rounded-lg">
          {formError}
        </div>
      )}

      {exportStatus && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium px-4 py-3 rounded-lg flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{exportStatus}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Personal & Team Metadata + Conclusion Editor */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2.5">
            Thông tin cá nhân &amp; Nội dung báo cáo
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="report-student-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Họ và tên học sinh
              </label>
              <input
                id="report-student-name"
                type="text"
                value={metadata.studentName}
                onChange={(e) => onUpdateMetadata({ studentName: e.target.value })}
                placeholder="VD: Nguyễn Minh An"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label htmlFor="report-team-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Tổ thực hành
              </label>
              <input
                id="report-team-name"
                type="text"
                value={metadata.teamName}
                onChange={(e) => onUpdateMetadata({ teamName: e.target.value })}
                placeholder="VD: Tổ 1"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="report-class" className="block text-xs font-semibold text-slate-700 mb-1">
                Lớp
              </label>
              <input
                id="report-class"
                type="text"
                value={metadata.className}
                onChange={(e) => onUpdateMetadata({ className: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label htmlFor="report-date" className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày thực hành
              </label>
              <input
                id="report-date"
                type="date"
                value={metadata.experimentDate}
                onChange={(e) => onUpdateMetadata({ experimentDate: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="report-school" className="block text-xs font-semibold text-slate-700 mb-1">
                Trường
              </label>
              <input
                id="report-school"
                type="text"
                value={metadata.schoolName}
                onChange={(e) => onUpdateMetadata({ schoolName: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div>
              <label htmlFor="report-teacher" className="block text-xs font-semibold text-slate-700 mb-1">
                Giáo viên hướng dẫn
              </label>
              <input
                id="report-teacher"
                type="text"
                value={metadata.teacherName}
                onChange={(e) => onUpdateMetadata({ teacherName: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div>
              <label htmlFor="report-conclusion" className="block text-xs font-semibold text-slate-700 mb-1">
                Kết luận thí nghiệm (Mục VI)
              </label>
              <textarea
                id="report-conclusion"
                rows={5}
                value={metadata.conclusion}
                onChange={(e) => onUpdateMetadata({ conclusion: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs text-slate-600 space-y-1.5">
              <div className="font-semibold text-slate-800">
                Tóm tắt số liệu tự động đồng bộ vào báo cáo:
              </div>
              <div>
                • Âm thoa khảo sát: <span className="font-semibold text-slate-900">{fork.name}</span> · Khoảng cách d ={' '}
                <span className="font-mono font-semibold text-slate-900">{apparatus.distanceCm} cm</span>
              </div>
              <div>
                • Số lần đo đã ghi (Bảng 10.1):{' '}
                <span className="font-mono font-semibold text-sky-700">{trials.length}/3 lần đo</span>
              </div>
              {stats && (
                <div>
                  • Tần số trung bình:{' '}
                  <span className="font-mono font-semibold text-emerald-700">
                    {stats.meanFreqHz.toFixed(1)} ± {stats.randomErrorFreqHz.toFixed(1)} Hz
                  </span>{' '}
                  (gần nốt {stats.closestNote.note})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: A4 Portrait Written Report Preview */}
        <div className="lg:col-span-7 bg-slate-100 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Xem trước văn bản báo cáo (A4 · {TOTAL_REPORT_PAGES} trang)
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    viewMode === 'all'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cả 2 trang
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('single')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    viewMode === 'single'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Từng trang
                </button>
              </div>

              {viewMode === 'single' && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActivePage((p) => Math.max(0, p - 1))}
                    disabled={activePage === 0}
                    aria-label="Trang trước"
                    className="p-1.5 border border-slate-300 bg-white rounded-md hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono font-semibold text-slate-700 tabular-nums px-1">
                    {activePage + 1} / {TOTAL_REPORT_PAGES}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePage((p) => Math.min(TOTAL_REPORT_PAGES - 1, p + 1))}
                    disabled={activePage === TOTAL_REPORT_PAGES - 1}
                    aria-label="Trang tiếp theo"
                    className="p-1.5 border border-slate-300 bg-white rounded-md hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Paper Sheet Container */}
          <div
            id="print-report-container"
            className="space-y-5 max-h-[960px] overflow-y-auto pr-1"
          >
            {(viewMode === 'all' || activePage === 0) && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-600 px-1">
                  {REPORT_PAGE_TITLES[0]}
                </div>
                <div className="bg-white border border-slate-300 rounded-md overflow-hidden shadow-sm">
                  <canvas
                    ref={page1CanvasRef}
                    data-testid="report-page-1-canvas"
                    className="w-full h-auto block aspect-[1240/1754]"
                  />
                </div>
              </div>
            )}

            {(viewMode === 'all' || activePage === 1) && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-600 px-1">
                  {REPORT_PAGE_TITLES[1]}
                </div>
                <div className="bg-white border border-slate-300 rounded-md overflow-hidden shadow-sm">
                  <canvas
                    ref={page2CanvasRef}
                    data-testid="report-page-2-canvas"
                    className="w-full h-auto block aspect-[1240/1754]"
                  />
                </div>
              </div>
            )}
          </div>

          {trials.length < 3 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3.5 py-2.5">
              Lưu ý: Bạn hiện có {trials.length}/3 lần đo trong Bảng 10.1. Bạn vẫn có thể xem trước hoặc xuất PDF ngay, hoặc quay lại tab <strong>Thí nghiệm</strong> để ghi đủ 3 lần đo cho báo cáo hoàn chỉnh.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
