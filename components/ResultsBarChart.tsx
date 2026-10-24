export type ResultOption = { id: number; text: string; votes: number };

// Pořadí možností se NEPŘEŘAZUJE podle počtu hlasů — zachovává se
// pořadí zadané moderátorem (často stupnice typu Výborné → Špatné,
// kterou by přerovnání podle hlasů rozbilo).
//
// `selectedOptionId` je volitelné — když je zadané, zvýrazní se daná
// možnost jako "Vaše odpověď" (účastnický finální pohled) a ostatní
// pruhy se mírně ztlumí. Bez něj (moderátorský pohled) se nic nemění
// oproti původnímu vzhledu.
//
// `correctOptionId` (nepovinné) = vyhodnocení otázky se správnou
// odpovědí: správná zeleně s ✓, ostatní jemně červeně s ×. Kromě barvy
// vždy i ikona a text, aby to bylo srozumitelné i pro barvoslepé.
// Volající ho smí předat jen u UKONČENÉ otázky.
export function votesLabel(count: number): string {
  if (count === 1) return "hlas";
  return count >= 2 && count <= 4 ? "hlasy" : "hlasů";
}

// `large` = promítací režim (čitelné ze zadní řady) s písmeny odpovědí.
const LETTERS = "ABCDEFGHIJ";

export default function ResultsBarChart({
  options,
  totalVotes,
  selectedOptionId = null,
  correctOptionId = null,
  large = false,
}: {
  options: ResultOption[];
  totalVotes: number;
  selectedOptionId?: number | null;
  correctOptionId?: number | null;
  large?: boolean;
}) {
  const highlightMode = selectedOptionId !== null;
  const evaluated = correctOptionId !== null && options.some((option) => option.id === correctOptionId);

  return (
    <div className={`flex flex-col ${large ? "gap-5 lg:gap-6" : "gap-4"}`}>
      {options.map((option, index) => {
        const percent = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
        const isSelected = highlightMode && option.id === selectedOptionId;
        const isCorrect = evaluated && option.id === correctOptionId;
        const wrapperClass = evaluated
          ? isCorrect
            ? "rounded-xl border-2 border-emerald-600 bg-emerald-50 p-3"
            : `rounded-xl border bg-red-50/60 p-3 ${isSelected ? "border-2 border-red-400" : "border-red-200"}`
          : isSelected
            ? "rounded-xl border-2 border-brand bg-brand/5 p-3"
            : "";
        const barClass = evaluated ? (isCorrect ? "bg-emerald-600" : "bg-red-300") : highlightMode && !isSelected ? "bg-brand/50" : "bg-brand";
        return (
          <div key={option.id} className={wrapperClass}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span
                className={`${large ? "text-2xl lg:text-3xl" : "text-lg sm:text-xl"} ${
                  isSelected && !evaluated ? "font-bold text-brand" : isCorrect ? "font-bold text-gray-900" : "font-medium text-gray-900"
                }`}
              >
                {evaluated && (
                  <span aria-hidden="true" className={`mr-2 font-bold ${isCorrect ? "text-emerald-700" : "text-red-700"}`}>
                    {isCorrect ? "✓" : "×"}
                  </span>
                )}
                {large && <span className="mr-3 font-bold text-brand">{LETTERS[index]}</span>}
                {option.text}
                {evaluated && !isCorrect && <span className="sr-only"> (nesprávná odpověď)</span>}
                {isCorrect && (
                  <span
                    className={`ml-2 rounded-full bg-emerald-700 px-2 py-0.5 align-middle font-semibold text-white ${large ? "text-base lg:text-xl" : "text-xs"}`}
                  >
                    Správná odpověď
                  </span>
                )}
                {isSelected && (
                  <span className="ml-2 rounded-full bg-brand px-2 py-0.5 align-middle text-xs font-semibold text-white">
                    Vaše odpověď
                  </span>
                )}
              </span>
              <span className={`shrink-0 font-mono ${large ? "text-xl font-semibold text-gray-700 lg:text-2xl" : "text-sm text-gray-500 sm:text-base"}`}>
                {percent} % · {option.votes} {votesLabel(option.votes)}
              </span>
            </div>
            <div className={`w-full overflow-hidden rounded-full bg-gray-100 ${large ? "h-6 lg:h-8" : "h-5 sm:h-7"}`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${barClass}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
