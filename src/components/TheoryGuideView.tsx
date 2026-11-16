import { MUSICAL_NOTES_TABLE_10_2 } from '../utils/physics';

interface TheoryGuideViewProps {
  onStartExperiment: () => void;
}

export function TheoryGuideView({ onStartExperiment }: TheoryGuideViewProps) {
  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-5 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Hướng dẫn thực hành — SGK Vật lí 11 (Kết nối tri thức) · Bài 10
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Tóm tắt quy trình sử dụng dao động kí điện tử, bố trí thí nghiệm và công thức xử lí số liệu.
            </p>
          </div>
          <button
            type="button"
            onClick={onStartExperiment}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors cursor-pointer"
          >
            Quay lại phòng thí nghiệm
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Section I */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              I. Giới thiệu &amp; Cách sử dụng dao động kí điện tử
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed">
              Dao động kí là thiết bị dùng để hiển thị trên màn hình dạng tín hiệu đưa vào cần quan sát, cho phép đo cường độ, tần số, chu kì và khoảng thời gian của tín hiệu dao động điện.
            </p>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-700">
              <li>Nối que đo vào chân cắm tín hiệu vào (CH1).</li>
              <li>Chọn dạng tín hiệu đo <strong>AC</strong> (cho sóng âm xoay chiều) hoặc DC.</li>
              <li>Nối dao động kí với bộ nguồn và bật công tắc nguồn.</li>
              <li>Nhấn nút <strong>TRIGGER</strong> để chế độ là <strong>Auto</strong>.</li>
              <li>Điều chỉnh nút <strong>VOLTS/DIV</strong> để chỉnh biên độ dao động vừa khung hình.</li>
              <li>Điều chỉnh nút <strong>SEC/DIV</strong> để chỉnh giá trị thời gian ứng với một ô ngang.</li>
              <li>Sử dụng nút điều chỉnh lên xuống đồ thị (Vertical Position) để căn tâm đồ thị.</li>
            </ol>
          </div>

          {/* Section II */}
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              II. Tiến hành thí nghiệm đo tần số sóng âm
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-700">
              <li>
                <strong>Dụng cụ (Hình 10.3):</strong> Dao động kí điện tử và dây đo (1), Micro (2), Bộ khuếch đại tín hiệu (3), Âm thoa và búa cao su (4), Giá đỡ và kẹp giữ âm thoa.
              </li>
              <li>
                <strong>Bố trí (Hình 10.4):</strong> Đặt micro đối diện và cách âm thoa khoảng <strong>20 cm</strong>. Nối micro → bộ khuếch đại → chân CH1 dao động kí.
              </li>
              <li>
                <strong>Thực hiện đo:</strong> Gõ nhẹ búa cao su vào âm thoa. Quan sát đường hình sin trên màn hình, dùng nút <strong>RUN/STOP</strong> hoặc con trỏ Δt để đếm số ô ngang N ứng với k chu kì.
              </li>
              <li>
                <strong>Công thức tính:</strong>
                <div className="mt-1.5 bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-xs text-slate-900 space-y-1">
                  <div>Chu kì: T = (N × SEC/DIV) / k (s)</div>
                  <div>Tần số: f = 1 / T (Hz)</div>
                  <div>Giá trị trung bình 3 lần đo: f̄ = (f₁ + f₂ + f₃) / 3</div>
                  <div>Sai số tuyệt đối trung bình: Δf = (|f₁ - f̄| + |f₂ - f̄| + |f₃ - f̄|) / 3</div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900 mb-3">
          Bảng 10.2: Tần số các nốt nhạc cơ bản (SGK Trang 45)
        </h2>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="py-2.5 px-4 font-semibold">Nốt nhạc (Kí hiệu)</th>
                <th className="py-2.5 px-4 font-semibold text-right">Tần số (Hz)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {MUSICAL_NOTES_TABLE_10_2.map((n) => (
                <tr key={n.symbol} className="bg-white">
                  <td className="py-2 px-4 font-medium text-slate-900">
                    {n.note} ({n.symbol})
                  </td>
                  <td className="py-2 px-4 text-right font-mono font-semibold text-sky-700 tabular-nums">
                    {n.freqHz}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
