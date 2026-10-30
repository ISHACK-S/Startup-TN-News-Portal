import { Link } from 'react-router-dom';
import ArticleMeta from './ArticleMeta.jsx';
import StoryImage from './StoryImage.jsx';

export default function StoryCard({ article, featured = false, index = 0 }) {
  return (
    <article
      className={`story-card${featured ? ' story-card--featured' : ''}`}
      data-reveal-item=""
      style={{ '--story-order': index }}
    >
      <Link
        className="story-card-image-link"
        to={`/news/${encodeURIComponent(article.slug)}`}
        aria-label={`Read story: ${article.title}`}
      >
        <StoryImage
          className="story-card-image"
          src={article.cover_image_url}
          alt=""
          priority={featured}
        />
      </Link>
      <div className="story-card-copy">
        <ArticleMeta article={article} />
        <h3 className="story-card-title">
          <Link to={`/news/${encodeURIComponent(article.slug)}`}>{article.title}</Link>
        </h3>
        {article.summary && <p className="story-card-summary">{article.summary}</p>}
        <Link className="text-link" to={`/news/${encodeURIComponent(article.slug)}`}>
          Read story <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
