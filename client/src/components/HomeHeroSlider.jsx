import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function HomeHeroSlider({ slides }) {
  const { t: tI18n } = useTranslation('public');
  const [index, setIndex] = useState(0);
  if (!slides.length) return null;
  const slide = slides[index];
  const content = (
    <>
      <img className="featured-image" src={slide.image_url} alt={slide.alt_text} fetchPriority={index === 0 ? 'high' : 'auto'} />
      <div className="featured-copy">
        <span className="eyebrow eyebrow--gold">{tI18n("Featured", { defaultValue: "Featured" })}</span>
        <span className="article-meta">{index + 1} {tI18n("/", { defaultValue: "/" })} {slides.length}</span>
        <h1 id="featured-heading">{slide.title}</h1>
        {slide.description && <p>{slide.description}</p>}
        {slide.article_slug && <span className="button button--gold">{tI18n("Read the story", { defaultValue: "Read the story" })} <span aria-hidden="true">{tI18n("↗", { defaultValue: "↗" })}</span></span>}
      </div>
    </>
  );
  const href = slide.article_slug ? `/news/${encodeURIComponent(slide.article_slug)}` : slide.destination_url;

  return (
    <section className="front-page-lead-main home-hero-slider" aria-roledescription="carousel" aria-label={tI18n("Featured stories", { defaultValue: "Featured stories" })}>
      {href ? slide.article_slug
        ? <Link className="featured-image-link" to={href} aria-label={`Read featured story: ${slide.title}`}>{content}</Link>
        : <a className="featured-image-link" href={href} rel="noopener noreferrer">{content}</a>
        : <div className="featured-image-link">{content}</div>}
      {slides.length > 1 && <div className="home-hero-controls">
        <button type="button" aria-label={tI18n("Previous featured slide", { defaultValue: "Previous featured slide" })} onClick={() => setIndex((value) => (value - 1 + slides.length) % slides.length)}>{tI18n("←", { defaultValue: "←" })}</button>
        <span aria-live="polite">{index + 1} {tI18n("/", { defaultValue: "/" })} {slides.length}</span>
        <button type="button" aria-label={tI18n("Next featured slide", { defaultValue: "Next featured slide" })} onClick={() => setIndex((value) => (value + 1) % slides.length)}>{tI18n("→", { defaultValue: "→" })}</button>
        <div className="home-hero-indicators" role="group" aria-label={tI18n("Choose featured slide", { defaultValue: "Choose featured slide" })}>
          {slides.map((entry, dot) => <button key={entry.id} type="button" aria-label={`Show featured slide ${dot + 1}`} aria-current={index === dot ? 'true' : undefined} onClick={() => setIndex(dot)} />)}
        </div>
      </div>}
    </section>
  );
}
