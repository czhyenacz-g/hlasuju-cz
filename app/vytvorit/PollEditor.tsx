"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LIMITS } from "../../lib/polls/limits.ts";

type OptionDraft = { key: string; text: string };
type QuestionDraft = { key: string; text: string; expanded: boolean; options: OptionDraft[] };

function makeKey() {
  return Math.random().toString(36).slice(2);
}

function emptyOption(): OptionDraft {
  return { key: makeKey(), text: "" };
}

function emptyQuestion(expanded = true): QuestionDraft {
  return { key: makeKey(), text: "", expanded, options: [emptyOption(), emptyOption()] };
}

// Celý editor je klientský — otázky se skládají lokálně a odešlou se
// jedním POST až při "Vytvořit hlasování" (žádné průběžné ukládání,
// viz zadání: po vytvoření se otázky už needitují).
export default function PollEditor() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateQuestion(key: string, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    if (questions.length >= LIMITS.MAX_QUESTIONS) return;
    setQuestions((prev) => [...prev.map((q) => ({ ...q, expanded: false })), emptyQuestion()]);
  }

  function removeQuestion(key: string) {
    setQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((q) => q.key !== key)));
  }

  function duplicateQuestion(key: string) {
    setQuestions((prev) => {
      const index = prev.findIndex((q) => q.key === key);
      if (index === -1 || prev.length >= LIMITS.MAX_QUESTIONS) return prev;
      const source = prev[index];
      const copy: QuestionDraft = {
        key: makeKey(),
        text: source.text,
        expanded: false,
        options: source.options.map((o) => ({ key: makeKey(), text: o.text })),
      };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function moveQuestion(key: string, direction: -1 | 1) {
    setQuestions((prev) => {
      const index = prev.findIndex((q) => q.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addOption(questionKey: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === questionKey && q.options.length < LIMITS.MAX_OPTIONS
          ? { ...q, options: [...q.options, emptyOption()] }
          : q
      )
    );
  }

  function removeOption(questionKey: string, optionKey: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === questionKey && q.options.length > LIMITS.MIN_OPTIONS
          ? { ...q, options: q.options.filter((o) => o.key !== optionKey) }
          : q
      )
    );
  }

  function updateOptionText(questionKey: string, optionKey: string, text: string) {
    setQuestions((prev) =>
      prev.map((q) =>
        q.key === questionKey
          ? { ...q, options: q.options.map((o) => (o.key === optionKey ? { ...o, text } : o)) }
          : q
      )
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    for (const [index, q] of questions.entries()) {
      if (!q.text.trim()) {
        setError(`Otázka ${index + 1}: doplňte text otázky.`);
        return;
      }
      if (q.options.some((o) => !o.text.trim())) {
        setError(`Otázka ${index + 1}: doplňte text u všech odpovědí.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          email: email.trim() || undefined,
          questions: questions.map((q) => ({
            text: q.text.trim(),
            options: q.options.map((o) => ({ text: o.text.trim() })),
          })),
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Hlasování se nepodařilo vytvořit.");
        setSubmitting(false);
        return;
      }

      router.push(`/m/${body.moderatorToken}`);
    } catch {
      setError("Hlasování se nepodařilo vytvořit. Zkuste to prosím znovu.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">Název hlasování (nepovinné)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={LIMITS.MAX_TITLE_LENGTH}
            placeholder="např. Školení BOZP"
            className="rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">E-mail pro zaslání odkazu na správu hlasování</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={LIMITS.MAX_EMAIL_LENGTH}
            placeholder="vas@email.cz"
            className="rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:border-brand focus:outline-none"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-sm text-gray-500">
              <th className="w-12 px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Otázka</th>
              <th className="px-4 py-3 font-medium">Odpovědi</th>
              <th className="px-4 py-3 font-medium">Akce</th>
            </tr>
          </thead>
          <tbody>
            {questions.map((q, index) => (
              <QuestionRows
                key={q.key}
                question={q}
                index={index}
                total={questions.length}
                onToggle={() => updateQuestion(q.key, { expanded: !q.expanded })}
                onTextChange={(text) => updateQuestion(q.key, { text })}
                onAddOption={() => addOption(q.key)}
                onRemoveOption={(optionKey) => removeOption(q.key, optionKey)}
                onOptionTextChange={(optionKey, text) => updateOptionText(q.key, optionKey, text)}
                onDuplicate={() => duplicateQuestion(q.key)}
                onRemove={() => removeQuestion(q.key)}
                onMoveUp={() => moveQuestion(q.key, -1)}
                onMoveDown={() => moveQuestion(q.key, 1)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addQuestion}
        disabled={questions.length >= LIMITS.MAX_QUESTIONS}
        className="self-start rounded-xl border-2 border-dashed border-gray-300 px-5 py-3 text-sm font-semibold text-gray-600 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        + Přidat otázku
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="min-h-[56px] w-full rounded-2xl bg-brand px-6 py-4 text-lg font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60 sm:w-auto sm:self-start"
      >
        {submitting ? "Vytvářím…" : "Vytvořit hlasování"}
      </button>
    </form>
  );
}

function QuestionRows({
  question,
  index,
  total,
  onToggle,
  onTextChange,
  onAddOption,
  onRemoveOption,
  onOptionTextChange,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  question: QuestionDraft;
  index: number;
  total: number;
  onToggle: () => void;
  onTextChange: (text: string) => void;
  onAddOption: () => void;
  onRemoveOption: (optionKey: string) => void;
  onOptionTextChange: (optionKey: string, text: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <>
      <tr className="border-b border-gray-100 align-top">
        <td className="px-4 py-3 text-gray-500">{index + 1}</td>
        <td className="px-4 py-3">
          <button type="button" onClick={onToggle} className="text-left font-medium text-gray-900 hover:text-brand">
            {question.text.trim() || "(bez textu)"}
          </button>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {question.options.length} {question.options.length === 1 ? "odpověď" : "odpovědi"}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <button type="button" onClick={onToggle} className="text-brand hover:underline">
              {question.expanded ? "Skrýt" : "Upravit"}
            </button>
            <button type="button" onClick={onDuplicate} className="text-gray-500 hover:underline">
              Duplikovat
            </button>
            <button type="button" onClick={onMoveUp} disabled={index === 0} className="text-gray-500 hover:underline disabled:opacity-30">
              ↑
            </button>
            <button type="button" onClick={onMoveDown} disabled={index === total - 1} className="text-gray-500 hover:underline disabled:opacity-30">
              ↓
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={total <= 1}
              className="text-red-600 hover:underline disabled:opacity-30"
            >
              Odstranit
            </button>
          </div>
        </td>
      </tr>
      {question.expanded && (
        <tr className="border-b border-gray-100 bg-gray-50/60">
          <td />
          <td colSpan={3} className="px-4 py-4">
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-gray-700">Text otázky</span>
                <input
                  type="text"
                  value={question.text}
                  onChange={(e) => onTextChange(e.target.value)}
                  maxLength={LIMITS.MAX_QUESTION_LENGTH}
                  placeholder="Zadejte otázku"
                  className="rounded-xl border-2 border-gray-200 px-4 py-2.5 text-gray-900 focus:border-brand focus:outline-none"
                />
              </label>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-gray-700">Odpovědi</span>
                {question.options.map((option) => (
                  <div key={option.key} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option.text}
                      onChange={(e) => onOptionTextChange(option.key, e.target.value)}
                      maxLength={LIMITS.MAX_OPTION_LENGTH}
                      placeholder="Text odpovědi"
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-gray-900 focus:border-brand focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveOption(option.key)}
                      disabled={question.options.length <= LIMITS.MIN_OPTIONS}
                      className="shrink-0 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-30"
                      aria-label="Odstranit odpověď"
                    >
                      Odstranit
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={onAddOption}
                  disabled={question.options.length >= LIMITS.MAX_OPTIONS}
                  className="self-start text-sm font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Přidat odpověď
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
