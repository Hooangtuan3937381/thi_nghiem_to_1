import { jsPDF } from 'jspdf';
import type {
  ExperimentStatistics,
  LabApparatusState,
  MeasurementTrial,
  OscilloscopeSettings,
  ReportMetadata,
  TuningForkOption,
} from '../types/lab';
import {
  evaluateWaveformVoltage,
  formatFreqHz,
  formatPeriodMs,
  formatPeriodSec,
  formatSecPerDivLabel,
  formatVoltsPerDivLabel,
  GRID_COLS,
  GRID_ROWS,
  MUSICAL_NOTES_TABLE_10_2,
} from './physics';

// Portrait A4 at ~150 DPI (210mm x 297mm)
export const DOC_PAGE_WIDTH = 1240;
export const DOC_PAGE_HEIGHT = 1754;
export const TOTAL_REPORT_PAGES = 2;

export const REPORT_PAGE_TITLES = [
  'Trang 1: Thông tin cá nhân, Cơ sở lí thuyết & Tín hiệu đo',
  'Trang 2: Bảng số liệu 10.1, Đối chiếu Bảng 10.2 & Kết luận',
];

export interface ReportRenderPayload {
  metadata: ReportMetadata;
  trials: MeasurementTrial[];
  stats: ExperimentStatistics | null;
  fork: TuningForkOption;
  apparatus: LabApparatusState;
  scope: OscilloscopeSettings;
  capturedSnapshotUrl: string | null;
}

export function createDefaultReportMetadata(): ReportMetadata {
  const today = new Date().toISOString().slice(0, 10);
  return {
    studentName: 'Nguyễn Minh An',
    teamName: 'Tổ 1',
    className: '11A1',
    schoolName: 'THPT Chuyên Khoa học Tự nhiên',
    teacherName: 'Thầy/Cô bộ môn Vật lí',
    experimentDate: today,
    conclusion:
      'Tần số sóng âm đo được bằng dao động kí điện tử phù hợp với tần số ghi trên âm thoa chuẩn trong giới hạn sai số phép đo cho phép.',
  };
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/);
    if (words.length === 1 && words[0] === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawDocumentFrame(
  ctx: CanvasRenderingContext2D,
  pageNum: number,
  metadata: ReportMetadata
) {
  // White A4 sheet
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, DOC_PAGE_WIDTH, DOC_PAGE_HEIGHT);

  // Subtle formal top running header
  ctx.fillStyle = '#475569';
  ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `TRƯỜNG: ${metadata.schoolName.toUpperCase()}  ·  LỚP ${metadata.className}  ·  ${metadata.teamName.toUpperCase()}  ·  ${metadata.studentName.toUpperCase()}`,
    84,
    68
  );

  ctx.textAlign = 'right';
  ctx.fillText('VẬT LÍ 11 · BÀI 10', DOC_PAGE_WIDTH - 84, 68);
  ctx.textAlign = 'left';

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(84, 84);
  ctx.lineTo(DOC_PAGE_WIDTH - 84, 84);
  ctx.stroke();

  // Bottom footer
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(84, DOC_PAGE_HEIGHT - 84);
  ctx.lineTo(DOC_PAGE_WIDTH - 84, DOC_PAGE_HEIGHT - 84);
  ctx.stroke();

  ctx.fillStyle = '#64748B';
  ctx.font = '500 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `Báo cáo cá nhân: Đo tần số sóng âm — ${metadata.studentName} (${metadata.teamName}) · ${metadata.experimentDate}`,
    84,
    DOC_PAGE_HEIGHT - 48
  );

  ctx.textAlign = 'right';
  ctx.font = '600 18px "IBM Plex Mono", monospace';
  ctx.fillText(`Trang ${pageNum} / ${TOTAL_REPORT_PAGES}`, DOC_PAGE_WIDTH - 84, DOC_PAGE_HEIGHT - 48);
  ctx.textAlign = 'left';
}

