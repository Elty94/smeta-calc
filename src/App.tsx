import { useState, useCallback } from "react";
import { parseLsr, analyze, AnalysisResult } from "./lib/parser";
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

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rates] = useState<ContractorRate[]>(defaultRates);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");

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
                {loading ? "Обработка..." : fileName ? fileName : "Нажмите для загрузки Excel-файла ЛСР"}
              </p>
              <p className="text-gray-400 text-sm mt-1">.xlsx из ГРАНД-Сметы</p>
            </div>
            <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleFile} />
          </label>
        </div>

        {result && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <p className="text-sm text-gray-500">Сметная стоимость</p>
                <p className="text-2xl font-bold text-gray-900">{formatMoney(result.totalEstimate)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <p className="text-sm text-gray-500">Себестоимость работ</p>
                <p className="text-2xl font-bold text-gray-900">{formatMoney(result.totalContractorCost)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <p className="text-sm text-gray-500">Прибыль</p>
                <p className={`text-2xl font-bold ${profitColor(result.profitabilityPct)}`}>{formatMoney(result.totalProfit)}</p>
              </div>
              <div className={`rounded-xl shadow-sm border p-6 ${profitBg(result.profitabilityPct)}`}>
                <p className="text-sm text-gray-500">Рентабельность</p>
                <p className={`text-3xl font-bold ${profitColor(result.profitabilityPct)}`}>{result.profitabilityPct.toFixed(1)}%</p>
                <p className="text-sm mt-1 font-medium">
                  {result.recommendation === "GO" && "✅ БЕРЁМ"}
                  {result.recommendation === "CAUTION" && "⚠️ ОСТОРОЖНО"}
                  {result.recommendation === "NO-GO" && "🚫 НЕ БЕРЁМ"}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-gray-900">Позиции ({result.positions.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">№</th>
                      <th className="px-4 py-3 text-left">Описание</th>
                      <th className="px-4 py-3 text-left">Расценка</th>
                      <th className="px-4 py-3 text-right">Кол-во</th>
                      <th className="px-4 py-3 text-right">Смета</th>
                      <th className="px-4 py-3 text-right">Себест.</th>
                      <th className="px-4 py-3 text-right">Прибыль</th>
                      <th className="px-4 py-3 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.positions.map((pos, i) => (
                      <tr key={i} className={`hover:bg-gray-50 ${!pos.matchedRate ? "bg-orange-50" : ""}`}>
                        <td className="px-4 py-3 text-gray-500">{pos.number}</td>
                        <td className="px-4 py-3">
                          <div className="max-w-md">
                            <p className="text-gray-900 truncate" title={pos.description}>{pos.description.slice(0, 80)}{pos.description.length > 80 ? "…" : ""}</p>
                            <p className="text-xs text-gray-400">{pos.code}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {pos.matchedRate
                            ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{pos.matchedRate.name}</span>
                            : <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Не найдена</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{pos.quantity.toFixed(2)} {pos.unit}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(pos.estimateCost)}</td>
                        <td className="px-4 py-3 text-right">{pos.matchedRate ? formatMoney(pos.contractorCost) : "—"}</td>
                        <td className="px-4 py-3 text-right font-medium">{pos.matchedRate ? formatMoney(pos.profit) : "—"}</td>
                        <td className={`px-4 py-3 text-right font-bold ${pos.matchedRate ? profitColor(pos.profitabilityPct) : "text-gray-400"}`}>
                          {pos.matchedRate ? pos.profitabilityPct.toFixed(1) + "%" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {result.positions.some((p) => !p.matchedRate) && (
              <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-orange-800 text-sm">
                  ⚠️ Некоторые позиции не сопоставлены с расценками. Себестоимость по ним не учтена — реальная рентабельность может быть ниже.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
