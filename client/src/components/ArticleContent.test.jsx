import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ArticleContent from './ArticleContent.jsx';
import { isAllowedInlineImageUrl } from '../utils/article-content.js';

const imageUrl = (name) => `https://res.cloudinary.com/startuptn/image/upload/articles/${name}.png`;

describe('ArticleContent', () => {
  it('renders existing plain text as paragraphs and preserves line breaks', () => {
    const { container } = render(
      <ArticleContent content={'First paragraph.\nsecond line.\n\nSecond paragraph.'} />
    );
    const paragraphs = container.querySelectorAll('.article-content > p');

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent('First paragraph.second line.');
    expect(paragraphs[0].querySelector('br')).toBeInTheDocument();
    expect(paragraphs[1]).toHaveTextContent('Second paragraph.');
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('renders an inline image between its surrounding paragraphs', () => {
    const { container } = render(
      <ArticleContent
        content={`First paragraph.\n\n![Article image](${imageUrl('middle')})\n\nSecond paragraph.`}
      />
    );
    const content = container.firstElementChild;

    expect(content.children).toHaveLength(3);
    expect(content.children[0]).toHaveTextContent('First paragraph.');
    expect(content.children[1]).toHaveAttribute('data-article-inline-image', '');
    expect(content.children[1]).toHaveAttribute('src', imageUrl('middle'));
    expect(content.children[2]).toHaveTextContent('Second paragraph.');
  });

  it.each([
    ['portrait poster', 'poster'],
    ['square image', 'square'],
    ['landscape photograph', 'landscape'],
    ['wide banner', 'banner'],
    ['tall infographic', 'infographic']
  ])('leaves intrinsic dimensions unconstrained for a %s', (_description, name) => {
    const { container } = render(
      <ArticleContent content={`![${name}](${imageUrl(name)})`} />
    );
    const image = container.querySelector('img');

    expect(image).toHaveAttribute('src', imageUrl(name));
    expect(image).not.toHaveAttribute('width');
    expect(image).not.toHaveAttribute('height');
    expect(image).toHaveClass('article-content-image');
  });

  it('renders multiple images at their respective positions', () => {
    const { container } = render(
      <ArticleContent
        content={`First.\n\n![First image](${imageUrl('one')})\n\nMiddle.\n\n![Second image](${imageUrl('two')})\n\nLast.`}
      />
    );

    expect([...container.firstElementChild.children].map((element) => (
      element.matches('img') ? element.getAttribute('src') : element.textContent
    ))).toEqual([
      'First.',
      imageUrl('one'),
      'Middle.',
      imageUrl('two'),
      'Last.'
    ]);
  });

  it('keeps malformed and unsafe image markup as text', () => {
    const unsafeMarkup = '![unsafe](javascript:alert(1))';
    const { container } = render(<ArticleContent content={unsafeMarkup} />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container).toHaveTextContent(unsafeMarkup);
    expect(isAllowedInlineImageUrl('https://example.com/image.png')).toBe(false);
    expect(isAllowedInlineImageUrl('http://res.cloudinary.com/name/image/upload/a.png')).toBe(false);
    expect(isAllowedInlineImageUrl('https://res.cloudinary.com.evil.example/name/image/upload/a.png')).toBe(false);
    expect(isAllowedInlineImageUrl('https://user@res.cloudinary.com/name/image/upload/a.png')).toBe(false);
    expect(isAllowedInlineImageUrl(imageUrl('valid'))).toBe(true);
  });

  it('does not interpret arbitrary stored HTML', () => {
    const { container } = render(
      <ArticleContent content={'<img src=x onerror="alert(1)">'} />
    );

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)">');
  });
});