function drawSectionHeading(ctx: CanvasRenderingContext2D, title: string, y: number): number {
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(title, 84, y);
  ctx.strokeStyle = '#0284C7';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(84, y + 10);
  ctx.lineTo(240, y + 10);
  ctx.stroke();
  return y + 40;
}

function drawReportPage1(
  ctx: CanvasRenderingContext2D,
  payload: ReportRenderPayload,
  snapshotImg: HTMLImageElement | null
) {
  const { metadata, fork, apparatus, scope, trials } = payload;
  drawDocumentFrame(ctx, 1, metadata);

  // Formal centered title block
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 34px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('BÁO CÁO THỰC HÀNH CÁ NHÂN · VẬT LÍ 11', DOC_PAGE_WIDTH / 2, 144);

  ctx.fillStyle = '#0284C7';
  ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('BÀI 10: THỰC HÀNH ĐO TẦN SỐ CỦA SÓNG ÂM', DOC_PAGE_WIDTH / 2, 186);
  ctx.textAlign = 'left';

  // Administrative info box
  drawRoundedRect(ctx, 84, 212, 1072, 144, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const metaRows = [
    [`Họ và tên học sinh: ${metadata.studentName}`, `Tổ: ${metadata.teamName} — Lớp: ${metadata.className}`],
    [`Trường: ${metadata.schoolName}`, `Ngày thực hành: ${metadata.experimentDate}`],
    [`Giáo viên hướng dẫn: ${metadata.teacherName}`, `Hình thức: Báo cáo cá nhân`],
  ];
  metaRows.forEach(([leftTxt, rightTxt], i) => {
    const ry = 248 + i * 38;
    ctx.fillStyle = '#1E293B';
    ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(leftTxt, 108, ry);
    if (rightTxt) {
      ctx.fillText(rightTxt, 680, ry);
    }
  });

  // Section I: Mục đích & Cơ sở lí thuyết
  let y = drawSectionHeading(ctx, 'I. MỤC ĐÍCH VÀ CƠ SỞ LÍ THUYẾT', 404);
  const sec1Lines = [
    '1. Mục đích: Xác định chu kì T và tần số f của sóng âm do âm thoa phát ra bằng dao động kí điện tử; kiểm chứng tần số ghi trên âm thoa chuẩn và đối chiếu Bảng 10.2 SGK.',
    '2. Cơ sở lí thuyết: Khi gõ búa cao su, nhánh âm thoa dao động tắt dần phát ra sóng âm truyền đến micro, chuyển thành tín hiệu điện u(t) có cùng tần số và hiển thị trên màn hình dao động kí (10 × 8 ô).',
    '3. Công thức xác định:   T = (N × SEC/DIV) / k    và    f = 1 / T   (trong đó N là số ô ngang ứng với k chu kì sóng hoàn chỉnh).',
  ];
  ctx.fillStyle = '#334155';
  ctx.font = '400 20px "Plus Jakarta Sans", sans-serif';
  sec1Lines.forEach((p) => {
    const wrapped = wrapTextLines(ctx, p, 1072);
    wrapped.forEach((ln) => {
      ctx.fillText(ln, 84, y);
      y += 30;
    });
    y += 8;
  });

  // Section II: Dụng cụ & Sơ đồ bố trí (Hình 10.4)
  y = drawSectionHeading(ctx, 'II. DỤNG CỤ VÀ BỐ TRÍ THÍ NGHIỆM (HÌNH 10.3 & 10.4)', y + 18);
  const sec2Top = y - 10;

  // Left: text list + parameters
  const toolItems = [
    '• (1) Dao động kí điện tử và dây đo BNC',
    '• (2) Micro thu sóng âm',
    '• (3) Bộ khuếch đại tín hiệu âm thanh',
    '• (4) Âm thoa chuẩn và búa cao su',
    '• (5) Giá đỡ và kẹp giữ âm thoa',
    '',
    `Thông số thiết lập thí nghiệm:`,
    `– Âm thoa khảo sát: ${fork.name}`,
    `– Khoảng cách micro – âm thoa: d = ${apparatus.distanceCm} cm`,
    `– Bộ khuếch đại: ×${apparatus.ampGain} · Dạng tín hiệu: ${scope.coupling}`,
    `– Thang đo: ${formatVoltsPerDivLabel(scope.voltsPerDiv)}/div · ${formatSecPerDivLabel(scope.secPerDiv)}/div`,
  ];
  let ty2 = y + 4;
  toolItems.forEach((item, idx) => {
    if (!item) {
      ty2 += 10;
      return;
    }
    ctx.fillStyle = idx === 6 ? '#0F172A' : '#334155';
    ctx.font = idx === 6 ? '700 20px "Plus Jakarta Sans", sans-serif' : '400 19px "Plus Jakarta Sans", sans-serif';
    const lines = wrapTextLines(ctx, item, 530);
    lines.forEach((ln) => {
      ctx.fillText(ln, 84, ty2);
      ty2 += 27;
    });
  });

  // Right: Clean Schematic Figure 10.4 on paper box
  const diagX = 636;
  const diagY = sec2Top;
  const diagW = 520;
  const diagH = 310;
  drawRoundedRect(ctx, diagX, diagY, diagW, diagH, 10);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Bench plate
  ctx.fillStyle = '#DBEAFE';
  ctx.fillRect(diagX + 24, diagY + 232, diagW - 48, 22);
  ctx.strokeStyle = '#93C5FD';
  ctx.strokeRect(diagX + 24, diagY + 232, diagW - 48, 22);

  // Stand & tuning fork
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(diagX + 46, diagY + 216, 70, 16);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(diagX + 60, diagY + 62, 8, 154);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(diagX + 60, diagY + 122, 42, 10);

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(diagX + 100, diagY + 126);
  ctx.lineTo(diagX + 100, diagY + 106);
  ctx.moveTo(diagX + 90, diagY + 60);
  ctx.lineTo(diagX + 90, diagY + 100);
  ctx.arc(diagX + 100, diagY + 100, 10, Math.PI, 0, true);
  ctx.lineTo(diagX + 110, diagY + 60);
  ctx.stroke();

  // Sound wave arcs
  ctx.strokeStyle = '#0284C7';
  ctx.lineWidth = 2;
  [1, 2, 3].forEach((r) => {
    ctx.beginPath();
    ctx.arc(diagX + 120, diagY + 80, r * 14, -0.45, 0.45);
    ctx.stroke();
  });

  // Microphone
  ctx.fillStyle = '#334155';
  ctx.fillRect(diagX + 188, diagY + 90, 9, 142);
  ctx.fillStyle = '#0F172A';
  drawRoundedRect(ctx, diagX + 181, diagY + 72, 24, 24, 5);
  ctx.fill();

  // Distance label
  ctx.fillStyle = '#0284C7';
  ctx.font = '700 16px "IBM Plex Mono", monospace';
  ctx.fillText(`d=${apparatus.distanceCm}cm`, diagX + 120, diagY + 184);

  // Wire Micro -> Amp
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(diagX + 196, diagY + 210);
  ctx.bezierCurveTo(diagX + 218, diagY + 230, diagX + 232, diagY + 230, diagX + 250, diagY + 208);
  ctx.stroke();

  // Amplifier (3)
  drawRoundedRect(ctx, diagX + 250, diagY + 168, 86, 64, 6);
  ctx.fillStyle = '#1E293B';
  ctx.fill();
  ctx.fillStyle = '#10B981';
  ctx.beginPath();
  ctx.arc(diagX + 266, diagY + 184, 4, 0, Math.PI * 2);
  ctx.fill();

  // Wire Amp -> Oscilloscope
  ctx.strokeStyle = '#0284C7';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(diagX + 336, diagY + 200);
  ctx.bezierCurveTo(diagX + 350, diagY + 220, diagX + 358, diagY + 220, diagX + 370, diagY + 202);
  ctx.stroke();

  // Oscilloscope (1)
  drawRoundedRect(ctx, diagX + 370, diagY + 102, 126, 130, 8);
  ctx.fillStyle = '#E2E8F0';
  ctx.fill();
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#0B1220';
  ctx.fillRect(diagX + 380, diagY + 114, 78, 72);
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let px = 0; px <= 74; px += 2) {
    const yy = diagY + 150 + Math.sin((px / 74) * Math.PI * 4) * 18;
    if (px === 0) ctx.moveTo(diagX + 382 + px, yy);
    else ctx.lineTo(diagX + 382 + px, yy);
  }
  ctx.stroke();

  ctx.fillStyle = '#0284C7';
  ctx.fillRect(diagX + 464, diagY + 114, 24, 72);

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('(4) Âm thoa', diagX + 46, diagY + 42);
  ctx.fillText('(2) Micro', diagX + 162, diagY + 56);
  ctx.fillText('(3) Bộ KĐ', diagX + 258, diagY + 154);
  ctx.fillText('(1) Dao động kí', diagX + 378, diagY + 90);

  ctx.fillStyle = '#475569';
  ctx.font = 'italic 17px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Hình 10.4. Sơ đồ bố trí thí nghiệm đo tần số sóng âm', diagX + diagW / 2, diagY + 290);
  ctx.textAlign = 'left';

  // Section III: Tín hiệu trên Dao động kí (Hình 10.2)
  const sec3Start = Math.max(ty2, diagY + diagH) + 34;
  const y3 = drawSectionHeading(ctx, 'III. KẾT QUẢ QUAN SÁT TÍN HIỆU TRÊN DAO ĐỘNG KÍ (HÌNH 10.2)', sec3Start);

  const gx = 84;
  const gy = y3;
  const gw = 640;
  const gh = 384;

  // Frame
  drawRoundedRect(ctx, gx - 6, gy - 6, gw + 12, gh + 44, 10);
  ctx.fillStyle = '#0F172A';
  ctx.fill();

  if (snapshotImg) {
    ctx.drawImage(snapshotImg, gx, gy, gw, gh);
  } else {
    ctx.fillStyle = '#0B1220';
    ctx.fillRect(gx, gy, gw, gh);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= GRID_COLS; c++) {
      const x = gx + (c / GRID_COLS) * gw;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x, gy + gh);
      ctx.stroke();
    }
    for (let r = 0; r <= GRID_ROWS; r++) {
      const yr = gy + (r / GRID_ROWS) * gh;
      ctx.beginPath();
      ctx.moveTo(gx, yr);
      ctx.lineTo(gx + gw, yr);
      ctx.stroke();
    }

    const totalTimeSec = GRID_COLS * scope.secPerDiv;
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let px = 0; px <= gw; px += 2) {
      const t = (px / gw) * totalTimeSec;
      const v = evaluateWaveformVoltage(t, {
        nominalFreqHz: fork.nominalFreqHz,
        distanceCm: apparatus.distanceCm,
        ampPowerOn: true,
        ampGain: apparatus.ampGain,
        cableMicroToAmpConnected: true,
        cableAmpToScopeConnected: true,
        scopePowerOn: true,
        vibrationStrength: 0.9,
        coupling: scope.coupling,
        ambientNoiseEnabled: apparatus.ambientNoiseEnabled,
      });
      const yDivs = v / scope.voltsPerDiv + scope.verticalOffsetDiv;
      const py = gy + gh / 2 - (yDivs / (GRID_ROWS / 2)) * (gh / 2);
      const clampedY = Math.max(gy + 4, Math.min(gy + gh - 4, py));
      if (px === 0) ctx.moveTo(gx + px, clampedY);
      else ctx.lineTo(gx + px, clampedY);
    }
    ctx.stroke();

    // Draw T1 & T2 cursor markers on live fallback
    if (scope.cursorsEnabled) {
      [
        { div: scope.cursor1Div, label: 'T1', color: '#38BDF8' },
        { div: scope.cursor2Div, label: 'T2', color: '#34D399' },
      ].forEach(({ div, label, color }) => {
        const cx = gx + (div / GRID_COLS) * gw;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, gy);
        ctx.lineTo(cx, gy + gh);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.fillRect(Math.min(gx + gw - 26, Math.max(gx + 2, cx - 12)), gy + 6, 24, 18);
        ctx.fillStyle = '#0B1220';
        ctx.font = '700 11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, Math.min(gx + gw - 14, Math.max(gx + 14, cx)), gy + 19);
        ctx.textAlign = 'left';
      });
    }
  }

  ctx.fillStyle = '#FACC15';
  ctx.font = '600 16px "IBM Plex Mono", monospace';
  ctx.fillText(`CH1 ${formatVoltsPerDivLabel(scope.voltsPerDiv)}/div`, gx + 10, gy + gh + 24);
  ctx.fillStyle = '#38BDF8';
  ctx.fillText(`M ${formatSecPerDivLabel(scope.secPerDiv)}/div`, gx + 230, gy + gh + 24);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(`TRIG: ${scope.triggerMode} · ${scope.coupling}`, gx + 430, gy + gh + 24);

  // Right of oscilloscope box: written calculation explanation
  const refTrial = trials[trials.length - 1];
  const sampleDivs = refTrial
    ? refTrial.divisionsCount
    : Number(Math.abs(scope.cursor2Div - scope.cursor1Div).toFixed(2)) ||
      Number((((1 / fork.nominalFreqHz) * 2) / scope.secPerDiv).toFixed(2));
  const samplePeriods = refTrial ? refTrial.periodsCount : Math.max(1, scope.cursorPeriodsCount);
  const sampleSecPerDiv = refTrial ? refTrial.secPerDiv : scope.secPerDiv;
  const sampleT = (sampleDivs * sampleSecPerDiv) / samplePeriods;
  const sampleF = 1 / sampleT;

  const rx = 754;
  drawRoundedRect(ctx, rx, gy - 6, 402, gh + 44, 10);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Cách đọc chu kì trên lưới:', rx + 22, gy + 32);

  const readLines = [
    refTrial
      ? `Số liệu trích từ Lần đo ${refTrial.trialNumber}:`
      : 'Số liệu theo con trỏ T1–T2 hiện tại:',
    `• Số chu kì quan sát: k = ${samplePeriods}`,
    `• Số ô ngang T1–T2: N = ${sampleDivs} ô`,
    `• Giá trị 1 ô: ${formatSecPerDivLabel(sampleSecPerDiv)}`,
    `• Khoảng thời gian: Δt = ${(sampleDivs * sampleSecPerDiv * 1000).toFixed(3)} ms`,
    '',
    `⇒ T = Δt / k = ${formatPeriodSec(sampleT)} s`,
    `⇒ f = 1 / T = ${formatFreqHz(sampleF)} Hz`,
  ];
  let rly = gy + 74;
  readLines.forEach((ln) => {
    if (!ln) {
      rly += 12;
      return;
    }
    const isRes = ln.startsWith('⇒');
    ctx.fillStyle = isRes ? '#0284C7' : '#334155';
    ctx.font = isRes
      ? '700 20px "IBM Plex Mono", monospace'
      : '500 18px "Plus Jakarta Sans", sans-serif';
    const w = wrapTextLines(ctx, ln, 358);
    w.forEach((wl) => {
      ctx.fillText(wl, rx + 22, rly);
      rly += 30;
    });
  });
}

