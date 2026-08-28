export type ResultOption = { id: number; text: string; votes: number };

// Pořadí možností se NEPŘEŘAZUJE podle počtu hlasů — zachovává se
// pořadí zadané moderátorem (často stupnice typu Výborné → Špatné,
// kterou by přerovnání podle hlasů rozbilo).
export default function ResultsBarChart({ options, totalVotes }: { options: ResultOption[]; totalVotes: number }) {
  return (
    <div className="flex flex-col gap-4">
      {options.map((option) => {
        const percent = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
        return (
          <div key={option.id}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-lg font-medium text-gray-900 sm:text-xl">{option.text}</span>
              <span className="shrink-0 font-mono text-sm text-gray-500 sm:text-base">
                {percent} % · {option.votes} {option.votes === 1 ? "hlas" : option.votes < 5 ? "hlasy" : "hlasů"}
              </span>
            </div>
            <div className="h-5 w-full overflow-hidden rounded-full bg-gray-100 sm:h-7">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
