import { Fragment } from "react";

const BULLET = /^\s*[-•*]\s+/;

/**
 * Text obsahového slajdu — bez HTML (nikdy dangerouslySetInnerHTML):
 * odstavce oddělené prázdným řádkem, jednotlivé řádky zachované, odstavec
 * ze samých řádků „- …“ je odrážkový seznam. React všechno escapuje.
 */
export default function SlideBody({ text, className = "" }: { text: string; className?: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split("\n").filter((line) => line.trim() !== ""))
    .filter((lines) => lines.length > 0);

  return (
    <div className={`flex flex-col gap-[0.6em] ${className}`}>
      {paragraphs.map((lines, index) =>
        lines.every((line) => BULLET.test(line)) ? (
          <ul key={index} className="flex flex-col gap-[0.3em] pl-[1.1em]">
            {lines.map((line, lineIndex) => (
              <li key={lineIndex} className="list-disc marker:text-brand">
                {line.replace(BULLET, "")}
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} className="whitespace-pre-wrap break-words">
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </p>
        )
      )}
    </div>
  );
}
