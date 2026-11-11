import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

function isCategoryFilterChange(previousSearch, currentSearch) {
  const previousParams = new URLSearchParams(previousSearch);
  const currentParams = new URLSearchParams(currentSearch);
  const categoryChanged = previousParams.get('category') !== currentParams.get('category');
  const cityChanged = previousParams.get('city') !== currentParams.get('city');
  if (!categoryChanged && !cityChanged) return false;

  const withoutFilterParams = (params) => [...params].filter(
    ([key]) => key !== 'category' && key !== 'city' && key !== 'page'
  );
  const otherParamsUnchanged = JSON.stringify(withoutFilterParams(previousParams))
    === JSON.stringify(withoutFilterParams(currentParams));
  const pageUnchanged = previousParams.get('page') === currentParams.get('page');
  const pageReset = previousParams.has('page') && !currentParams.has('page');

  return otherParamsUnchanged && (pageUnchanged || pageReset);
}

export default function ScrollToTop() {
  const { pathname, search } = useLocation();
  const previousLocation = useRef({ pathname, search });

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return undefined;

    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useEffect(() => {
    const previous = previousLocation.current;
    previousLocation.current = { pathname, search };

    if (previous.pathname === pathname && isCategoryFilterChange(previous.search, search)) return;

    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, [pathname, search]);

  return null;
}
