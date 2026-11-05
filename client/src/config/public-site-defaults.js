export const DEFAULT_PUBLIC_WEBSITE_CONFIGURATION = {
  menu: [
    { id: 'home', labelEn: 'Home', labelTa: 'முகப்பு', destinationType: 'internal', destination: '/', displayOrder: 10, isVisible: true, isActive: true, openInNewTab: false, children: [] },
    { id: 'news', labelEn: 'Latest news', labelTa: 'சமீபத்திய செய்திகள்', destinationType: 'internal', destination: '/news/', displayOrder: 20, isVisible: true, isActive: true, openInNewTab: false, children: [] },
    { id: 'videos', labelEn: 'Videos', labelTa: 'காணொளிகள்', destinationType: 'internal', destination: '/videos', displayOrder: 25, isVisible: true, isActive: true, openInNewTab: false, children: [] },
    { id: 'startups', labelEn: 'Startups', labelTa: 'தொடக்க நிறுவனங்கள்', destinationType: 'internal', destination: '/news/?category=startups', displayOrder: 30, isVisible: true, isActive: true, openInNewTab: false, children: [] },
    { id: 'funding', labelEn: 'Funding', labelTa: 'நிதி', destinationType: 'internal', destination: '/news/?category=funding', displayOrder: 40, isVisible: true, isActive: true, openInNewTab: false, children: [] },
    { id: 'events', labelEn: 'Events', labelTa: 'நிகழ்வுகள்', destinationType: 'internal', destination: '/news/?category=events', displayOrder: 50, isVisible: true, isActive: true, openInNewTab: false, children: [] },
    { id: 'policy', labelEn: 'Policy', labelTa: 'கொள்கை', destinationType: 'internal', destination: '/news/?category=policy', displayOrder: 60, isVisible: true, isActive: true, openInNewTab: false, children: [] },
    { id: 'innovation', labelEn: 'Innovation', labelTa: 'புதுமை', destinationType: 'internal', destination: '/news/?category=innovation', displayOrder: 70, isVisible: true, isActive: true, openInNewTab: false, children: [] },
    { id: 'ecosystem', labelEn: 'Ecosystem', labelTa: 'சூழல்', destinationType: 'internal', destination: '/news/?category=ecosystem', displayOrder: 80, isVisible: true, isActive: true, openInNewTab: false, children: [] }
  ],
  footer: {
    logoUrl: '',
    websiteName: 'StartupTN News',
    isVisible: true,
    descriptionEn: 'Independent stories and perspectives from across Tamil Nadu’s startup ecosystem.',
    descriptionTa: 'தமிழ்நாட்டின் தொடக்க நிறுவனச் சூழல் குறித்த சுயாதீனச் செய்திகள் மற்றும் பார்வைகள்.',
    email: '',
    phone: '',
    addressEn: '',
    addressTa: '',
    groups: [{
      id: 'explore',
      headingEn: 'Explore',
      headingTa: 'பார்வையிடுக',
      displayOrder: 10,
      isVisible: true,
      links: [
        { id: 'latest-news', labelEn: 'Latest news', labelTa: 'சமீபத்திய செய்திகள்', url: '/news/', displayOrder: 10, isVisible: true, openInNewTab: false },
        { id: 'startups', labelEn: 'Startups', labelTa: 'தொடக்க நிறுவனங்கள்', url: '/news/?category=startups', displayOrder: 20, isVisible: true, openInNewTab: false },
        { id: 'funding', labelEn: 'Funding', labelTa: 'நிதி', url: '/news/?category=funding', displayOrder: 30, isVisible: true, openInNewTab: false },
        { id: 'events', labelEn: 'Events', labelTa: 'நிகழ்வுகள்', url: '/news/?category=events', displayOrder: 40, isVisible: true, openInNewTab: false }
      ]
    }],
    socialLinks: [],
    copyrightEn: 'Independent editorial project · Not an official StartupTN publication',
    copyrightTa: 'சுயாதீனச் செய்தித் திட்டம் · அதிகாரப்பூர்வ StartupTN வெளியீடு அல்ல',
    dynamicYear: true
  },
  branding: {
    logoUrl: '',
    footerLogoUrl: '',
    faviconUrl: '',
    websiteName: 'StartupTN News',
    tagline: '',
    primaryColor: '#293f80',
    secondaryColor: '#101b3b',
    accentColor: '#ffbe24',
    backgroundColor: '#f8f7f4',
    textColor: '#17283e',
    fontFamily: 'Inter'
  }
};

