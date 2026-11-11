import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../App.jsx';
import { DEFAULT_PUBLIC_WEBSITE_CONFIGURATION } from '../config/public-site-defaults.js';

const categories = [
  { id: 1, name: 'Startups', slug: 'startups' },
  { id: 2, name: 'Funding', slug: 'funding' }
];
const startupCities = [
  { id: 1, name: 'Chennai', slug: 'chennai' },
  { id: 2, name: 'Coimbatore', slug: 'coimbatore' },
  { id: 3, name: 'Madurai', slug: 'madurai' },
  { id: 4, name: 'Trichy', slug: 'trichy' },
  { id: 5, name: 'Salem', slug: 'salem' },
  { id: 6, name: 'Erode', slug: 'erode' },
  { id: 7, name: 'Tirunelveli', slug: 'tirunelveli' },
  { id: 8, name: 'Cuddalore', slug: 'cuddalore' },
  { id: 9, name: 'Tanjore', slug: 'tanjore' },
  { id: 10, name: 'Hosur', slug: 'hosur' }
];

const articles = [
  {
    id: 11,
    title: 'Tamil Nadu founders build what comes next',
    slug: 'tn-founders-next',
    summary: 'A new generation of founders is creating technology for local needs.',
    content: 'Full story about founders.\n\nSecond paragraph with a deliberate line break:\ncontinued text.\n\n\nThird paragraph after extra blank lines.',
    category_id: 1,
    category_name: 'Startups',
    category_slug: 'startups',
    author_name: 'StartupTN News',
    cover_image_url: null,
    source_url: 'https://example.com/source',
    is_featured: false,
    published_at: '2026-10-28T10:00:00.000Z',
    created_at: '2026-10-28T10:00:00.000Z'
  },
  {
    id: 12,
    title: 'Local venture closes a new funding round',
    slug: 'venture-funding-round',
    summary: 'Investors back a growing business in the region.',
    content: 'Funding details.',
    category_id: 2,
    category_name: 'Funding',
    category_slug: 'funding',
    author_name: 'StartupTN News',
    cover_image_url: null,
    source_url: null,
    is_featured: false,
    published_at: '2026-10-27T10:00:00.000Z',
    created_at: '2026-10-27T10:00:00.000Z'
  }
];

