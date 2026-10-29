import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../App.jsx';

const categories = [
  { id: 1, name: 'Startups', slug: 'startups' },
  { id: 2, name: 'Funding', slug: 'funding' }
];

const articles = [
  {
    id: 11,
    title: 'Tamil Nadu founders build what comes next',
    slug: 'tn-founders-next',
    summary: 'A new generation of founders is creating technology for local needs.',
    content: 'Full story about founders.',
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

function installApiMock() {
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
    if (url.pathname === '/api/news/tn-founders-next') {
      return jsonResponse({ data: articles[0] });
    }
    if (url.pathname === '/api/news/hidden-draft') {
      return jsonResponse({ error: { message: 'Article not found.' } }, 404);
    }
    if (url.pathname === '/api/news') {
      let filtered = [...articles];
      const q = url.searchParams.get('q')?.toLowerCase();
      const category = url.searchParams.get('category');
      if (q) {
        filtered = filtered.filter((article) =>
          `${article.title} ${article.summary}`.toLowerCase().includes(q)
        );
      }
      if (category) filtered = filtered.filter((article) => article.category_slug === category);
      return jsonResponse({
        data: filtered,
        pagination: {
          page: Number(url.searchParams.get('page') ?? 1),
          limit: 9,
          total: filtered.length,
          totalPages: q ? 1 : 2
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
  vi.unstubAllGlobals();
});

describe('public news experience', () => {
  it('shows loading skeletons while news are pending', async () => {
    let resolveRequest;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveRequest = resolve; })));
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

  it('navigates to a published article and renders attribution and share links', async () => {
    installApiMock();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/news/']}><App /></MemoryRouter>);
    await user.click(await screen.findByRole('link', { name: articles[0].title }));

    expect(await screen.findByRole('heading', { name: articles[0].title })).toBeInTheDocument();
    expect(screen.getByText('Full story about founders.')).toBeInTheDocument();
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