function isSafeAssetUrl(value) {
  if (value === '' || (value.startsWith('/') && !value.startsWith('//'))) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validMenuItem(item) {
  const validDestination = item?.destinationType === 'internal'
    ? typeof item.destination === 'string' && item.destination.startsWith('/') && !item.destination.startsWith('//')
    : item?.destinationType === 'external' && typeof item.destination === 'string'
      && /^https:\/\//i.test(item.destination);
  return item
    && typeof item.id === 'string'
    && typeof item.labelEn === 'string'
    && typeof item.labelTa === 'string'
    && validDestination
    && Array.isArray(item.children ?? [])
    && (item.children ?? []).every(validMenuItem);
}

function validFooterGroup(group) {
  return group
    && typeof group.id === 'string'
    && typeof group.headingEn === 'string'
    && typeof group.headingTa === 'string'
    && Array.isArray(group.links)
    && group.links.every((link) => link
      && typeof link.id === 'string'
      && typeof link.labelEn === 'string'
      && typeof link.labelTa === 'string'
      && typeof link.url === 'string');
}

function validSocialLink(link) {
  if (
    !link
    || typeof link.id !== 'string'
    || typeof link.label !== 'string'
    || typeof link.url !== 'string'
    || typeof link.displayOrder !== 'number'
    || typeof link.isVisible !== 'boolean'
  ) return false;
  try {
    const url = new URL(link.url);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function normalizePublicWebsiteConfiguration(configuration) {
  const incoming = configuration && typeof configuration === 'object' ? configuration : {};
  const incomingMenu = incoming.menu;
  const menu = Array.isArray(incomingMenu) && incomingMenu.length > 0
    && incomingMenu.every(validMenuItem)
    ? incomingMenu
    : DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.menu;

  const incomingFooter = incoming.footer && typeof incoming.footer === 'object' ? incoming.footer : {};
  const groups = Array.isArray(incomingFooter.groups)
    && incomingFooter.groups.length > 0
    && incomingFooter.groups.every(validFooterGroup)
    ? incomingFooter.groups
    : DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.footer.groups;
  const footer = {
    ...DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.footer,
    ...Object.fromEntries(Object.entries(incomingFooter).filter(([key, value]) => (
      key !== 'groups' && typeof value === 'string'
    ))),
    dynamicYear: typeof incomingFooter.dynamicYear === 'boolean'
      ? incomingFooter.dynamicYear
      : DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.footer.dynamicYear,
    isVisible: typeof incomingFooter.isVisible === 'boolean'
      ? incomingFooter.isVisible
      : DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.footer.isVisible,
    socialLinks: Array.isArray(incomingFooter.socialLinks)
      && incomingFooter.socialLinks.every(validSocialLink)
      ? incomingFooter.socialLinks
      : DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.footer.socialLinks,
    groups
  };

  const incomingBranding = incoming.branding && typeof incoming.branding === 'object'
    ? incoming.branding
    : {};
  const brandingDefaults = DEFAULT_PUBLIC_WEBSITE_CONFIGURATION.branding;
  const branding = { ...brandingDefaults, ...incomingBranding };
  for (const key of ['logoUrl', 'footerLogoUrl', 'faviconUrl']) {
    if (typeof branding[key] !== 'string' || !isSafeAssetUrl(branding[key])) {
      branding[key] = brandingDefaults[key];
    }
  }
  for (const key of ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor']) {
    if (typeof branding[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(branding[key])) {
      branding[key] = brandingDefaults[key];
    }
  }
  if (typeof branding.websiteName !== 'string' || !branding.websiteName.trim()) {
    branding.websiteName = brandingDefaults.websiteName;
  }
  if (typeof branding.tagline !== 'string') branding.tagline = brandingDefaults.tagline;
  if (!['Inter', 'Georgia', 'Arial', 'Trebuchet MS'].includes(branding.fontFamily)) {
    branding.fontFamily = brandingDefaults.fontFamily;
  }

  return {
    menu,
    footer,
    branding,
    brandingCustomized: incoming.brandingCustomized === true
  };
}
