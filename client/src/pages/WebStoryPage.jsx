import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicWebStory } from '../api/news.js';
import { ErrorState } from '../components/NewsStates.jsx';

export default function WebStoryPage() {
  const { t: tI18n } = useTranslation('public');
  const { slug } = useParams();
  const [story, setStory] = useState(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getPublicWebStory(slug, { signal: controller.signal })
      .then((result) => { setStory(result); setIndex(0); setError(""); })
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug]);

  const move = useCallback((direction) => setIndex((current) => Math.min(
    Math.max(current + direction, 0), (story?.slides?.length ?? 1) - 1
  )), [story?.slides?.length]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  if (loading) return <div className="site-shell public-content-loading" role="status">{tI18n("Loading story…", { defaultValue: "Loading story…" })}</div>;
  if (error || !story) return <div className="site-shell public-story-error"><ErrorState message={error || 'Web story not found.'} /><Link className="text-link" to="/stories">{tI18n("Back to Web Stories", { defaultValue: "Back to Web Stories" })}</Link></div>;
  const slide = story.slides[index];
  if (!slide) return <div className="site-shell public-story-error"><p>{tI18n("This story has no published slides.", { defaultValue: "This story has no published slides." })}</p><Link to="/stories">{tI18n("Back to Web Stories", { defaultValue: "Back to Web Stories" })}</Link></div>;
  return (
    <article className="public-story-viewer" aria-label={story.title}>
      <header><Link className="text-link" to="/stories">{tI18n("← All Web Stories", { defaultValue: "← All Web Stories" })}</Link><h1>{story.title}</h1><p>{story.description}</p></header>
      <div className="public-story-frame">
        <img src={slide.image_url} alt={slide.alt_text} />
        {slide.caption && <p>{slide.caption}</p>}
        {slide.link_url && <a className="button button--gold" href={slide.link_url} target="_blank" rel="noopener noreferrer">{tI18n("Read more ↗", { defaultValue: "Read more ↗" })}</a>}
      </div>
      <nav className="public-story-controls" aria-label={tI18n("Story slides", { defaultValue: "Story slides" })}>
        <button type="button" className="button button--outline" onClick={() => move(-1)} disabled={index === 0} aria-label={tI18n("Previous slide", { defaultValue: "Previous slide" })}>{tI18n("Previous", { defaultValue: "Previous" })}</button>
        <span aria-live="polite">{tI18n("Slide", { defaultValue: "Slide" })} {index + 1} {tI18n("of", { defaultValue: "of" })} {story.slides.length}</span>
        <button type="button" className="button button--outline" onClick={() => move(1)} disabled={index >= story.slides.length - 1} aria-label={tI18n("Next slide", { defaultValue: "Next slide" })}>{tI18n("Next", { defaultValue: "Next" })}</button>
      </nav>
      <div className="public-story-indicators" role="group" aria-label={tI18n("Choose slide", { defaultValue: "Choose slide" })}>
        {story.slides.map((entry, slideIndex) => <button key={entry.position} type="button" aria-label={`Go to slide ${slideIndex + 1}`} aria-current={slideIndex === index ? 'step' : undefined} onClick={() => setIndex(slideIndex)} />)}
      </div>
    </article>
  );
}
