import * as XLSX from "xlsx";
import { ContractorRate, defaultRates } from "./rates";

export interface LsrPosition {
  number: number;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  estimateCost: number; // "Всего по позиции" — includes НР + СП
  section: string;
  type: "work" | "material" | "transport" | "machine";
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
  totalWorkEstimate: number;
  totalMaterialEstimate: number;
  totalContractorCost: number;
  totalProfit: number;
  profitabilityPct: number;
  recommendation: "GO" | "CAUTION" | "NO-GO";
  matchedCount: number;
  unmatchedCount: number;
}

function classifyCode(code: string): LsrPosition["type"] {
  if (code.startsWith("ФСБЦ") || code.startsWith("ФССЦпг")) return "material";
  if (code.startsWith("ФСЭМ")) return "machine";
  if (/^0?2-15/.test(code) || /^\d+-\d+$/.test(code)) return "transport";
  return "work"; // ГЭСН, ГЭСНм, etc.
}

function extractBaseUnit(unit: string): { baseUnit: string; multiplier: number } {
  // "1000 м3" → { baseUnit: "м3", multiplier: 1000 }
  // "100 м2" → { baseUnit: "м2", multiplier: 100 }
  const m = unit.match(/^(\d+)\s+(.+)$/);
  if (m) return { baseUnit: m[2].trim(), multiplier: parseFloat(m[1]) };
  return { baseUnit: unit.trim(), multiplier: 1 };
}

export function parseLsr(data: ArrayBuffer): LsrPosition[] {
  const wb = XLSX.read(data, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
  });

  const positions: LsrPosition[] = [];
  let currentSection = "";
  const seen = new Set<string>(); // deduplicate by row index

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

    // Position row: integer number + code with length > 3
    if (
      !isNaN(posNum) &&
      posNum > 0 &&
      posNum === Math.floor(posNum) &&
      code.length > 3
    ) {
      const key = `${i}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const description = String(row[2] || "").trim();
      const unit = String(row[7] || "").trim();
      const quantity = Number(row[8]) || 0;
      const type = classifyCode(code);

      // Find "Всего по позиции" cost
      let estimateCost = 0;

      // For materials (ФСБЦ), cost is usually on the same row in col[15]
      if (type === "material") {
        estimateCost = Number(row[15]) || 0;
        // Also check next row for "Всего по позиции"
        if (estimateCost === 0) {
          for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
            const nr = rows[j];
            if (!nr) continue;
            const ct = String(nr[2] || "").trim();
            if (ct.includes("Всего по позиции")) {
              estimateCost = Number(nr[15]) || 0;
              break;
            }
          }
        }
      } else {
        // For work positions, find "Всего по позиции" below
        for (let j = i + 1; j < Math.min(i + 40, rows.length); j++) {
          const nr = rows[j];
          if (!nr) continue;

          // Stop if we hit next position
          const nn = Number(nr[0]);
          const nc = String(nr[1] || "").trim();
          if (
            !isNaN(nn) &&
            nn > 0 &&
            nn === Math.floor(nn) &&
            nc.length > 3
          ) {
            break;
          }

          const cellText = String(nr[2] || "").trim();
          if (cellText.includes("Всего по позиции")) {
            estimateCost = Number(nr[15]) || 0;
            break;
          }
        }
        // Fallback to row itself
        if (estimateCost === 0) {
          estimateCost = Number(row[15]) || 0;
        }
      }

      positions.push({
        number: posNum,
        code,
        description,
        unit,
        quantity,
        estimateCost,
        section: currentSection,
        type,
      });
    }
  }
  return positions;
}

function matchRate(
  position: LsrPosition,
  rates: ContractorRate[]
): ContractorRate | null {
  const desc = position.description.toLowerCase();
  let bestMatch: ContractorRate | null = null;
  let bestScore = 0;
  for (const rate of rates) {
    let score = 0;
    for (const kw of rate.keywords) {
      if (desc.includes(kw.toLowerCase())) score += kw.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = rate;
    }
  }
  return bestScore > 0 ? bestMatch : null;
}

export function analyze(
  positions: LsrPosition[],
  rates: ContractorRate[] = defaultRates
): AnalysisResult {
  const analyzed: AnalyzedPosition[] = positions.map((pos) => {
    // Only match rates for work positions (ГЭСН)
    if (pos.type !== "work") {
      return {
        ...pos,
        matchedRate: null,
        contractorCost: pos.estimateCost, // materials/transport at cost
        profit: 0,
        profitabilityPct: 0,
      };
    }

    const matched = matchRate(pos, rates);
    let contractorCost = 0;
    if (matched) {
      const { multiplier } = extractBaseUnit(pos.unit);
      // quantity is already in the unit specified (e.g., 0.5795 of "1000 м3")
      // contractor rate is per base unit (e.g., per м3)
      // so: contractorCost = rate × quantity × multiplier
      contractorCost = matched.price * pos.quantity * multiplier;
    }
    const profit = pos.estimateCost - contractorCost;
    const profitabilityPct =
      pos.estimateCost > 0 ? (profit / pos.estimateCost) * 100 : 0;

    return {
      ...pos,
      matchedRate: matched,
      contractorCost,
      profit,
      profitabilityPct,
    };
  });

  const workPositions = analyzed.filter((p) => p.type === "work");
  const materialPositions = analyzed.filter((p) => p.type !== "work");

  const totalEstimate = analyzed.reduce((s, p) => s + p.estimateCost, 0);
  const totalWorkEstimate = workPositions.reduce(
    (s, p) => s + p.estimateCost,
    0
  );
  const totalMaterialEstimate = materialPositions.reduce(
    (s, p) => s + p.estimateCost,
    0
  );
  const totalContractorCost = analyzed.reduce(
    (s, p) => s + p.contractorCost,
    0
  );
  const totalProfit = totalEstimate - totalContractorCost;
  const profitabilityPct =
    totalEstimate > 0 ? (totalProfit / totalEstimate) * 100 : 0;

  let recommendation: "GO" | "CAUTION" | "NO-GO" = "GO";
  if (profitabilityPct < 10) recommendation = "NO-GO";
  else if (profitabilityPct < 15) recommendation = "CAUTION";

  const matchedCount = workPositions.filter((p) => p.matchedRate).length;
  const unmatchedCount = workPositions.filter((p) => !p.matchedRate).length;

  return {
    positions: analyzed,
    totalEstimate,
    totalWorkEstimate,
    totalMaterialEstimate,
    totalContractorCost,
    totalProfit,
    profitabilityPct,
    recommendation,
    matchedCount,
    unmatchedCount,
  };
}
