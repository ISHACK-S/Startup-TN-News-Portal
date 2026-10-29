import { useEffect, useRef, useState } from 'react';

export default function RevealSection({
  as: Element = 'section',
  className = '',
  children,
  ...props
}) {
  const sectionRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <Element
      {...props}
      ref={sectionRef}
      className={`${className} editorial-reveal${visible ? ' is-visible' : ''}`.trim()}
    >
      {children}
    </Element>
  );
}
