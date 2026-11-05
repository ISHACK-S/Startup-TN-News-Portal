import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { getFeaturedPublicVideo, getPublicVideo, getPublicVideoCategories, getPublicVideos } from '../api/news.js';
import HomeVideosSection from '../components/HomeVideosSection.jsx';
import VideoPage from './VideoPage.jsx';
import VideosPage from './VideosPage.jsx';

vi.mock('../api/news.js', () => ({
  getFeaturedPublicVideo: vi.fn(),
  getPublicVideo: vi.fn(),
  getPublicVideoCategories: vi.fn(),
  getPublicVideos: vi.fn()
}));

afterEach(() => cleanup());

const makeVideo = (id, changes = {}) => ({
  id,
  title: `Video ${id}`,
  description: 'A real newsroom video description.',
  category: 'Interviews',
  status: 'published',
  published_at: '2026-10-20T10:00:00.000Z',
  thumbnail_url: `https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg`,
  thumbnail_alt: '',
  embed_url: 'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0',
  watch_url: 'https://www.youtube.com/watch?v=abcdefghijk',
  ...changes
});

function renderVideoRoute(element) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('public video pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the featured video and published cards without loading iframe players until clicked', async () => {
    const videos = [makeVideo(1), makeVideo(2)];
    getPublicVideos.mockResolvedValue({ data: videos, pagination: { page: 1, totalPages: 1 } });
    getFeaturedPublicVideo.mockResolvedValue(makeVideo(1, { title: 'Featured interview' }));
    getPublicVideoCategories.mockResolvedValue(['Interviews', 'Events']);

    renderVideoRoute(<VideosPage />);

    expect(await screen.findByText('Featured interview')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Video 1' })).toHaveAttribute('href', '/videos/1');
    expect(document.querySelector('iframe')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play Featured interview' }));
    expect(document.querySelector('iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0');
    expect(getPublicVideos).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 12, category: '' }));
  });

  it('filters published videos by the selected category', async () => {
    getPublicVideos.mockResolvedValue({ data: [makeVideo(1)], pagination: { page: 1, totalPages: 1 } });
    getFeaturedPublicVideo.mockResolvedValue(null);
    getPublicVideoCategories.mockResolvedValue(['Interviews', 'Events']);

    renderVideoRoute(<VideosPage />);
    await screen.findByText('Video 1');
    fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'Events' } });

    await waitFor(() => expect(getPublicVideos).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: 'Events', page: 1 })
    ));
  });

  it('opens a published video detail page and loads related entries', async () => {
    getPublicVideo.mockResolvedValue(makeVideo(1, { title: 'Founder conversation' }));
    getPublicVideos.mockResolvedValue({ data: [makeVideo(1), makeVideo(2)], pagination: { page: 1, totalPages: 1 } });

    render(<MemoryRouter initialEntries={['/videos/1']}><Routes>
      <Route path="/videos/:id" element={<VideoPage />} />
    </Routes></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Founder conversation' })).toBeInTheDocument();
    expect(getPublicVideos).toHaveBeenCalledWith(expect.objectContaining({ category: 'Interviews', limit: 12 }));
    expect(await screen.findByRole('link', { name: 'Video 2' })).toHaveAttribute('href', '/videos/2');
  });
});

describe('homepage video section', () => {
  it('renders no more than three linked video thumbnails and no iframes', async () => {
    getPublicVideos.mockResolvedValue({
      data: [makeVideo(1), makeVideo(2), makeVideo(3), makeVideo(4)],
      pagination: { page: 1, totalPages: 1 }
    });

    renderVideoRoute(<HomeVideosSection />);

    expect(await screen.findByRole('heading', { name: 'Videos' })).toBeInTheDocument();
    expect(document.querySelectorAll('.home-video-card')).toHaveLength(3);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
    expect(screen.getByRole('link', { name: /View all videos/ })).toHaveAttribute('href', '/videos');
  });
});
