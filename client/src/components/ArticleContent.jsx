import { Fragment } from 'react';
import { getStandaloneInlineImage, splitInlineImageTokens } from '../utils/article-content.js';

export default function ArticleContent({ content, className = '' }) {
  const paragraphs = content
    .split(/\r?\n(?:[ \t]*\r?\n)+/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph) => paragraph.split(/\r?\n/));

  return (
    <div className={`article-content ${className}`.trim()}>
      {paragraphs.map((lines, paragraphIndex) => {
        const paragraph = lines.join('\n');
        const standaloneImage = getStandaloneInlineImage(paragraph);
        if (standaloneImage) {
          return (
            <img
              className="article-content-image"
              data-article-inline-image=""
              key={paragraphIndex}
              src={standaloneImage.url}
              alt={standaloneImage.alt || 'Article image'}
              loading="lazy"
            />
          );
        }

        return (
          <p key={paragraphIndex}>
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {splitInlineImageTokens(line).map((part, partIndex) => (
                  part.url
                    ? (
                      <img
                        className="article-content-image"
                        data-article-inline-image=""
                        key={partIndex}
                        src={part.url}
                        alt={part.alt || 'Article image'}
                        loading="lazy"
                      />
                    )
                    : <Fragment key={partIndex}>{part.text}</Fragment>
                ))}
                {lineIndex < lines.length - 1 && <br />}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
