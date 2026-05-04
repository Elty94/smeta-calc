import * as XLSX from "xlsx";
import { ContractorRate, defaultRates } from "./rates";

export interface LsrPosition {
  number: number;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  estimateCost: number;
  section: string;
}

export interface AnalyzedPosition extends LsrPosition {
  matchedRate: ContractorRate | null;
  contractorCost: number;
  profit: number;
  profitabilityPct: number;
}

export interface AnalysisResult {
  positions: AnalyzedPosition[];
  totalEstimate: number;
  totalContractorCost: number;
  totalProfit: number;
  profitabilityPct: number;
  recommendation: "GO" | "CAUTION" | "NO-GO";
}

function parseUnitMultiplier(unit: string): { baseUnit: string; multiplier: number } {
  const match = unit.match(/^(\d+)\s+(.+)$/);
  if (match) return { baseUnit: match[2].trim(), multiplier: parseFloat(match[1]) };
  return { baseUnit: unit.trim(), multiplier: 1 };
}

export function parseLsr(data: ArrayBuffer): LsrPosition[] {
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const positions: LsrPosition[] = [];
  let currentSection = "";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || "").trim();
    if (firstCell.startsWith("Раздел")) {
      currentSection = firstCell;
      continue;
    }

    const posNum = Number(row[0]);
    const code = String(row[1] || "").trim();
    if (
      !isNaN(posNum) && posNum > 0 && posNum === Math.floor(posNum) &&
      (code.startsWith("ГЭСН") || code.startsWith("ФСЭМ") || code.startsWith("ФССЦпг"))
    ) {
      const description = String(row[2] || "").trim();
      const unit = String(row[7] || "").trim();
      const quantity = Number(row[10]) || Number(row[8]) || 0;

      let estimateCost = 0;
      for (let j = i + 1; j < Math.min(i + 30, rows.length); j++) {
        const nextRow = rows[j];
        if (!nextRow) continue;
        const nextNum = Number(nextRow[0]);
        if (!isNaN(nextNum) && nextNum > 0 && nextNum === Math.floor(nextNum) && String(nextRow[1] || "").startsWith("ГЭСН")) break;
        const cellText = String(nextRow[2] || "").trim();
        if (cellText.includes("Всего по позиции")) {
          estimateCost = Number(nextRow[15]) || 0;
          break;
        }
      }

      if (estimateCost === 0) estimateCost = Number(row[15]) || 0;

      positions.push({ number: posNum, code, description, unit, quantity, estimateCost, section: currentSection });
    }
  }
  return positions;
}

function matchRate(position: LsrPosition, rates: ContractorRate[]): ContractorRate | null {
  const desc = position.description.toLowerCase();
  let bestMatch: ContractorRate | null = null;
  let bestScore = 0;
  for (const rate of rates) {
    let score = 0;
    for (const kw of rate.keywords) {
      if (desc.includes(kw.toLowerCase())) score += kw.length;
    }
    if (score > bestScore) { bestScore = score; bestMatch = rate; }
  }
  return bestScore > 0 ? bestMatch : null;
}

export function analyze(positions: LsrPosition[], rates: ContractorRate[] = defaultRates): AnalysisResult {
  const analyzed: AnalyzedPosition[] = positions.map((pos) => {
    const matched = matchRate(pos, rates);
    let contractorCost = 0;
    if (matched) {
      const { multiplier } = parseUnitMultiplier(pos.unit);
      contractorCost = matched.price * pos.quantity * multiplier;
    }
    const profit = pos.estimateCost - contractorCost;
    const profitabilityPct = pos.estimateCost > 0 ? (profit / pos.estimateCost) * 100 : 0;
    return { ...pos, matchedRate: matched, contractorCost, profit, profitabilityPct };
  });

  const totalEstimate = analyzed.reduce((s, p) => s + p.estimateCost, 0);
  const totalContractorCost = analyzed.reduce((s, p) => s + p.contractorCost, 0);
  const totalProfit = totalEstimate - totalContractorCost;
  const profitabilityPct = totalEstimate > 0 ? (totalProfit / totalEstimate) * 100 : 0;

  let recommendation: "GO" | "CAUTION" | "NO-GO" = "GO";
  if (profitabilityPct < 10) recommendation = "NO-GO";
  else if (profitabilityPct < 15) recommendation = "CAUTION";

  return { positions: analyzed, totalEstimate, totalContractorCost, totalProfit, profitabilityPct, recommendation };
}
