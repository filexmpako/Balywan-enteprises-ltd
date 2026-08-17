/**
 * INTERIM CLIENT-SIDE SECURITY HARDENING MEASURE
 * 
 * Note: This module implements SHA-256 password hashing with cryptographically
 * generated salts using the standard Web Crypto API. This provides interim
 * security against plaintext password leaks in localStorage during client-side
 * simulation. Once a full backend service is attached, password hashing and
 * verification MUST be moved to the server using bcrypt, argon2, or PBKDF2.
 */

/**
 * Generates a cryptographically random salt string.
 */
export function generateSalt(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes the SHA-256 hash of a password concatenated with a salt.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies a submitted password against a stored salt and SHA-256 hash.
 */
export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  if (!password || !salt || !storedHash) return false;
  const computedHash = await hashPassword(password, salt);
  return computedHash === storedHash;
}

/**
 * Validates minimum password strength rules:
 * - Minimum length >= 8
 * - Cannot equal email address
 */
export function validatePasswordStrength(
  password: string,
  email?: string
): { isValid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return {
      isValid: false,
      error: 'Password must be at least 8 characters in length.',
    };
  }

  if (email && password.toLowerCase().trim() === email.toLowerCase().trim()) {
    return {
      isValid: false,
      error: 'Password cannot be identical to your email address.',
    };
  }

  return { isValid: true };
}