function drawReportPage2(ctx: CanvasRenderingContext2D, payload: ReportRenderPayload) {
  const { metadata, trials, stats, fork } = payload;
  drawDocumentFrame(ctx, 2, metadata);

  // Section IV: Bảng kết quả 10.1 & Xử lí sai số
  let y = drawSectionHeading(ctx, 'IV. KẾT QUẢ THÍ NGHIỆM (BẢNG 10.1) VÀ XỬ LÍ SỐ LIỆU', 132);

  const tx = 84;
  const colWidths = [242, 165, 165, 165, 335];
  const rowHeights = [54, 58, 58];
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(tx, y, totalW, rowHeights[0]);

  const headers = ['Đại lượng', 'Lần 1', 'Lần 2', 'Lần 3', 'Giá trị trung bình'];
  let cx = tx;
  headers.forEach((h, i) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 19px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(h, cx + 16, y + 34);
    cx += colWidths[i];
  });

  const t1 = trials.find((t) => t.trialNumber === 1);
  const t2 = trials.find((t) => t.trialNumber === 2);
  const t3 = trials.find((t) => t.trialNumber === 3);

  const tableRows = [
    [
      'Chu kì T (s)',
      t1 ? formatPeriodSec(t1.periodSec) : '—',
      t2 ? formatPeriodSec(t2.periodSec) : '—',
      t3 ? formatPeriodSec(t3.periodSec) : '—',
      stats
        ? `${formatPeriodSec(stats.meanPeriodSec)} ± ${stats.randomErrorPeriodSec.toFixed(5)}`
        : '—',
    ],
    [
      'Tần số f (Hz)',
      t1 ? formatFreqHz(t1.frequencyHz) : '—',
      t2 ? formatFreqHz(t2.frequencyHz) : '—',
      t3 ? formatFreqHz(t3.frequencyHz) : '—',
      stats ? `${formatFreqHz(stats.meanFreqHz)} ± ${stats.randomErrorFreqHz.toFixed(1)}` : '—',
    ],
  ];

  tableRows.forEach((row, rIdx) => {
    const ry = y + rowHeights[0] + rIdx * rowHeights[1];
    ctx.fillStyle = rIdx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    ctx.fillRect(tx, ry, totalW, rowHeights[1]);

    let rx = tx;
    row.forEach((cell, cIdx) => {
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx, ry, colWidths[cIdx], rowHeights[1]);
      ctx.fillStyle = cIdx === 0 ? '#0F172A' : cIdx === 4 ? '#0284C7' : '#1E293B';
      ctx.font =
        cIdx === 0
          ? '700 19px "Plus Jakarta Sans", sans-serif'
          : '600 19px "IBM Plex Mono", monospace';
      ctx.fillText(cell, rx + 16, ry + 36);
      rx += colWidths[cIdx];
    });
  });

  y += rowHeights[0] + rowHeights[1] * 2 + 24;

  // Error summary & processing box
  drawRoundedRect(ctx, 84, y, 1072, 190, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const summaryLines = stats
    ? [
        `• Giá trị trung bình chu kì: T_tb = (T₁ + T₂ + T₃)/3 = ${formatPeriodSec(stats.meanPeriodSec)} s (${formatPeriodMs(stats.meanPeriodSec)}).`,
        `• Sai số ngẫu nhiên chu kì: ΔT = ± ${stats.randomErrorPeriodSec.toFixed(5)} s  ⇒  T = ${formatPeriodSec(stats.meanPeriodSec)} ± ${stats.randomErrorPeriodSec.toFixed(5)} (s).`,
        `• Giá trị trung bình tần số: f_tb = ${formatFreqHz(stats.meanFreqHz)} Hz, sai số Δf = ± ${stats.randomErrorFreqHz.toFixed(2)} Hz (δf = ${stats.relativeErrorPct.toFixed(2)}%).`,
        `• So sánh với tần số ghi trên âm thoa chuẩn (${fork.nominalFreqHz} Hz): độ lệch ${stats.errorVsNominalPct.toFixed(2)}%.`,
      ]
    : [
        '• Chưa có đủ số liệu đo được ghi vào Bảng 10.1 (hãy ghi các lần đo ở tab Thí nghiệm).',
        `• Âm thoa chuẩn đang chọn có tần số danh định f₀ = ${fork.nominalFreqHz} Hz (${fork.noteLabel}).`,
        '• Công thức xử lí: T_tb = (T₁ + T₂ + T₃)/3 ;  ΔT = (|T₁ - T_tb| + |T₂ - T_tb| + |T₃ - T_tb|)/3.',
        '• Công thức tính tần số trung bình và sai số: f_tb = 1 / T_tb ;  δf = Δf / f_tb × 100%.',
      ];

  let sy = y + 36;
  ctx.fillStyle = '#1E293B';
  ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
  summaryLines.forEach((ln) => {
    const w = wrapTextLines(ctx, ln, 1024);
    w.forEach((wl) => {
      ctx.fillText(wl, 108, sy);
      sy += 28;
    });
    sy += 6;
  });

  y += 234;

  // Section V: Đối chiếu Bảng 10.2 (Tần số các nốt nhạc cơ bản)
  y = drawSectionHeading(ctx, 'V. ĐỐI CHIẾU BẢNG 10.2 — TẦN SỐ CÁC NỐT NHẠC CƠ BẢN', y);

  const noteTableX = 84;
  const noteTableCols = [210, 145, 225];
  const noteTableW = noteTableCols.reduce((a, b) => a + b, 0);
  const noteHeaderH = 44;
  const noteRowH = 46;

  ctx.fillStyle = '#0F172A';
  ctx.fillRect(noteTableX, y, noteTableW, noteHeaderH);
  ['Nốt nhạc (Kí hiệu)', 'Tần số (Hz)', 'Đối chiếu phép đo'].forEach((h, idx) => {
    const offset = noteTableCols.slice(0, idx).reduce((a, b) => a + b, 0);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(h, noteTableX + offset + 14, y + 29);
  });

  const targetNoteFreq = stats ? stats.closestNote.freqHz : fork.nominalFreqHz;
  MUSICAL_NOTES_TABLE_10_2.forEach((entry, rIdx) => {
    const ry = y + noteHeaderH + rIdx * noteRowH;
    const isMatch = entry.freqHz === targetNoteFreq;
    ctx.fillStyle = isMatch ? '#E0F2FE' : rIdx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
    ctx.fillRect(noteTableX, ry, noteTableW, noteRowH);

    const rowCells = [
      `${entry.note} (${entry.symbol})`,
      `${entry.freqHz}`,
      isMatch
        ? stats
          ? `Gần nhất (Δ = ${stats.noteDiffHz.toFixed(1)} Hz)`
          : 'Âm thoa đang chọn'
        : '—',
    ];
    let cellX = noteTableX;
    rowCells.forEach((cellTxt, cIdx) => {
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cellX, ry, noteTableCols[cIdx], noteRowH);
      ctx.fillStyle = isMatch ? '#0369A1' : '#1E293B';
      ctx.font = isMatch
        ? '700 17px "Plus Jakarta Sans", sans-serif'
        : cIdx === 1
        ? '600 17px "IBM Plex Mono", monospace'
        : '500 17px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(cellTxt, cellX + 14, ry + 30);
      cellX += noteTableCols[cIdx];
    });
  });

  // Right card next to Table 10.2: Personal analysis summary
  const noteCardX = noteTableX + noteTableW + 28;
  const noteCardW = 1072 - noteTableW - 28;
  const noteCardH = noteHeaderH + MUSICAL_NOTES_TABLE_10_2.length * noteRowH;
  drawRoundedRect(ctx, noteCardX, y, noteCardW, noteCardH, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = '700 19px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Nhận xét đối chiếu âm chuẩn:', noteCardX + 22, y + 36);

  const noteCardLines = stats
    ? [
        `• Âm thoa tham chiếu: ${fork.name}.`,
        `• Kết quả đo trung bình: f_tb = ${formatFreqHz(stats.meanFreqHz)} Hz.`,
        `• Đối chiếu Bảng 10.2: gần nhất với nốt ${stats.closestNote.note} (${stats.closestNote.symbol}) — ${stats.closestNote.freqHz} Hz.`,
        `• Sai lệch so với nốt chuẩn: ${stats.noteDiffHz.toFixed(2)} Hz (${((stats.noteDiffHz / stats.closestNote.freqHz) * 100).toFixed(2)}%).`,
        '• Nhận xét: Tín hiệu qua micro và bộ khuếch đại giữ đúng tần số âm thoa.',
      ]
    : [
        `• Âm thoa đang chọn: ${fork.name} (tần số danh định ${fork.nominalFreqHz} Hz).`,
        '• Bảng 10.2 cung cấp tần số các nốt nhạc cơ bản trong một quãng tám để đối chiếu kết quả đo.',
        '• Sau khi ghi đủ 3 lần đo vào Bảng 10.1, hệ thống sẽ tự động tính độ lệch so với nốt gần nhất.',
      ];

  let ncy = y + 72;
  ctx.fillStyle = '#334155';
  ctx.font = '400 18px "Plus Jakarta Sans", sans-serif';
  noteCardLines.forEach((ln) => {
    const wrapped = wrapTextLines(ctx, ln, noteCardW - 44);
    wrapped.forEach((wl) => {
      ctx.fillText(wl, noteCardX + 22, ncy);
      ncy += 26;
    });
    ncy += 6;
  });

  y += noteCardH + 46;

  // Section VI: Kết luận & Chữ ký cá nhân
  y = drawSectionHeading(ctx, 'VI. KẾT LUẬN THÍ NGHIỆM', y);

  drawRoundedRect(ctx, 84, y, 1072, 134, 8);
  ctx.fillStyle = '#F8FAFC';
  ctx.fill();
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#1E293B';
  ctx.font = '400 20px "Plus Jakarta Sans", sans-serif';
  const conclLines = wrapTextLines(ctx, metadata.conclusion, 1024).slice(0, 4);
  let cy = y + 36;
  conclLines.forEach((ln) => {
    ctx.fillText(ln, 108, cy);
    cy += 30;
  });

  // Signature block pinned cleanly above footer
  const sigY = Math.max(y + 188, 1440);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 19px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('XÁC NHẬN CỦA GIÁO VIÊN HƯỚNG DẪN', 310, sigY);
  ctx.fillText('HỌC SINH LÀM BÁO CÁO', 930, sigY);

  ctx.fillStyle = '#64748B';
  ctx.font = 'italic 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('(Kí và ghi rõ họ tên)', 310, sigY + 28);
  ctx.fillText(`(${metadata.studentName} — ${metadata.teamName}, Lớp ${metadata.className})`, 930, sigY + 28);
  ctx.textAlign = 'left';
}

