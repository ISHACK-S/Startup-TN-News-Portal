import { describe, expect, it } from 'vitest';
import { getYouTubeEmbedUrl, getYouTubeThumbnailUrl, getYouTubeVideoId } from './youtube.js';

describe('YouTube URL helpers', () => {
  it.each([
    'https://www.youtube.com/watch?v=abcdefghijk',
    'https://youtu.be/abcdefghijk',
    'https://www.youtube.com/shorts/abcdefghijk',
    'https://www.youtube.com/embed/abcdefghijk'
  ])('extracts IDs from supported URLs: %s', (url) => {
    expect(getYouTubeVideoId(url)).toBe('abcdefghijk');
    expect(getYouTubeEmbedUrl(url)).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0');
    expect(getYouTubeThumbnailUrl(url)).toBe('https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
  });

  it.each([
    'https://youtube.com.evil.example/watch?v=abcdefghijk',
    'http://youtube.com/watch?v=abcdefghijk',
    'https://youtube.com/watch?v=short',
    'https://vimeo.com/1234567'
  ])('rejects unsupported or unsafe video URLs: %s', (url) => {
    expect(getYouTubeVideoId(url)).toBeNull();
    expect(getYouTubeEmbedUrl(url)).toBe('');
    expect(getYouTubeThumbnailUrl(url)).toBe('');
  });
});
