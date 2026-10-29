import { Link } from 'react-router-dom';

export default function Brand({ compact = false }) {
  return (
    <Link className={`brand${compact ? ' brand--compact' : ''}`} to="/" aria-label="StartupTN News home">
      <span className="brand-copy">
        <span className="brand-name">Startup<span>TN</span></span>
        {!compact && <span className="brand-descriptor">NEWS · IDEAS · ECOSYSTEM</span>}
      </span>
    </Link>
  );
}
