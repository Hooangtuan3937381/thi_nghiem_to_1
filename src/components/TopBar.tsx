import type { AppTab } from '../types/lab';

interface TopBarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onQuickExportPdf: () => void;
  trialsCount: number;
  isExporting: boolean;
}

export function TopBar({
  activeTab,
  onSelectTab,
  onQuickExportPdf,
  trialsCount,
  isExporting,
}: TopBarProps) {
  const navItems: Array<{ id: AppTab; label: string }> = [
    { id: 'lab', label: 'Thí nghiệm' },
    { id: 'data', label: `Bảng số liệu (${trialsCount}/3)` },
    { id: 'report', label: 'Báo cáo thực hành' },
    { id: 'theory', label: 'Hướng dẫn SGK' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 md:gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('lab')}
          className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:text-sky-700 transition-colors cursor-pointer"
        >
          Vật Lí 11 · Bài 10
        </button>

        {/* Zone 2: Clean single-line text nav links */}
        <nav
          aria-label="Điều hướng chính"
          className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-2 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? 'border-sky-600 text-sky-700 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={onQuickExportPdf}
            disabled={isExporting}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isExporting ? 'Đang xuất PDF...' : 'Xuất báo cáo PDF'}
          </button>
        </div>
      </div>
    </header>
  );
}
