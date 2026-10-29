import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Brand from './Brand.jsx';

const categories = [
  ['Startups', 'startups'],
  ['Funding', 'funding'],
  ['Events', 'events'],
  ['Policy', 'policy'],
  ['Innovation', 'innovation'],
  ['Ecosystem', 'ecosystem']
];

export default function SiteLayout() {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const activeCategory = location.pathname.replace(/\/+$/, '') === '/news'
    ? new URLSearchParams(location.search).get('category')
    : null;

  function searchNews(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    navigate(`/news/${params.size ? `?${params}` : ''}`);
    setMenuOpen(false);
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="utility-bar">
          <div className="site-shell mx-auto utility-inner">
            <span>Stories from the Tamil Nadu startup ecosystem</span>
            <span className="utility-date">{new Intl.DateTimeFormat('en-IN', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }).format(new Date())}</span>
          </div>
        </div>
        <div className="masthead-band">
          <div className="masthead site-shell mx-auto">
            <Brand />
            <form className="header-search" role="search" onSubmit={searchNews}>
              <label className="sr-only" htmlFor="header-search">Search news</label>
              <input
                id="header-search"
                type="search"
                placeholder="Search news stories..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" aria-label="Search">
                <SearchIcon />
              </button>
            </form>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="primary-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
              <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
            </button>
          </div>
        </div>
        <nav id="primary-navigation" className={`primary-nav${menuOpen ? ' primary-nav--open' : ''}`} aria-label="Main navigation">
          <div className="site-shell mx-auto nav-inner">
            <NavLink to="/" end onClick={() => setMenuOpen(false)}>Home</NavLink>
            <NavLink
              to="/news/"
              className={({ isActive }) => isActive && !activeCategory ? 'active' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              Latest news
            </NavLink>
            {categories.map(([name, slug]) => (
              <Link
                key={slug}
                to={`/news/?category=${slug}`}
                className={activeCategory === slug ? 'active' : undefined}
                aria-current={activeCategory === slug ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {name}
              </Link>
            ))}
            <span className="nav-note">A closer look at what’s next</span>
          </div>
        </nav>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-shell mx-auto footer-main">
          <div className="footer-publication">
            <Brand compact />
            <p>Independent stories and perspectives from across Tamil Nadu’s startup ecosystem.</p>
            <span>Independent editorial project · Not an official StartupTN publication</span>
          </div>
          <div className="footer-links">
            <strong>Explore</strong>
            <Link to="/news/">Latest news</Link>
            {categories.map(([name, slug]) => (
              <Link key={slug} to={`/news/?category=${slug}`}>{name}</Link>
            ))}
          </div>
        </div>
        <div className="footer-bottom">
          <div className="site-shell mx-auto">
            <span>© {new Date().getFullYear()} StartupTN News</span>
            <Link to="/">Back to top <span aria-hidden="true">↑</span></Link>
          </div>
        </div>
      </footer>
    </>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
