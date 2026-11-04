import { Fragment } from "react";

const BULLET = /^\s*[-•*]\s+/;

/**
 * Text obsahového slajdu — bez HTML (nikdy dangerouslySetInnerHTML):
 * odstavce oddělené prázdným řádkem, jednotlivé řádky zachované, odstavec
 * ze samých řádků „- …“ je odrážkový seznam. React všechno escapuje.
 */
export default function SlideBody({ text, className = "", center = false }: { text: string; className?: string; center?: boolean }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split("\n").filter((line) => line.trim() !== ""))
    .filter((lines) => lines.length > 0);

  return (
    <div className={`flex flex-col gap-[0.6em] ${center ? "text-center" : ""} ${className}`}>
      {paragraphs.map((lines, index) =>
        lines.every((line) => BULLET.test(line)) ? (
          // Na střed: odrážky uvnitř řádku, jinak by visely mimo text.
          <ul key={index} className={`flex flex-col gap-[0.3em] ${center ? "list-inside" : "pl-[1.1em]"}`}>
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
