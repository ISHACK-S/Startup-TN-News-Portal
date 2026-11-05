import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  exportAdminMonthlyActivityReport,
  getAdminActivityDetails,
  getAdminMonthlyActivityReport
} from '../../api/admin.js';
import AdminMonthlyReportsPage from './AdminMonthlyReportsPage.jsx';

vi.mock('../../api/admin.js', () => ({
  exportAdminMonthlyActivityReport: vi.fn(),
  getAdminActivityDetails: vi.fn(),
  getAdminMonthlyActivityReport: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const report = (changes = {}) => ({
  month: 11,
  year: 2026,
  summary: {
    totalActivities: 3,
    activeAdministrators: 2,
    contentActions: 1,
    accountActions: 1,
    websiteChanges: 0,
    securityEvents: 1
  },
  daily: [{ day: '2026-11-02', total: 2 }],
  modules: [{ module: 'news-articles', total: 1 }],
  actions: [{ action: 'article.published', total: 1 }],
  administrators: [{
    administratorId: '7',
    administratorName: 'Historical Name',
    email: 'history@example.com',
    role: 'Editor',
    actions: 2,
    mostRecentActivity: '2026-11-02T12:00:00.000Z'
  }],
  activities: {
    data: [{
      id: '18',
      administratorId: '7',
      administratorName: 'Historical Name',
      email: 'history@example.com',
      role: 'Editor',
      module: 'news-articles',
      action: 'article.published',
      description: 'Completed article published.',
      recordId: '31',
      occurredAt: '2026-11-02T12:00:00.000Z',
      status: 'success',
      changes: null,
      correlationId: '34a7c7f5-cc24-44df-b1aa-2fb0dfb774c1'
    }],
    pagination: { page: 1, limit: 25, total: 3, totalPages: 1, truncated: false }
  },
  ...changes
});

describe('monthly administrative reports page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminMonthlyActivityReport.mockResolvedValue(report());
    getAdminActivityDetails.mockResolvedValue({
      ...report().activities.data[0],
      changes: { before: { status: 'draft' }, after: { status: 'published' } }
    });
    exportAdminMonthlyActivityReport.mockResolvedValue(new Blob(['report']));
  });

  it('renders actual report summaries, filters and administrator-wise history', async () => {
    render(<AdminMonthlyReportsPage />);
    expect(await screen.findByText('Total activities')).toBeInTheDocument();
    expect(screen.getByText('3', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getAllByText('Historical Name').length).toBeGreaterThan(0);
    expect(screen.getAllByText('article.published').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by administrator' }), {
      target: { value: '7' }
    });
    await waitFor(() => expect(getAdminMonthlyActivityReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ adminId: '7', page: 1 }),
      expect.any(Object)
    ));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search activities' }), {
      target: { value: 'published' }
    });
    await waitFor(() => expect(getAdminMonthlyActivityReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'published', adminId: '7' }),
      expect.any(Object)
    ));
  });

  it('loads safe before/after details for an activity record', async () => {
    render(<AdminMonthlyReportsPage />);
    await screen.findByText('Completed article published.');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText(/"draft"/)).toBeInTheDocument();
    expect(getAdminActivityDetails).toHaveBeenCalledWith('18');
  });

  it('exports the active filters through authorized CSV and PDF downloads', async () => {
    const createObjectURL = vi.fn(() => 'blob:test-report');
    const revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const NativeURL = URL;
    class URLWithBlobSupport extends NativeURL {}
    URLWithBlobSupport.createObjectURL = createObjectURL;
    URLWithBlobSupport.revokeObjectURL = revokeObjectURL;
    vi.stubGlobal('URL', URLWithBlobSupport);
    render(<AdminMonthlyReportsPage />);
    await screen.findByText('Completed article published.');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), {
      target: { value: 'failure' }
    });
    await waitFor(() => expect(getAdminMonthlyActivityReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failure' }),
      expect.any(Object)
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(exportAdminMonthlyActivityReport).toHaveBeenCalledWith(
      'csv',
      expect.objectContaining({ status: 'failure' })
    ));
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));
    await waitFor(() => expect(exportAdminMonthlyActivityReport).toHaveBeenCalledWith(
      'pdf',
      expect.objectContaining({ status: 'failure' })
    ));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-report');
  });
});
