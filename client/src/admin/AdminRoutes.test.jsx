import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';

const categoryData = [
  { id: 1, name: 'Startups', slug: 'startups' },
  { id: 2, name: 'Funding', slug: 'funding' }
];
let sessionActive;
let storedArticles;
let nextArticleId;
let fetchMock;
let xhrRequest;

function apiResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function installApi() {
  sessionActive = false;
  nextArticleId = 3;
  storedArticles = [
    {
      id: 1,
      title: 'Published ecosystem update',
      slug: 'published-ecosystem-update',
      summary: 'A current public story.',
      content: 'Published story details.',
      cover_image_url: null,
      source_url: null,
      category_id: 1,
      category_name: 'Startups',
      category_slug: 'startups',
      author_name: 'Editor',
      admin_id: 4,
      status: 'published',
      is_featured: false,
      published_at: '2026-10-28T12:00:00.000Z',
      created_at: '2026-10-28T12:00:00.000Z',
      updated_at: '2026-10-28T12:00:00.000Z'
    },
    {
      id: 2,
      title: 'Unfinished programme announcement',
      slug: 'draft-programme-announcement',
      summary: 'A private draft summary.',
      content: 'Draft details.',
      cover_image_url: null,
      source_url: null,
      category_id: 2,
      category_name: 'Funding',
      category_slug: 'funding',
      author_name: 'Editor',
      admin_id: 4,
      status: 'draft',
      is_featured: false,
      published_at: null,
      created_at: '2026-10-27T12:00:00.000Z',
      updated_at: '2026-10-27T12:00:00.000Z'
    }
  ];

  fetchMock = vi.fn(async (input, options = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = options.method ?? 'GET';

    if (url.pathname === '/api/auth/me') {
      return apiResponse({
        data: {
          authenticated: sessionActive,
          admin: sessionActive ? { id: 4, name: 'Editorial Admin', email: 'editor@example.com' } : null
        }
      });
    }
    if (url.pathname === '/api/auth/login' && method === 'POST') {
      const credentials = JSON.parse(options.body);
      if (credentials.email !== 'editor@example.com' || credentials.password !== 'strong-password') {
        return apiResponse({ error: { message: 'Invalid email or password.' } }, 401);
      }
      sessionActive = true;
      return apiResponse({ data: { admin: { id: 4, name: 'Editorial Admin', email: credentials.email } } });
    }
    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      if (!sessionActive) return apiResponse({ error: { message: 'Authentication is required.' } }, 401);
      sessionActive = false;
      return apiResponse({ data: { loggedOut: true } });
    }
    if (url.pathname === '/api/categories') return apiResponse({ data: categoryData });
    if (!sessionActive && url.pathname.startsWith('/api/admin/')) {
      return apiResponse({ error: { message: 'Authentication is required.' } }, 401);
    }
    if (url.pathname === '/api/admin/articles' && method === 'GET') {
      let data = [...storedArticles];
      const status = url.searchParams.get('status');
      const query = url.searchParams.get('q')?.toLowerCase();
      if (status) data = data.filter((article) => article.status === status);
      if (query) data = data.filter((article) => `${article.title} ${article.summary}`.toLowerCase().includes(query));
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 10);
      return apiResponse({
        data: data.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total: data.length, totalPages: Math.ceil(data.length / limit) }
      });
    }
    const detailMatch = url.pathname.match(/^\/api\/admin\/articles\/(\d+)$/);
    if (detailMatch && method === 'GET') {
      const article = storedArticles.find((item) => item.id === Number(detailMatch[1]));
      return article
        ? apiResponse({ data: article })
        : apiResponse({ error: { message: 'Article not found.' } }, 404);
    }
    if (url.pathname === '/api/admin/articles' && method === 'POST') {
      const payload = JSON.parse(options.body);
      if (storedArticles.some((article) => article.slug === payload.slug)) {
        return apiResponse({ error: { message: 'An article with this slug already exists.' } }, 409);
      }
      const category = categoryData.find((item) => item.id === payload.category_id);
      const created = {
        ...payload,
        id: nextArticleId++,
        category_name: category.name,
        category_slug: category.slug,
        admin_id: 4,
        published_at: payload.status === 'published' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      storedArticles.unshift(created);
      return apiResponse({ data: created }, 201);
    }
    if (url.pathname === '/api/admin/articles/' && method === 'PATCH') {
      const { id, ...updates } = JSON.parse(options.body);
      const article = storedArticles.find((item) => item.id === id);
      if (!article) return apiResponse({ error: { message: 'Article not found.' } }, 404);
      Object.assign(article, updates);
      article.category_name = categoryData.find((item) => item.id === article.category_id).name;
      article.category_slug = categoryData.find((item) => item.id === article.category_id).slug;
      if (updates.status === 'draft') article.published_at = null;
      if (updates.status === 'published') article.published_at ??= new Date().toISOString();
      article.updated_at = new Date().toISOString();
      return apiResponse({ data: article });
    }
    if (url.pathname === '/api/admin/articles/' && method === 'DELETE') {
      const { id } = JSON.parse(options.body);
      const index = storedArticles.findIndex((item) => item.id === id);
      if (index < 0) return apiResponse({ error: { message: 'Article not found.' } }, 404);
      storedArticles.splice(index, 1);
      return apiResponse({ data: { deleted: true } });
    }
    return apiResponse({ error: { message: `Unhandled mock route ${method} ${url.pathname}` } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

class MockUploadRequest {
  constructor() {
    this.uploadListeners = {};
    this.listeners = {};
    this.upload = {
      addEventListener: (name, handler) => { this.uploadListeners[name] = handler; }
    };
    xhrRequest = this;
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name, value) {
    this.headers = { ...(this.headers ?? {}), [name]: value };
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }

  send(formData) {
    this.file = formData.get('image');
    this.uploadListeners.progress({ lengthComputable: true, loaded: this.file.size / 2, total: this.file.size });
    this.status = 201;
    this.responseText = JSON.stringify({
      data: {
        url: 'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/new.png',
        provider_id: 'startuptn-news/articles/new'
      }
    });
    this.uploadListeners.progress({ lengthComputable: true, loaded: this.file.size, total: this.file.size });
    this.listeners.load();
  }
}

function renderApp(path) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

async function signIn(user) {
  await user.type(await screen.findByLabelText('Email address'), 'editor@example.com');
  await user.type(screen.getByLabelText('Password'), 'strong-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  installApi();
  xhrRequest = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin CMS', () => {
  it('protects routes, verifies the session, logs in, and logs out', async () => {
    const user = userEvent.setup();
    renderApp('/admin/news');

    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ credentials: 'include' })
    );
    await signIn(user);
    expect(await screen.findByRole('heading', { name: 'Articles' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ credentials: 'include', method: 'POST' })
    );
  });

  it('shows dashboard draft and published counts from the API', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await signIn(user);

    expect(await screen.findByText('Published articles')).toBeInTheDocument();
    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Published ecosystem update')).toBeInTheDocument();
  });

  it('creates a persisted draft, previews current unsaved content, and publishes it', async () => {
    const user = userEvent.setup();
    renderApp('/admin/news/new');
    await signIn(user);

    await user.type(await screen.findByLabelText(/^Headline/), 'A founder builds for Tamil Nadu');
    expect(screen.getByLabelText(/^Article URL slug/)).toHaveValue('a-founder-builds-for-tamil-nadu');
    await user.type(screen.getByLabelText(/^Summary/), 'An editor-approved update for the ecosystem.');
    await user.type(screen.getByLabelText(/^Full article/), 'The full story, including verified details.');
    await user.type(screen.getByLabelText(/^Author name/), 'Editorial Desk');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('heading', { name: 'A founder builds for Tamil Nadu' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByText('The full story, including verified details.')
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close preview' }));

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Draft saved successfully.')).toBeInTheDocument();
    expect(storedArticles[0]).toMatchObject({
      title: 'A founder builds for Tamil Nadu',
      status: 'draft',
      published_at: null,
      admin_id: 4
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/articles',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: expect.stringContaining('"status":"draft"')
      })
    );

    await user.click(screen.getByRole('button', { name: 'Publish article' }));
    await waitFor(() => expect(storedArticles[0].status).toBe('published'));
    expect(storedArticles[0].published_at).toBeTruthy();
    expect(await screen.findByText('Article published successfully.')).toBeInTheDocument();
  }, 10000);

  it('uploads a validated image with session credentials and progress, then stores the hosted URL', async () => {
    vi.stubGlobal('XMLHttpRequest', MockUploadRequest);
    const NativeURL = globalThis.URL;
    vi.stubGlobal('URL', class MockURL extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:editor-preview');
      static revokeObjectURL = vi.fn();
    });
    const user = userEvent.setup();
    renderApp('/admin/news/new');
    await signIn(user);
    await screen.findByLabelText(/^Headline/);

    const image = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Choose cover image'), image);
    expect(await screen.findByText('Image uploaded and ready to save with this article.')).toBeInTheDocument();
    expect(xhrRequest).toMatchObject({
      method: 'POST',
      url: '/api/admin/uploads',
      withCredentials: true
    });
    expect(xhrRequest.file.name).toBe('cover.png');
    expect(screen.getByRole('img', { name: 'Cover image preview' })).toHaveAttribute('src', 'blob:editor-preview');

    await user.type(screen.getByLabelText(/^Headline/), 'Image-backed announcement');
    await user.type(screen.getByLabelText(/^Summary/), 'A summary');
    await user.type(screen.getByLabelText(/^Full article/), 'Article body');
    await user.type(screen.getByLabelText(/^Author name/), 'Editorial Desk');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(storedArticles[0].cover_image_url).toBe(
        'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/new.png'
      );
    });
  });

  it('searches, edits, unpublishes, confirms deletion, and deletes articles through the API', async () => {
    const user = userEvent.setup();
    renderApp('/admin/news');
    await signIn(user);
    expect(await screen.findByText('Published ecosystem update')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: /Search articles/ }), 'programme announcement');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Unfinished programme announcement')).toBeInTheDocument();
    expect(screen.queryByText('Published ecosystem update')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Unfinished programme announcement' }));
    expect(await screen.findByLabelText(/^Headline/)).toHaveValue('Unfinished programme announcement');
    await user.clear(screen.getByLabelText(/^Headline/));
    await user.type(screen.getByLabelText(/^Headline/), 'Programme update revised');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(storedArticles.find((article) => article.id === 2).title).toBe('Programme update revised');
    });

    await user.click(screen.getByRole('link', { name: 'Articles' }));
    await screen.findByText('Programme update revised');
    await user.click(
      within(screen.getByRole('row', { name: /Programme update revised/ }))
        .getByRole('button', { name: 'Publish' })
    );
    await waitFor(() => {
      expect(storedArticles.find((article) => article.id === 2).status).toBe('published');
    });
    expect(await screen.findByText('Article published successfully.')).toBeInTheDocument();

    const revisedArticleRow = screen.getByRole('row', { name: /Programme update revised/ });
    await user.click(within(revisedArticleRow).getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => {
      expect(storedArticles.find((article) => article.id === 2).status).toBe('draft');
    });
    expect(storedArticles.find((article) => article.id === 2).published_at).toBeNull();

    await user.click(
      within(screen.getByRole('row', { name: /Programme update revised/ }))
        .getByRole('button', { name: 'Delete' })
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent('permanently removed');
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete article' }));
    await waitFor(() => expect(storedArticles.some((article) => article.id === 2)).toBe(false));
    expect(await screen.findByText('Article deleted.')).toBeInTheDocument();
  });

  it('shows invalid credentials without granting access', async () => {
    const user = userEvent.setup();
    renderApp('/admin/login');
    await user.type(await screen.findByLabelText('Email address'), 'editor@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
  });
});
