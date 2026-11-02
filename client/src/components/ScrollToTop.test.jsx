import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import ScrollToTop from './ScrollToTop.jsx';

function NavigationHarness() {
  const location = useLocation();
  const navigate = useNavigate();
  const [article, setArticle] = useState('first-story');

  return (
    <>
      <ScrollToTop />
      <output>{location.pathname}{location.search}{location.hash}</output>
      <button onClick={() => navigate('/news/')}>Latest news</button>
      <button onClick={() => navigate('/news/?category=funding')}>Funding</button>
      <button onClick={() => navigate(`/news/${article}`)}>Open article</button>
      <button onClick={() => {
        setArticle('second-story');
        navigate('/news/second-story');
      }}>Next article</button>
      <button onClick={() => navigate('/news/?category=funding#top')}>Add hash</button>
    </>
  );
}

describe('ScrollToTop', () => {
  afterEach(() => {
    cleanup();
    window.scrollTo.mockClear();
  });

  it('scrolls instantly on pathname changes, including article slug changes', () => {
    const scrollTo = window.scrollTo;
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavigationHarness />
      </MemoryRouter>
    );

    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' });
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Latest news' }));
    expect(screen.getByText('/news/')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open article' }));
    expect(screen.getByText('/news/first-story')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Next article' }));
    expect(screen.getByText('/news/second-story')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledTimes(3);
  });

  it('resets for query-only navigation and preserves scroll for hash-only navigation', () => {
    const scrollTo = window.scrollTo;
    render(
      <MemoryRouter initialEntries={['/news/']}>
        <NavigationHarness />
      </MemoryRouter>
    );
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Funding' }));
    expect(screen.getByText('/news/?category=funding')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add hash' }));
    expect(screen.getByText('/news/?category=funding#top')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
