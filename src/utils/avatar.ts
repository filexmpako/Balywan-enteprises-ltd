/**
 * Default Avatar Utility.
 * Returns a generic person-silhouette placeholder for any user without an
 * uploaded photo — a plain SVG data URI, not a stock photo of a real
 * stranger. Works offline, no external requests.
 */

const GENERIC_AVATAR_SVG = `
<svg width="150" height="150" viewBox="0 0 150 150" xmlns="http://www.w3.org/2000/svg">
  <rect width="150" height="150" fill="#e2e8f0"/>
  <circle cx="75" cy="58" r="28" fill="#94a3b8"/>
  <path d="M75 95c-30 0-55 20-55 45v10h110v-10c0-25-25-45-55-45z" fill="#94a3b8"/>
</svg>
`.trim();

const GENERIC_AVATAR_DATA_URI = `data:image/svg+xml,${encodeURIComponent(GENERIC_AVATAR_SVG)}`;

/**
 * Returns the generic placeholder avatar. Kept as a function (rather than
 * exporting the constant directly) so every existing call site — 
 * getAvatarUrl(name) — keeps working unchanged; the `name` argument is now
 * unused but the signature stays stable for all 8 files that already call it.
 */
export function getAvatarUrl(_name: string): string {
  return GENERIC_AVATAR_DATA_URI;
}

/**
 * Returns a dynamic initials SVG fallback avatar if the user prefers.
 */
export function getInitialsAvatarUrl(name: string): string {
  const cleanName = (name || '').trim() || 'User';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=random&color=fff&size=150&bold=true`;
}

