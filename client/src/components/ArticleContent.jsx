import { Fragment } from 'react';

export default function ArticleContent({ content, className = '' }) {
  const paragraphs = content
    .split(/\r?\n(?:[ \t]*\r?\n)+/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph) => paragraph.split(/\r?\n/));

  return (
    <div className={`article-content ${className}`.trim()}>
      {paragraphs.map((lines, paragraphIndex) => (
        <p key={paragraphIndex}>
          {lines.map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {line}
              {lineIndex < lines.length - 1 && <br />}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