function loadImageAsync(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function renderReportPageToCanvas(
  canvas: HTMLCanvasElement,
  pageIndex: number,
  payload: ReportRenderPayload
): Promise<void> {
  canvas.width = DOC_PAGE_WIDTH;
  canvas.height = DOC_PAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const snapshotImg =
    pageIndex === 0 && payload.capturedSnapshotUrl
      ? await loadImageAsync(payload.capturedSnapshotUrl)
      : null;

  if (pageIndex === 0) {
    drawReportPage1(ctx, payload, snapshotImg);
  } else {
    drawReportPage2(ctx, payload);
  }
}

export async function exportWrittenReportPdf(payload: ReportRenderPayload): Promise<string> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidthMm = doc.internal.pageSize.getWidth();
  const pageHeightMm = doc.internal.pageSize.getHeight();
  const offscreen = document.createElement('canvas');

  for (let i = 0; i < TOTAL_REPORT_PAGES; i++) {
    await renderReportPageToCanvas(offscreen, i, payload);
    const imgData = offscreen.toDataURL('image/png');
    if (i > 0) {
      doc.addPage('a4', 'portrait');
    }
    doc.addImage(imgData, 'PNG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');
  }

  const normalizePart = (raw: string) =>
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_|_$/g, '');

  const safeStudent = normalizePart(payload.metadata.studentName);
  const safeTeam = normalizePart(payload.metadata.teamName);
  const filename = `Bao_cao_ca_nhan_Bai_10_${safeStudent || 'Hoc_sinh'}_${safeTeam || 'To'}.pdf`;

  doc.save(filename);
  return filename;
}
