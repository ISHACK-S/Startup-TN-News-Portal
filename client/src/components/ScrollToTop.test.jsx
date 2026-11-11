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
      <button onClick={() => navigate('/news/?category=startups')}>Startups</button>
      <button onClick={() => navigate('/news/?category=startups&city=chennai')}>Chennai</button>
      <button onClick={() => navigate('/news/?category=startups&city=coimbatore')}>Coimbatore</button>
      <button onClick={() => navigate('/news/?category=startups&city=coimbatore&page=2')}>Page two</button>
      <button onClick={() => navigate('/news/?q=local')}>Search</button>
      <button onClick={() => navigate(`/news/${article}`)}>Open article</button>
      <button onClick={() => {
        setArticle('second-story');
        navigate('/news/second-story');
      }}>Next article</button>
      <button onClick={() => navigate('/news/?q=local#top')}>Add hash</button>
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

  it('preserves scroll for category and city filter changes, including page reset', () => {
    const scrollTo = window.scrollTo;
    render(
      <MemoryRouter initialEntries={['/news/?category=funding&page=2']}>
        <NavigationHarness />
      </MemoryRouter>
    );
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Startups' }));
    expect(screen.getByText('/news/?category=startups')).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Chennai' }));
    expect(screen.getByText('/news/?category=startups&city=chennai')).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Coimbatore' }));
    expect(screen.getByText('/news/?category=startups&city=coimbatore')).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Page two' }));
    expect(screen.getByText('/news/?category=startups&city=coimbatore&page=2')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('resets for searches and preserves scroll for hash-only navigation', () => {
    const scrollTo = window.scrollTo;
    render(
      <MemoryRouter initialEntries={['/news/?category=funding']}>
        <NavigationHarness />
      </MemoryRouter>
    );
    scrollTo.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('/news/?q=local')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add hash' }));
    expect(screen.getByText('/news/?q=local#top')).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
