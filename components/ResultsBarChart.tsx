export type ResultOption = { id: number; text: string; votes: number };

// Pořadí možností se NEPŘEŘAZUJE podle počtu hlasů — zachovává se
// pořadí zadané moderátorem (často stupnice typu Výborné → Špatné,
// kterou by přerovnání podle hlasů rozbilo).
//
// `selectedOptionId` je volitelné — když je zadané, zvýrazní se daná
// možnost jako "Vaše odpověď" (účastnický finální pohled) a ostatní
// pruhy se mírně ztlumí. Bez něj (moderátorský pohled) se nic nemění
// oproti původnímu vzhledu.
export default function ResultsBarChart({
  options,
  totalVotes,
  selectedOptionId = null,
}: {
  options: ResultOption[];
  totalVotes: number;
  selectedOptionId?: number | null;
}) {
  const highlightMode = selectedOptionId !== null;

  return (
    <div className="flex flex-col gap-4">
      {options.map((option) => {
        const percent = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
        const isSelected = highlightMode && option.id === selectedOptionId;
        return (
          <div key={option.id} className={isSelected ? "rounded-xl border-2 border-brand bg-brand/5 p-3" : ""}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span
                className={`text-lg sm:text-xl ${isSelected ? "font-bold text-brand" : "font-medium text-gray-900"}`}
              >
                {option.text}
                {isSelected && (
                  <span className="ml-2 rounded-full bg-brand px-2 py-0.5 align-middle text-xs font-semibold text-white">
                    Vaše odpověď
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-sm text-gray-500 sm:text-base">
                {percent} % · {option.votes} {option.votes === 1 ? "hlas" : option.votes < 5 ? "hlasy" : "hlasů"}
              </span>
            </div>
            <div className="h-5 w-full overflow-hidden rounded-full bg-gray-100 sm:h-7">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  highlightMode && !isSelected ? "bg-brand/50" : "bg-brand"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
