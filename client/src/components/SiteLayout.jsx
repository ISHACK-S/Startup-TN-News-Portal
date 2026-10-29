import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Brand from './Brand.jsx';

export default function SiteLayout() {
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

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
        <div className="masthead site-shell mx-auto">
          <Brand />
          <form className="header-search" role="search" onSubmit={searchNews}>
            <label className="sr-only" htmlFor="header-search">Search news</label>
            <input
              id="header-search"
              type="search"
              placeholder="Search stories, ideas and people"
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
        <nav id="primary-navigation" className={`primary-nav${menuOpen ? ' primary-nav--open' : ''}`} aria-label="Main navigation">
          <div className="site-shell mx-auto nav-inner">
            <NavLink to="/" end onClick={() => setMenuOpen(false)}>Home</NavLink>
            <NavLink to="/news/" onClick={() => setMenuOpen(false)}>Latest news</NavLink>
            <Link to="/news/?category=startups" onClick={() => setMenuOpen(false)}>Startups</Link>
            <Link to="/news/?category=funding" onClick={() => setMenuOpen(false)}>Funding</Link>
            <Link to="/news/?category=innovation" onClick={() => setMenuOpen(false)}>Innovation</Link>
            <span className="nav-note">A closer look at what’s next</span>
          </div>
        </nav>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-shell mx-auto footer-inner">
          <Brand compact />
          <p>Independent stories. A stronger startup ecosystem.</p>
          <span>Independent editorial project · © {new Date().getFullYear()}</span>
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