function installApiMock(newsArticles = articles) {
  const jsonResponse = (payload, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  });
  const fetchMock = vi.fn(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/categories') {
      return jsonResponse({ data: categories });
    }
    if (url.pathname === '/api/startup-cities') {
      return jsonResponse({ data: startupCities });
    }
    if (url.pathname === '/api/site-config') {
      return jsonResponse({ data: DEFAULT_PUBLIC_WEBSITE_CONFIGURATION });
    }
    if (url.pathname === '/api/news/tn-founders-next') {
      return jsonResponse({ data: articles[0] });
    }
    if (url.pathname === '/api/news/hidden-draft') {
      return jsonResponse({ error: { message: 'Article not found.' } }, 404);
    }
    if (url.pathname === '/api/news') {
      let filtered = [...newsArticles];
      const q = url.searchParams.get('q')?.toLowerCase();
      const category = url.searchParams.get('category');
      const city = url.searchParams.get('city');
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 9);
      if (q) {
        filtered = filtered.filter((article) =>
          `${article.title} ${article.summary}`.toLowerCase().includes(q)
        );
      }
      if (category) filtered = filtered.filter((article) => article.category_slug === category);
      if (city) filtered = filtered.filter((article) => article.startup_city_slug === city);
      const total = filtered.length;
      return jsonResponse({
        data: filtered.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total,
          totalPages: q ? Math.ceil(total / limit) : Math.max(total ? 2 : 0, Math.ceil(total / limit))
        }
      });
    }
    return jsonResponse({ error: { message: 'Not found' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('public news experience', () => {
  it('builds the homepage lead, ticker, and category sections from API stories', async () => {
    installApiMock();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    expect((await screen.findAllByRole('heading', { name: articles[0].title })).length).toBeGreaterThan(0);
    const featuredHero = document.querySelector('.front-page-lead-main');
    expect(featuredHero.querySelector('.eyebrow')).toBeNull();
    expect(featuredHero.querySelector('.article-meta')).toBeNull();
    expect(within(featuredHero).getByRole('heading', { name: articles[0].title })).toBeInTheDocument();
    expect(within(featuredHero).getByRole('link', { name: /Read the story/ })).toHaveAttribute(
      'href',
      `/news/${articles[0].slug}`
    );
    expect(screen.getByRole('navigation', { name: 'Recent headlines' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: articles[1].title }).some((link) =>
      link.getAttribute('href') === `/news/${articles[1].slug}`
    )).toBe(true);
    expect(screen.getByRole('heading', { name: 'Latest news' })).toBeInTheDocument();
    expect(document.querySelector('.featured-copy p')).toBeNull();
    expect(document.querySelector('.home-ticker-band')).toBeInTheDocument();
    expect(document.querySelector('.edition-strip')).not.toBeInTheDocument();
    const latestSection = document.querySelector('.latest-section');
    expect(latestSection).not.toHaveClass('latest-section--empty');
    expect(within(latestSection).getByRole('link', { name: articles[1].title })).toHaveAttribute(
      'href',
      `/news/${articles[1].slug}`
    );
    expect(within(latestSection).getByText(articles[1].summary)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Startups' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Funding' })).toBeInTheDocument();
    expect(document.querySelectorAll('.category-story-grid--single')).toHaveLength(2);
  });

  it('shows the ten newest published stories in the More Headlines panel across API pages', async () => {
    const recentStories = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, index + 2)).toISOString();
      return {
        ...articles[0],
        id: 100 + index,
        title: `Recent story ${String(index + 1).padStart(2, '0')}`,
        slug: `recent-story-${index + 1}`,
        is_featured: false,
        published_at: date,
        created_at: date
      };
    });
    const pinnedFeaturedStories = Array.from({ length: 51 }, (_, index) => ({
      ...articles[0],
      id: 200 + index,
      title: `Older featured story ${index + 1}`,
      slug: `older-featured-story-${index + 1}`,
      is_featured: true,
      published_at: new Date(Date.UTC(2025, 0, index + 1)).toISOString()
    }));
    const fetchMock = installApiMock([...pinnedFeaturedStories, ...recentStories.slice().reverse()]);
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    const headlineList = await screen.findByRole('heading', { name: 'More headlines' });
    const list = headlineList.closest('.lead-support').querySelector('.lead-support-list');
    const titles = [...list.querySelectorAll('.supporting-story-copy h3 a')].map((link) => link.textContent);

    expect(titles).toEqual(
      Array.from({ length: 10 }, (_, index) => `Recent story ${String(12 - index).padStart(2, '0')}`)
    );
    expect(list.querySelectorAll('.supporting-story')).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object));
  });

  it('keeps More Headlines moving while hovered and loops without a gap', async () => {
    let resize;
    let frameId = 0;
    const frames = new Map();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
    const tick = (timestamp) => act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(timestamp));
    });

    installApiMock();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    const panel = await screen.findByRole('heading', { name: 'More headlines' })
      .then((heading) => heading.closest('.lead-support'));
    const list = panel.querySelector('.lead-support-list');
    const styles = await import('../styles.css?raw');
    expect(styles.default).toMatch(/\.lead-support-list\s*\{[^}]*scroll-behavior:\s*auto/s);
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(list.firstElementChild, 'offsetHeight', { configurable: true, value: 300 });
    let fractionalScrollPosition = 0;
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      get: () => Math.round(fractionalScrollPosition / 1.6) * 1.6,
      set: (value) => { fractionalScrollPosition = value; }
    });
    act(() => resize());
    expect(list.querySelectorAll('.lead-support-sequence')).toHaveLength(2);

    tick(1000);
    for (let timestamp = 1016; timestamp <= 1320; timestamp += 16) tick(timestamp);
    expect(list.scrollTop).toBeGreaterThan(0);

    fireEvent.mouseEnter(panel);
    const hoveredAt = list.scrollTop;
    tick(2320);
    expect(list.scrollTop).toBeGreaterThan(hoveredAt);
    fireEvent.mouseMove(panel);
    const afterMouseMove = list.scrollTop;
    tick(3320);
    expect(list.scrollTop).toBeGreaterThan(afterMouseMove);

    tick(20000);
    expect(list.scrollTop).toBeGreaterThanOrEqual(0);
    expect(list.scrollTop).toBeLessThan(300);
    tick(127000);
    expect(list.scrollTop).toBeGreaterThanOrEqual(0);
    expect(list.scrollTop).toBeLessThan(300);
  });

  it('lets native wheel scrolling take control and resumes from that position after three idle seconds', async () => {
    let resize;
    let frameId = 0;
    const frames = new Map();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
    const tick = (timestamp) => act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(timestamp));
    });

    installApiMock();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    const list = await screen.findByRole('region', { name: 'More headlines list' });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(list.firstElementChild, 'offsetHeight', { configurable: true, value: 300 });
    act(() => resize());
    tick(1000);
    tick(2000);

    let resume;
    const originalSetTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation((callback, delay) => {
      if (delay === 3000) {
        resume = callback;
        return 123456;
      }
      return originalSetTimeout(callback, delay);
    });
    const wheel = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
    list.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(false);
    list.scrollTop = 80;
    const manualPosition = list.scrollTop;
    tick(2500);
    expect(list.scrollTop).toBe(manualPosition);
    act(() => resume());
    tick(4000);
    expect(list.scrollTop).toBe(manualPosition);
    tick(5000);
    expect(list.scrollTop).toBeGreaterThan(manualPosition);

    list.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
    list.dispatchEvent(new Event('touchmove', { bubbles: true, cancelable: true }));
    list.scrollTop = 140;
    const swipePosition = list.scrollTop;
    tick(6000);
    expect(list.scrollTop).toBe(swipePosition);
    act(() => resume());
    tick(7000);
    expect(list.scrollTop).toBe(swipePosition);
    tick(8000);
    expect(list.scrollTop).toBeGreaterThan(swipePosition);
  });

  it('does not auto-scroll or duplicate headlines when reduced motion is preferred', async () => {
    let resize;
    const frames = new Map();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    let frameId = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    }));
    vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));

    installApiMock();
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    const panel = await screen.findByRole('heading', { name: 'More headlines' })
      .then((heading) => heading.closest('.lead-support'));
    const list = panel.querySelector('.lead-support-list');
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(list.firstElementChild, 'offsetHeight', { configurable: true, value: 300 });
    act(() => resize());

    expect(list.querySelectorAll('.lead-support-sequence')).toHaveLength(1);
    const initialScrollTop = list.scrollTop;
    act(() => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(1000));
    });
    expect(list.scrollTop).toBe(initialScrollTop);
    list.scrollTop = 40;
    expect(list.scrollTop).toBe(40);
  });

  it('keeps the latest ticker and More Headlines empty state when no stories are published', async () => {
    installApiMock([]);
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    expect(await screen.findByLabelText('No published stories')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Recent headlines' })).toBeInTheDocument();
    expect(document.querySelector('.edition-strip')).not.toBeInTheDocument();
    expect(document.querySelector('.lead-support')).not.toBeInTheDocument();
  });

  it('balances primary and secondary three-story category sections', async () => {
    const startupStories = [
      ...articles.filter((article) => article.category_slug === 'startups'),
      {
        ...articles[0],
        id: 13,
        title: 'A third StartupTN story',
        slug: 'third-startup-story'
      },
      {
        ...articles[0],
        id: 14,
        title: 'A fourth StartupTN story',
        slug: 'fourth-startup-story'
      },
      ...articles.filter((article) => article.category_slug === 'funding'),
      {
        ...articles[1],
        id: 15,
        title: 'A second Funding story',
        slug: 'second-funding-story'
      },
      {
        ...articles[1],
        id: 16,
        title: 'A third Funding story',
        slug: 'third-funding-story'
      }
    ];
    installApiMock(startupStories);
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);

    await screen.findAllByRole('heading', { name: 'A fourth StartupTN story' });
    const leadGrid = document.querySelector('.category-section--lead .category-story-grid');
    expect(leadGrid).not.toHaveClass('category-story-grid--double');
    expect(leadGrid.querySelectorAll('.story-card--featured')).toHaveLength(1);
    expect(leadGrid.querySelectorAll('.story-card')).toHaveLength(3);

    const secondarySection = document.querySelectorAll('.category-section')[1];
    expect(secondarySection).toHaveClass('category-section--wide');
    expect(secondarySection.querySelectorAll('.story-card')).toHaveLength(3);
  });

  it('shows loading skeletons while news are pending', async () => {
    let resolveRequest;
    vi.stubGlobal('fetch', vi.fn((input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/site-config') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: DEFAULT_PUBLIC_WEBSITE_CONFIGURATION })
        });
      }
      if (url.pathname === '/api/categories') {
        return Promise.resolve({ ok: true, json: async () => ({ data: categories }) });
      }
      return new Promise((resolve) => { resolveRequest = resolve; });
    }));
    render(<MemoryRouter initialEntries={['/news/']}><App /></MemoryRouter>);

    expect(screen.getByLabelText('Loading news')).toBeInTheDocument();
    resolveRequest({
      ok: true,
      json: async () => ({
      data: articles,
      pagination: { page: 1, limit: 9, total: 2, totalPages: 1 }
      })
    });
    expect(await screen.findByText(articles[0].title)).toBeInTheDocument();
  });

  it('filters by category and searches headline and summary through the API', async () => {
    const fetchMock = installApiMock();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/news/']}><App /></MemoryRouter>);

    expect(await screen.findByText(articles[0].title)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Funding' }));
    expect(await screen.findByText(articles[1].title)).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(navigation).getByRole('link', { name: 'Funding' })).toHaveClass('active');
    expect(within(navigation).getByRole('link', { name: 'Funding' })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: 'Latest news' })).not.toHaveClass('active');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('category=funding'),
        expect.any(Object)
      );
    });

    await user.click(screen.getByRole('button', { name: 'All stories' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search by headline or summary' }), 'local needs');
    await user.click(within(screen.getByRole('searchbox', { name: 'Search by headline or summary' }).closest('form')).getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(articles[0].title)).toBeInTheDocument();
    expect(screen.queryByText(articles[1].title)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('q=local+needs'), expect.any(Object));
  });

  it('filters Startup stories by city through the public news API and keeps unassigned stories in All Categories', async () => {
    const startupStories = [
      { ...articles[0], startup_city_id: null, startup_city_slug: null },
      {
        ...articles[0],
        id: 13,
        title: 'Chennai startup report',
        slug: 'chennai-startup-report',
        startup_city_id: 1,
        startup_city_slug: 'chennai'
      },
      {
        ...articles[0],
        id: 14,
        title: 'Coimbatore startup report',
        slug: 'coimbatore-startup-report',
        startup_city_id: 2,
        startup_city_slug: 'coimbatore'
      }
    ];
    const fetchMock = installApiMock(startupStories);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/news/?category=startups']}><App /></MemoryRouter>);

    const cityNavigation = await screen.findByRole('navigation', { name: 'Filter by Startup city' });
    expect(within(cityNavigation).getByRole('button', { name: 'All Categories' })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Chennai startup report')).toBeInTheDocument();
    expect(screen.getByText('Coimbatore startup report')).toBeInTheDocument();
    expect(screen.getByText(startupStories[0].title)).toBeInTheDocument();

    await user.click(within(cityNavigation).getByRole('button', { name: 'Chennai' }));
    expect(await screen.findByText('Chennai startup report')).toBeInTheDocument();
    expect(screen.queryByText('Coimbatore startup report')).not.toBeInTheDocument();
    expect(screen.queryByText(startupStories[0].title)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('city=chennai'),
        expect.any(Object)
      );
    });

    await user.click(within(cityNavigation).getByRole('button', { name: 'Coimbatore' }));
    expect(await screen.findByText('Coimbatore startup report')).toBeInTheDocument();
    expect(screen.queryByText('Chennai startup report')).not.toBeInTheDocument();

    await user.click(within(cityNavigation).getByRole('button', { name: 'Madurai' }));
    expect(await screen.findByText('No stories match those filters.')).toBeInTheDocument();

    await user.click(within(cityNavigation).getByRole('button', { name: 'All Categories' }));
    expect(await screen.findByText(startupStories[0].title)).toBeInTheDocument();
    expect(screen.getByText('Chennai startup report')).toBeInTheDocument();
    expect(screen.getByText('Coimbatore startup report')).toBeInTheDocument();
  });

  it('navigates to a published article and renders attribution and share links', async () => {
    installApiMock();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/news/']}><App /></MemoryRouter>);
    await user.click(await screen.findByRole('link', { name: articles[0].title }));

    expect(await screen.findByRole('heading', { name: articles[0].title })).toBeInTheDocument();
    expect(document.querySelector('.article-cover')).toBeInTheDocument();
    expect(document.querySelector('.article-body')).toBeInTheDocument();
    expect(screen.getByText('Full story about founders.')).toBeInTheDocument();
    const articleContent = document.querySelector('.article-content');
    expect(articleContent.querySelectorAll(':scope > p')).toHaveLength(3);
    expect(articleContent.querySelectorAll('p')[1].querySelector('br')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: articles[0].source_url })).toHaveAttribute('href', articles[0].source_url);
    expect(screen.getByRole('link', { name: 'Share on LinkedIn' })).toHaveAttribute(
      'href',
      expect.stringContaining('linkedin.com/sharing')
    );
  });

  it('does not render a draft when the API reports it as unavailable', async () => {
    installApiMock();
    render(
      <MemoryRouter initialEntries={['/news/hidden-draft']}>
        <Routes>
          <Route path="*" element={<App />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText('Article not found.')).toBeInTheDocument();
    expect(screen.queryByText('Hidden draft')).not.toBeInTheDocument();
  });

  it('shows a real empty state when the published feed is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [],
        pagination: { page: 1, limit: 9, total: 0, totalPages: 0 }
      })
    })));
    render(<MemoryRouter initialEntries={['/news/']}><App /></MemoryRouter>);
    expect(await screen.findByText('The newsroom is getting ready.')).toBeInTheDocument();
  });

  it('moves through paginated results without losing filters', async () => {
    const fetchMock = installApiMock();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/news/?category=startups']}><App /></MemoryRouter>);
    await screen.findByText(articles[0].title);
    await user.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('category=startups'),
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.any(Object)
      );
    });
  });

  it('uses a responsive single-column layout on narrow viewports', async () => {
    installApiMock();
    render(<MemoryRouter initialEntries={['/news/']}><App /></MemoryRouter>);
    await screen.findByText(articles[0].title);
    const source = await import('../styles.css?raw');
    expect(source.default).toContain('@media (max-width: 600px)');
    expect(source.default).toMatch(/\.story-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Latest news' })).toBeInTheDocument();
  });
});
