import { useEffect, useRef, useState } from 'react';
import { Camera, Crosshair, Hammer, Lock, Pause, Play, Power, RotateCcw, Sparkles, Unlock } from 'lucide-react';
import type { LabApparatusState, OscilloscopeSettings, TuningForkOption } from '../types/lab';
import {
  clampCursorDiv,
  computeCursorMeasurement,
  computeSignalPeakVolts,
  evaluateWaveformVoltage,
  formatFreqHz,
  formatPeriodMs,
  formatPeriodSec,
  formatSecPerDivLabel,
  formatVoltsPerDivLabel,
  GRID_COLS,
  GRID_ROWS,
  moveCursorWithOptionalLock,
  SEC_PER_DIV_OPTIONS,
  setCursorDistanceSpan,
  VOLTS_PER_DIV_OPTIONS,
} from '../utils/physics';

interface OscilloscopePanelProps {
  scope: OscilloscopeSettings;
  apparatus: LabApparatusState;
  selectedFork: TuningForkOption;
  onUpdateScope: (patch: Partial<OscilloscopeSettings>) => void;
  onStrikeHammer: () => void;
  onAutoScale: () => void;
  onCaptureSnapshot: (dataUrl: string) => void;
  hasCapturedSnapshot: boolean;
}

export function OscilloscopePanel({
  scope,
  apparatus,
  selectedFork,
  onUpdateScope,
  onStrikeHammer,
  onAutoScale,
  onCaptureSnapshot,
  hasCapturedSnapshot,
}: OscilloscopePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<number>(0);
  const draggingCursorRef = useRef<'T1' | 'T2' | null>(null);
  const frozenStrengthRef = useRef<number>(
    apparatus.isVibrating ? apparatus.vibrationStrength : 0
  );
  const [hoveredCursor, setHoveredCursor] = useState<'T1' | 'T2' | null>(null);
  const [activeDragCursor, setActiveDragCursor] = useState<'T1' | 'T2' | null>(null);

  if (scope.runState === 'RUN') {
    frozenStrengthRef.current = apparatus.isVibrating ? apparatus.vibrationStrength : 0;
  }

  // Store latest state in ref so animation loop doesn't tear down
  const stateRef = useRef({ scope, apparatus, selectedFork });
  stateRef.current = { scope, apparatus, selectedFork };

  const needsContinuousLoop =
    scope.powerOn && scope.runState === 'RUN' && scope.triggerMode === 'Normal';

  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const drawFrame = (now: number, scheduleNext: boolean) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const { scope: sc, apparatus: app, selectedFork: fk } = stateRef.current;
          const width = canvas.width;
          const height = canvas.height;

          // Clear screen
          ctx.fillStyle = sc.powerOn ? '#0B1220' : '#060911';
          ctx.fillRect(0, 0, width, height);

          if (sc.powerOn) {
            // Draw 10x8 grid matching Hình 10.2
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
            ctx.lineWidth = 1;
            for (let c = 0; c <= GRID_COLS; c++) {
              const x = (c / GRID_COLS) * width;
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.lineTo(x, height);
              ctx.stroke();
            }
            for (let r = 0; r <= GRID_ROWS; r++) {
              const y = (r / GRID_ROWS) * height;
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(width, y);
              ctx.stroke();
            }

            // Center axes with fine 0.2-div tick marks
            const midX = width / 2;
            const midY = height / 2;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, midY);
            ctx.lineTo(width, midY);
            ctx.moveTo(midX, 0);
            ctx.lineTo(midX, height);
            ctx.stroke();

            // Sub-ticks along center axes
            for (let i = 0; i <= GRID_COLS * 5; i++) {
              const tx = (i / (GRID_COLS * 5)) * width;
              ctx.beginPath();
              ctx.moveTo(tx, midY - 4);
              ctx.lineTo(tx, midY + 4);
              ctx.stroke();
            }
            for (let j = 0; j <= GRID_ROWS * 5; j++) {
              const ty = (j / (GRID_ROWS * 5)) * height;
              ctx.beginPath();
              ctx.moveTo(midX - 4, ty);
              ctx.lineTo(midX + 4, ty);
              ctx.stroke();
            }

            // In Auto trigger mode, waveform locks cleanly like a real triggered oscilloscope!
            if (sc.runState === 'RUN') {
              if (sc.triggerMode === 'Normal') {
                phaseRef.current += dt * 4.5;
              } else {
                phaseRef.current = 0;
              }
            }

            const totalTimeSec = GRID_COLS * sc.secPerDiv;
            const effectiveStrength =
              sc.runState === 'STOP'
                ? frozenStrengthRef.current
                : app.isVibrating
                ? app.vibrationStrength
                : 0;
            const signalParams = {
              nominalFreqHz: fk.nominalFreqHz,
              distanceCm: app.distanceCm,
              ampPowerOn: app.ampPowerOn,
              ampGain: app.ampGain,
              cableMicroToAmpConnected: app.cableMicroToAmpConnected,
              cableAmpToScopeConnected: app.cableAmpToScopeConnected,
              scopePowerOn: sc.powerOn,
              vibrationStrength: effectiveStrength,
              coupling: sc.coupling,
              ambientNoiseEnabled: app.ambientNoiseEnabled,
            };

            // Draw crisp CH1 yellow sine trace with fast two-pass phosphor glow (Hình 10.2)
            ctx.beginPath();
            for (let px = 0; px <= width; px += 2) {
              const t = (px / width) * totalTimeSec;
              const v = evaluateWaveformVoltage(t, signalParams, phaseRef.current);
              const yDivs = v / sc.voltsPerDiv + sc.verticalOffsetDiv;
              const py = midY - (yDivs / (GRID_ROWS / 2)) * (height / 2);
              const clampedY = Math.max(3, Math.min(height - 3, py));
              if (px === 0) ctx.moveTo(px, clampedY);
              else ctx.lineTo(px, clampedY);
            }
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.25)';
            ctx.lineWidth = 6;
            ctx.stroke();

            ctx.strokeStyle = '#FACC15';
            ctx.lineWidth = 2.4;
            ctx.stroke();

            // Measurement cursors T1 & T2 with interactive caliper guides
            if (sc.cursorsEnabled) {
              const x1 = (sc.cursor1Div / GRID_COLS) * width;
              const x2 = (sc.cursor2Div / GRID_COLS) * width;
              const leftX = Math.min(x1, x2);
              const rightX = Math.max(x1, x2);
              const spanW = rightX - leftX;

              // Shaded measurement zone between T1 and T2
              ctx.fillStyle = sc.cursorLocked
                ? 'rgba(251, 191, 36, 0.11)'
                : 'rgba(56, 189, 248, 0.13)';
              ctx.fillRect(leftX, 0, spanW, height);

              // Horizontal caliper dimension arrow near bottom
              if (spanW > 18) {
                const arrowY = height - 22;
                ctx.strokeStyle = sc.cursorLocked ? '#FBBF24' : '#7DD3FC';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(leftX + 3, arrowY);
                ctx.lineTo(rightX - 3, arrowY);
                ctx.stroke();

                // Arrowheads
                ctx.fillStyle = sc.cursorLocked ? '#FBBF24' : '#7DD3FC';
                ctx.beginPath();
                ctx.moveTo(leftX + 2, arrowY);
                ctx.lineTo(leftX + 9, arrowY - 4);
                ctx.lineTo(leftX + 9, arrowY + 4);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(rightX - 2, arrowY);
                ctx.lineTo(rightX - 9, arrowY - 4);
                ctx.lineTo(rightX - 9, arrowY + 4);
                ctx.closePath();
                ctx.fill();

                const spanLabel = `Δx = ${Math.abs(sc.cursor2Div - sc.cursor1Div).toFixed(2)} ô`;
                ctx.font = '700 11px "IBM Plex Mono", monospace';
                const labelW = ctx.measureText(spanLabel).width + 14;
                if (spanW > labelW + 24) {
                  const midSpanX = (leftX + rightX) / 2;
                  ctx.fillStyle = 'rgba(11, 18, 32, 0.92)';
                  ctx.fillRect(midSpanX - labelW / 2, arrowY - 10, labelW, 20);
                  ctx.strokeStyle = sc.cursorLocked ? 'rgba(251,191,36,0.7)' : 'rgba(125,211,252,0.7)';
                  ctx.lineWidth = 1;
                  ctx.strokeRect(midSpanX - labelW / 2, arrowY - 10, labelW, 20);
                  ctx.fillStyle = sc.cursorLocked ? '#FDE68A' : '#E0F2FE';
                  ctx.textAlign = 'center';
                  ctx.fillText(spanLabel, midSpanX, arrowY + 4);
                  ctx.textAlign = 'left';
                }
              }

              [
                { key: 'T1' as const, x: x1, label: 'T1', color: '#38BDF8' },
                { key: 'T2' as const, x: x2, label: 'T2', color: '#34D399' },
              ].forEach(({ key, x, label, color }) => {
                const isActive = activeDragCursor === key || hoveredCursor === key;
                ctx.strokeStyle = color;
                ctx.lineWidth = isActive ? 2.5 : 1.75;
                ctx.setLineDash(isActive ? [] : [5, 4]);
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
                ctx.setLineDash([]);

                // Top handle badge
                const badgeX = Math.min(width - 30, Math.max(2, x - 14));
                ctx.fillStyle = color;
                ctx.fillRect(badgeX, 6, 28, 19);
                ctx.fillStyle = '#0B1220';
                ctx.font = '700 11px "IBM Plex Mono", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(label, badgeX + 14, 19);
                ctx.textAlign = 'left';

                // Bottom caliper grab triangle
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(x, height - 10);
                ctx.lineTo(x - 6, height);
                ctx.lineTo(x + 6, height);
                ctx.closePath();
                ctx.fill();
              });
            }

            // Ground / Vertical Offset indicator on left edge
            const offsetPx = midY - (sc.verticalOffsetDiv / (GRID_ROWS / 2)) * (height / 2);
            ctx.fillStyle = '#FACC15';
            ctx.beginPath();
            ctx.moveTo(0, offsetPx - 5);
            ctx.lineTo(9, offsetPx);
            ctx.lineTo(0, offsetPx + 5);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillStyle = '#475569';
            ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Dao động kí đang tắt nguồn (Nhấn nút Nguồn để bật)', width / 2, height / 2);
            ctx.textAlign = 'left';
          }
        }
      }

      if (scheduleNext) {
        rafId = window.requestAnimationFrame((t) => {
          if (t - lastTime >= 32) {
            drawFrame(t, true);
          } else {
            rafId = window.requestAnimationFrame((t2) => drawFrame(t2, true));
          }
        });
      }
    };

    drawFrame(performance.now(), needsContinuousLoop);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [needsContinuousLoop, scope, apparatus, selectedFork, hoveredCursor, activeDragCursor]);

  const { deltaDivs, deltaTimeSec, periodSec, frequencyHz } = computeCursorMeasurement(
    scope.cursor1Div,
    scope.cursor2Div,
    scope.secPerDiv,
    scope.cursorPeriodsCount
  );

  const clientXToDiv = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    return clampCursorDiv(ratio * GRID_COLS);
  };

  const clientXToCanvasPx = (clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return ((clientX - rect.left) / rect.width) * canvas.width;
  };

  const findNearestCursor = (canvasPx: number, maxDistPx = 18): 'T1' | 'T2' | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const sc = stateRef.current.scope;
    const x1 = (sc.cursor1Div / GRID_COLS) * canvas.width;
    const x2 = (sc.cursor2Div / GRID_COLS) * canvas.width;
    const d1 = Math.abs(canvasPx - x1);
    const d2 = Math.abs(canvasPx - x2);
    if (Math.min(d1, d2) > maxDistPx) return null;
    return d1 <= d2 ? 'T1' : 'T2';
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sc = stateRef.current.scope;
    if (!sc.powerOn || !sc.cursorsEnabled) return;
    const px = clientXToCanvasPx(e.clientX);
    // Grab nearest handle within 24px, or snap nearest cursor if clicking anywhere on the screen
    const picked = findNearestCursor(px, 24) ?? findNearestCursor(px, Infinity);
    if (!picked) return;
    draggingCursorRef.current = picked;
    setActiveDragCursor(picked);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointerId capture support
    }

    const nextDiv = clientXToDiv(e.clientX);
    const updated = moveCursorWithOptionalLock(
      picked,
      nextDiv,
      sc.cursor1Div,
      sc.cursor2Div,
      sc.cursorLocked
    );
    onUpdateScope(updated);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const sc = stateRef.current.scope;
    if (!sc.powerOn || !sc.cursorsEnabled) {
      if (hoveredCursor) setHoveredCursor(null);
      return;
    }

    if (draggingCursorRef.current) {
      const nextDiv = clientXToDiv(e.clientX);
      const updated = moveCursorWithOptionalLock(
        draggingCursorRef.current,
        nextDiv,
        sc.cursor1Div,
        sc.cursor2Div,
        sc.cursorLocked
      );
      onUpdateScope(updated);
      return;
    }

    const px = clientXToCanvasPx(e.clientX);
    const near = findNearestCursor(px, 16);
    if (near !== hoveredCursor) {
      setHoveredCursor(near);
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingCursorRef.current) {
      draggingCursorRef.current = null;
      setActiveDragCursor(null);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const handleMoveCursor = (which: 'T1' | 'T2', rawVal: number) => {
    if (Number.isNaN(rawVal)) return;
    const updated = moveCursorWithOptionalLock(
      which,
      rawVal,
      scope.cursor1Div,
      scope.cursor2Div,
      scope.cursorLocked
    );
    onUpdateScope(updated);
  };

  const handleSetCustomSpan = (rawSpan: number) => {
    if (Number.isNaN(rawSpan)) return;
    const updated = setCursorDistanceSpan(rawSpan, scope.cursor1Div, scope.cursor2Div);
    onUpdateScope(updated);
  };

  const handleQuickAlignPeriods = (periods: number) => {
    const onePeriodDivs = 1 / selectedFork.nominalFreqHz / scope.secPerDiv;
    const targetSpan = Math.min(9.5, onePeriodDivs * periods);
    const start1 = Number(Math.min(1.0, Math.max(0.2, (GRID_COLS - targetSpan) / 2)).toFixed(2));
    const end2 = Number(Math.min(GRID_COLS, start1 + targetSpan).toFixed(2));
    onUpdateScope({
      cursorsEnabled: true,
      cursorLocked: false,
      cursorPeriodsCount: periods,
      cursor1Div: start1,
      cursor2Div: end2,
    });
  };

  const handleCapture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onCaptureSnapshot(canvas.toDataURL('image/png'));
  };

  return (
    <section
      aria-label="Máy dao động kí điện tử"
      className="bg-slate-900 text-slate-100 border border-slate-800 rounded-xl p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white">
            Máy dao động kí điện tử (Hình 10.1 &amp; 10.2)
          </h2>
          <p className="text-xs text-slate-400">
            Lưới hiển thị 10 × 8 ô · Kéo trực tiếp thước T1, T2 trên màn hình hoặc nhập khoảng cách Δx tùy biến
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAutoScale}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Tự động căn chuẩn
          </button>

          <button
            type="button"
            onClick={handleCapture}
            disabled={!scope.powerOn}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" />
            {hasCapturedSnapshot ? 'Cập nhật ảnh báo cáo' : 'Chụp ảnh vào báo cáo'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Oscilloscope Screen (Hình 10.2) */}
        <div className="lg:col-span-8 flex flex-col">
          <div className="relative bg-[#0B1220] border-2 border-slate-700 rounded-lg overflow-hidden select-none">
            <canvas
              ref={canvasRef}
              width={760}
              height={460}
              data-testid="oscilloscope-canvas"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onPointerLeave={() => {
                if (!draggingCursorRef.current) setHoveredCursor(null);
              }}
              className={`w-full h-auto block touch-none ${
                scope.powerOn && scope.cursorsEnabled
                  ? hoveredCursor || activeDragCursor
                    ? 'cursor-ew-resize'
                    : 'cursor-crosshair'
                  : 'cursor-default'
              }`}
            />
          </div>

          {/* Authentic Bottom Telemetry Strip matching Hình 10.2 */}
          <div className="mt-2 bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono tabular-nums">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-amber-400 font-semibold">
                CH1 {formatVoltsPerDivLabel(scope.voltsPerDiv)}/div
              </span>
              <span className="text-sky-400 font-semibold">
                M {formatSecPerDivLabel(scope.secPerDiv)}/div
              </span>
              <span className="text-slate-300">
                TRIG: {scope.triggerMode} · {scope.coupling}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`font-semibold ${
                  scope.powerOn
                    ? scope.runState === 'RUN'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                    : 'text-slate-500'
                }`}
              >
                {scope.powerOn ? `● ${scope.runState}` : '○ OFF'}
              </span>
            </div>
          </div>

          {/* Customizable Caliper Deck for T1 & T2 */}
          {scope.cursorsEnabled && (
            <div className="mt-2 bg-slate-800/80 border border-slate-700 rounded-lg p-3.5 space-y-3">
              {/* Live Computed Readouts */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-md px-2.5 py-1.5">
                  <span className="block text-[10px] text-slate-400 font-sans">Khoảng cách Δx</span>
                  <strong className="text-sky-300">{deltaDivs.toFixed(2)} ô</strong>
                </div>
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-md px-2.5 py-1.5">
                  <span className="block text-[10px] text-slate-400 font-sans">Thời gian Δt</span>
                  <strong className="text-emerald-300">{(deltaTimeSec * 1000).toFixed(3)} ms</strong>
                </div>
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-md px-2.5 py-1.5">
                  <span className="block text-[10px] text-slate-400 font-sans">
                    Chu kì T = Δt / {scope.cursorPeriodsCount}
                  </span>
                  <strong className="text-slate-100">
                    {periodSec > 0 ? `${formatPeriodSec(periodSec)} s` : '—'}
                  </strong>
                </div>
                <div className="bg-slate-900/90 border border-slate-700/80 rounded-md px-2.5 py-1.5">
                  <span className="block text-[10px] text-slate-400 font-sans">Tần số f = k / Δt</span>
                  <strong className="text-amber-300">
                    {frequencyHz > 0 ? `${formatFreqHz(frequencyHz)} Hz` : '—'}
                  </strong>
                </div>
              </div>

              {/* Direct T1 & T2 Sliders + Precise Numeric Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-900/70 border border-slate-700/80 rounded-md p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-sky-300 font-mono">
                    <label htmlFor="cursor-t1" className="font-semibold">
                      Thước đo T1 (ô)
                    </label>
                    <input
                      id="cursor-t1-num"
                      data-testid="cursor-t1-input"
                      type="number"
                      min={0}
                      max={10}
                      step={0.01}
                      value={Number(scope.cursor1Div.toFixed(2))}
                      onChange={(e) => handleMoveCursor('T1', Number(e.target.value))}
                      className="w-20 px-2 py-0.5 text-right bg-slate-950 border border-slate-600 rounded text-sky-200 font-semibold focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                  </div>
                  <input
                    id="cursor-t1"
                    type="range"
                    min={0}
                    max={10}
                    step={0.01}
                    value={scope.cursor1Div}
                    onChange={(e) => handleMoveCursor('T1', Number(e.target.value))}
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </div>

                <div className="bg-slate-900/70 border border-slate-700/80 rounded-md p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-300 font-mono">
                    <label htmlFor="cursor-t2" className="font-semibold">
                      Thước đo T2 (ô)
                    </label>
                    <input
                      id="cursor-t2-num"
                      data-testid="cursor-t2-input"
                      type="number"
                      min={0}
                      max={10}
                      step={0.01}
                      value={Number(scope.cursor2Div.toFixed(2))}
                      onChange={(e) => handleMoveCursor('T2', Number(e.target.value))}
                      className="w-20 px-2 py-0.5 text-right bg-slate-950 border border-slate-600 rounded text-emerald-200 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                  <input
                    id="cursor-t2"
                    type="range"
                    min={0}
                    max={10}
                    step={0.01}
                    value={scope.cursor2Div}
                    onChange={(e) => handleMoveCursor('T2', Number(e.target.value))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>
              </div>

              {/* Custom Δx Distance Input, Caliper Lock, k Periods & Presets */}
              <div className="flex flex-wrap items-end justify-between gap-3 pt-1 border-t border-slate-700/80">
                <div className="flex flex-wrap items-end gap-2.5">
                  <div>
                    <label
                      htmlFor="cursor-span-input"
                      className="block text-[11px] font-semibold text-slate-300 mb-1"
                    >
                      Khoảng cách T1–T2 (ô)
                    </label>
                    <input
                      id="cursor-span-input"
                      data-testid="cursor-span-input"
                      type="number"
                      min={0}
                      max={10}
                      step={0.01}
                      value={Number(deltaDivs.toFixed(2))}
                      onChange={(e) => handleSetCustomSpan(Number(e.target.value))}
                      className="w-24 px-2.5 py-1.5 text-xs font-mono font-semibold bg-slate-950 border border-slate-600 rounded-md text-sky-200 focus:outline-none focus:ring-1 focus:ring-sky-400"
                    />
                  </div>

                  <button
                    type="button"
                    data-testid="cursor-lock-toggle"
                    onClick={() => onUpdateScope({ cursorLocked: !scope.cursorLocked })}
                    aria-pressed={scope.cursorLocked}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                      scope.cursorLocked
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 text-slate-200 border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    {scope.cursorLocked ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                    {scope.cursorLocked ? 'Đang khóa Δx' : 'Khóa khoảng cách Δx'}
                  </button>

                  <div>
                    <label
                      htmlFor="cursor-periods-input"
                      className="block text-[11px] font-semibold text-slate-300 mb-1"
                    >
                      Số chu kì (k) giữa T1–T2
                    </label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => onUpdateScope({ cursorPeriodsCount: k })}
                          className={`px-2 py-1 text-xs font-mono font-semibold rounded border transition-colors cursor-pointer ${
                            scope.cursorPeriodsCount === k
                              ? 'bg-sky-600 text-white border-sky-500'
                              : 'bg-slate-900 text-slate-300 border-slate-600 hover:bg-slate-700'
                          }`}
                        >
                          {k}T
                        </button>
                      ))}
                      <input
                        id="cursor-periods-input"
                        data-testid="cursor-periods-input"
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        value={scope.cursorPeriodsCount}
                        onChange={(e) =>
                          onUpdateScope({
                            cursorPeriodsCount: Math.max(1, Math.min(10, Math.round(Number(e.target.value) || 1))),
                          })
                        }
                        className="w-12 px-1.5 py-1 text-xs font-mono text-center bg-slate-950 border border-slate-600 rounded text-slate-100"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleQuickAlignPeriods(1)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-md transition-colors cursor-pointer"
                  >
                    Căn 1 chu kì
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickAlignPeriods(2)}
                    className="px-2.5 py-1.5 text-[11px] font-semibold bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-md transition-colors cursor-pointer"
                  >
                    Căn 2 chu kì
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateScope({
                        cursorLocked: false,
                        cursorPeriodsCount: 1,
                        cursor1Div: 1.0,
                        cursor2Div: 5.55,
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-slate-900 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-md transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Đặt lại
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Mẹo đo: Kéo trực tiếp vạch <span className="text-sky-300 font-semibold">T1</span> hoặc{' '}
                <span className="text-emerald-300 font-semibold">T2</span> trên màn hình sóng, hoặc nhập số ô{' '}
                <span className="font-mono text-slate-200">Δx</span> tùy ý rồi bật{' '}
                <span className="text-amber-300 font-semibold">Khóa khoảng cách Δx</span> để tịnh tiến cả cặp thước đo qua các đỉnh sóng khác nhau (T = {periodSec > 0 ? formatPeriodMs(periodSec) : '—'}).
              </p>
            </div>
          )}
        </div>

        {/* Right: Physical Oscilloscope Control Deck (Hình 10.1) */}
        <div className="lg:col-span-4 bg-slate-800/70 border border-slate-700 rounded-lg p-4 flex flex-col justify-start gap-4">
          <div className="space-y-4">
            {/* Paired Strike + Run/Stop, plus Power */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onStrikeHammer}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-amber-600 hover:bg-amber-500 text-white border border-amber-500 transition-colors cursor-pointer"
              >
                <Hammer className="w-3.5 h-3.5" />
                Gõ búa cao su
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateScope({ runState: scope.runState === 'RUN' ? 'STOP' : 'RUN' })
                }
                aria-pressed={scope.runState === 'STOP'}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  scope.runState === 'RUN'
                    ? 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500'
                }`}
              >
                {scope.runState === 'RUN' ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Dừng (STOP)
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Chạy (RUN)
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => onUpdateScope({ powerOn: !scope.powerOn })}
              aria-pressed={scope.powerOn}
              className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                scope.powerOn
                  ? 'bg-emerald-700/80 text-emerald-100 border-emerald-600'
                  : 'bg-slate-900 text-slate-300 border-slate-600 hover:bg-slate-700'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              {scope.powerOn ? 'Nguồn dao động kí: ĐANG BẬT' : 'Nguồn dao động kí: ĐANG TẮT'}
            </button>

            {/* Coupling AC/DC & Trigger Auto/Normal */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Dạng tín hiệu
                </span>
                <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-md border border-slate-700">
                  {(['AC', 'DC'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateScope({ coupling: mode })}
                      className={`py-1 text-xs font-mono font-semibold rounded transition-colors cursor-pointer ${
                        scope.coupling === mode
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-300 mb-1">
                  TRIGGER
                </span>
                <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-md border border-slate-700">
                  {(['Auto', 'Normal'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateScope({ triggerMode: mode })}
                      className={`py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${
                        scope.triggerMode === mode
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* VOLTS/DIV selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="volts-div-select" className="text-xs font-semibold text-slate-200">
                  VOLTS/DIV (Biên độ dọc)
                </label>
                <span className="text-xs font-mono text-amber-400 font-semibold">
                  {formatVoltsPerDivLabel(scope.voltsPerDiv)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {VOLTS_PER_DIV_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdateScope({ voltsPerDiv: opt.value })}
                    className={`py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                      Math.abs(scope.voltsPerDiv - opt.value) < 1e-6
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* SEC/DIV selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="sec-div-select" className="text-xs font-semibold text-slate-200">
                  SEC/DIV (Thời gian ngang)
                </label>
                <span className="text-xs font-mono text-sky-400 font-semibold">
                  {formatSecPerDivLabel(scope.secPerDiv)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {SEC_PER_DIV_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdateScope({ secPerDiv: opt.value })}
                    className={`py-1.5 text-xs font-mono rounded border transition-colors cursor-pointer ${
                      Math.abs(scope.secPerDiv - opt.value) < 1e-9
                        ? 'bg-sky-500 text-slate-950 border-sky-400 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Vertical Position */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="vpos-slider" className="text-xs font-semibold text-slate-200">
                  Vị trí lên / xuống đồ thị
                </label>
                <span className="text-xs font-mono text-slate-300 tabular-nums">
                  {scope.verticalOffsetDiv > 0 ? '+' : ''}
                  {scope.verticalOffsetDiv.toFixed(1)} ô
                </span>
              </div>
              <input
                id="vpos-slider"
                type="range"
                min={-2.5}
                max={2.5}
                step={0.1}
                value={scope.verticalOffsetDiv}
                onChange={(e) => onUpdateScope({ verticalOffsetDiv: Number(e.target.value) })}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Cursor Measurement Toggle */}
          <button
            type="button"
            onClick={() => onUpdateScope({ cursorsEnabled: !scope.cursorsEnabled })}
            aria-pressed={scope.cursorsEnabled}
            className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
              scope.cursorsEnabled
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Crosshair className="w-4 h-4" />
            {scope.cursorsEnabled ? 'Đang bật con trỏ đo Δt' : 'Bật con trỏ đo chu kì Δt'}
          </button>

          {/* Live CH1 Signal Summary */}
          {(() => {
            const effectiveStrength =
              scope.runState === 'STOP'
                ? frozenStrengthRef.current
                : apparatus.isVibrating
                ? apparatus.vibrationStrength
                : 0;
            const peakV = computeSignalPeakVolts({
              nominalFreqHz: selectedFork.nominalFreqHz,
              distanceCm: apparatus.distanceCm,
              ampPowerOn: apparatus.ampPowerOn,
              ampGain: apparatus.ampGain,
              cableMicroToAmpConnected: apparatus.cableMicroToAmpConnected,
              cableAmpToScopeConnected: apparatus.cableAmpToScopeConnected,
              scopePowerOn: scope.powerOn,
              vibrationStrength: effectiveStrength,
              coupling: scope.coupling,
              ambientNoiseEnabled: apparatus.ambientNoiseEnabled,
            });
            const totalWindowMs = GRID_COLS * scope.secPerDiv * 1000;
            const visiblePeriods = (GRID_COLS * scope.secPerDiv) * selectedFork.nominalFreqHz;
            return (
              <div className="mt-auto bg-slate-900/90 border border-slate-700/80 rounded-lg p-3 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Thông số tín hiệu vào (CH1)
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                  <div className="bg-slate-950/80 border border-slate-800 rounded px-2.5 py-1.5">
                    <span className="block text-[10px] text-slate-400 font-sans">Biên độ đỉnh U₀</span>
                    <strong className="text-amber-300">{peakV.toFixed(2)} V</strong>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 rounded px-2.5 py-1.5">
                    <span className="block text-[10px] text-slate-400 font-sans">Đỉnh – Đỉnh Upp</span>
                    <strong className="text-amber-200">{(peakV * 2).toFixed(2)} V</strong>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 rounded px-2.5 py-1.5">
                    <span className="block text-[10px] text-slate-400 font-sans">Bề rộng 10 ô</span>
                    <strong className="text-sky-300">{totalWindowMs.toFixed(2)} ms</strong>
                  </div>
                  <div className="bg-slate-950/80 border border-slate-800 rounded px-2.5 py-1.5">
                    <span className="block text-[10px] text-slate-400 font-sans">Số chu kì / màn</span>
                    <strong className="text-emerald-300">{visiblePeriods.toFixed(2)} T</strong>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </section>
  );
}
