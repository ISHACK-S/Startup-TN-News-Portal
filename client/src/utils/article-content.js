const INLINE_IMAGE_PATTERN = /!\[([^\]\r\n]*)\]\((https:\/\/[^)\s]+)\)/g;

export function isAllowedInlineImageUrl(value) {
  if (typeof value !== 'string' || value !== value.trim() || /\s/.test(value)) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'res.cloudinary.com'
      && !url.username
      && !url.password
      && !url.port
      && !url.hash
      && /^\/[^/]+\/image\/upload\/.+/.test(url.pathname);
  } catch {
    return false;
  }
}

export function createInlineImageMarkup(url) {
  if (!isAllowedInlineImageUrl(url)) {
    throw new Error('The uploaded image did not return a valid HTTPS Cloudinary image URL.');
  }

  return `![Article image](${url})`;
}

export function splitInlineImageTokens(line) {
  const parts = [];
  let cursor = 0;
  let match;

  INLINE_IMAGE_PATTERN.lastIndex = 0;
  while ((match = INLINE_IMAGE_PATTERN.exec(line)) !== null) {
    if (!isAllowedInlineImageUrl(match[2])) continue;
    parts.push({
      text: line.slice(cursor, match.index),
      alt: match[1],
      url: match[2]
    });
    cursor = match.index + match[0].length;
  }

  if (cursor === 0) return [{ text: line }];
  parts.push({ text: line.slice(cursor) });
  return parts;
}

export function getStandaloneInlineImage(paragraph) {
  const match = paragraph.match(/^\s*!\[([^\]\r\n]*)\]\((https:\/\/[^)\s]+)\)\s*$/);
  if (!match || !isAllowedInlineImageUrl(match[2])) return null;
  return { alt: match[1], url: match[2] };
}
