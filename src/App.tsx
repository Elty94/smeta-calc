import { useState, useCallback } from "react";
import { parseLsr, analyze, AnalysisResult, AnalyzedPosition } from "./lib/parser";
import { defaultRates, ContractorRate } from "./lib/rates";

function formatMoney(v: number) {
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽";
}

function profitColor(pct: number) {
  if (pct >= 15) return "text-green-600";
  if (pct >= 10) return "text-yellow-600";
  return "text-red-600";
}

function profitBg(pct: number) {
  if (pct >= 15) return "bg-green-50 border-green-200";
  if (pct >= 10) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

function typeBadge(pos: AnalyzedPosition) {
  switch (pos.type) {
    case "material": return <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Материал</span>;
    case "transport": return <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Перевозка</span>;
    case "machine": return <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Механизм</span>;
    default: return null;
  }
}

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rates] = useState<ContractorRate[]>(defaultRates);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [showAll, setShowAll] = useState(true);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseLsr(buf);
      const res = analyze(parsed, rates);
      setResult(res);
    } catch (err) {
      alert("Ошибка при разборе файла: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [rates]);

  const filteredPositions = result
    ? showAll ? result.positions : result.positions.filter(p => p.type === "work")
    : [];

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">📊 Калькулятор рентабельности</h1>
          <p className="text-gray-500 mt-1">Загрузите ЛСР из ГРАНД-Сметы — получите анализ за секунды</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-8 mb-8">
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
            <div className="text-center">
              <p className="text-4xl mb-2">📁</p>
              <p className="text-gray-600 font-medium">
                {loading ? "Обработка..." : fileName || "Нажмите для загрузки Excel-файла ЛСР"}
              </p>
              <p className="text-gray-400 text-sm mt-1">.xlsx из ГРАНД-Сметы</p>
            </div>
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFile} />
          </label>
        </div>

        {result && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
                <p className="text-xs md:text-sm text-gray-500">Сметная стоимость</p>
                <p className="text-lg md:text-2xl font-bold text-gray-900">{formatMoney(result.totalEstimate)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
                <p className="text-xs md:text-sm text-gray-500">Себестоимость работ</p>
                <p className="text-lg md:text-2xl font-bold text-gray-900">{formatMoney(result.totalContractorCost)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-4 md:p-6">
                <p className="text-xs md:text-sm text-gray-500">Прибыль</p>
                <p className={`text-lg md:text-2xl font-bold ${profitColor(result.profitabilityPct)}`}>{formatMoney(result.totalProfit)}</p>
              </div>
              <div className={`rounded-xl shadow-sm border p-4 md:p-6 ${profitBg(result.profitabilityPct)}`}>
                <p className="text-xs md:text-sm text-gray-500">Рентабельность</p>
                <p className={`text-2xl md:text-3xl font-bold ${profitColor(result.profitabilityPct)}`}>{result.profitabilityPct.toFixed(1)}%</p>
                <p className="text-sm mt-1 font-medium">
                  {result.recommendation === "GO" && "✅ БЕРЁМ"}
                  {result.recommendation === "CAUTION" && "⚠️ ОСТОРОЖНО"}
                  {result.recommendation === "NO-GO" && "🚫 НЕ БЕРЁМ"}
                </p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-lg border p-3 text-center">
                <p className="text-xs text-gray-500">Работы (по смете)</p>
                <p className="text-sm font-bold">{formatMoney(result.totalWorkEstimate)}</p>
              </div>
              <div className="bg-white rounded-lg border p-3 text-center">
                <p className="text-xs text-gray-500">Материалы + прочее</p>
                <p className="text-sm font-bold">{formatMoney(result.totalMaterialEstimate)}</p>
              </div>
              <div className="bg-white rounded-lg border p-3 text-center">
                <p className="text-xs text-gray-500">Сопоставлено</p>
                <p className="text-sm font-bold">{result.matchedCount} из {result.matchedCount + result.unmatchedCount}</p>
              </div>
            </div>

            {/* Position table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-4 md:px-6 py-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Позиции ({filteredPositions.length})</h2>
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {showAll ? "Только работы" : "Все позиции"}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">№</th>
                      <th className="px-3 py-2 text-left">Описание</th>
                      <th className="px-3 py-2 text-left">Расценка</th>
                      <th className="px-3 py-2 text-right">Смета</th>
                      <th className="px-3 py-2 text-right">Себест.</th>
                      <th className="px-3 py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredPositions.map((pos, i) => (
                      <tr key={i} className={`hover:bg-gray-50 ${pos.type !== "work" ? "bg-gray-50/50" : !pos.matchedRate ? "bg-orange-50" : ""}`}>
                        <td className="px-3 py-2 text-gray-500">{pos.number}</td>
                        <td className="px-3 py-2">
                          <div className="max-w-xs md:max-w-md">
                            <p className="text-gray-900 truncate" title={pos.description}>
                              {pos.description.slice(0, 60)}{pos.description.length > 60 ? "…" : ""}
                            </p>
                            <div className="flex gap-1 mt-0.5">
                              <span className="text-xs text-gray-400">{pos.code.slice(0, 20)}</span>
                              {typeBadge(pos)}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {pos.type !== "work" ? (
                            <span className="text-xs text-gray-400">—</span>
                          ) : pos.matchedRate ? (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{pos.matchedRate.name}</span>
                          ) : (
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Не найдена</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{formatMoney(pos.estimateCost)}</td>
                        <td className="px-3 py-2 text-right">
                          {pos.type === "work" && pos.matchedRate ? formatMoney(pos.contractorCost) : pos.type !== "work" ? formatMoney(pos.contractorCost) : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${pos.type === "work" && pos.matchedRate ? profitColor(pos.profitabilityPct) : "text-gray-400"}`}>
                          {pos.type === "work" && pos.matchedRate ? pos.profitabilityPct.toFixed(0) + "%" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {result.unmatchedCount > 0 && (
              <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-orange-800 text-sm">
                  ⚠️ {result.unmatchedCount} рабочих позиций не сопоставлены с расценками — их себестоимость не учтена.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
