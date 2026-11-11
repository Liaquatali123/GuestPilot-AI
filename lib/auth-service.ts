// lib/auth-service.ts
// Custom Local Admin Key & Security Token Authentication Engine for GuestPilot AI
// Completely eliminates external OAuth popups, Gmail chooser issues, and domain restrictions.

export interface AdminSession {
  authenticated: boolean;
  token: string;
  adminName: string;
  adminEmail: string;
  authenticatedAt: string;
}

export const DEFAULT_MASTER_KEY = 'GP-PILOT-SECURE-2026-KEY';
export const LEGACY_RECOGNIZED_KEYS = [
  'GP-PILOT-SECURE-2026-KEY',
  'rdxkinglucky@gmail.com',
  'appbuilder078@gmail.com',
  'guestpilot-admin',
  'gp-admin-786',
] as const;

const SESSION_STORAGE_KEY = 'guestpilot_admin_active_session';
const CUSTOM_KEY_STORAGE = 'guestpilot_custom_master_key';

export function getCustomMasterKey(): string {
  if (typeof window === 'undefined') return DEFAULT_MASTER_KEY;
  try {
    const saved = localStorage.getItem(CUSTOM_KEY_STORAGE);
    if (saved && saved.trim().length >= 4) {
      return saved.trim();
    }
  } catch {
    // Local storage fallback
  }
  return DEFAULT_MASTER_KEY;
}

export function setCustomMasterKey(newKey: string): { success: boolean; error?: string } {
  if (!newKey || newKey.trim().length < 6) {
    return {
      success: false,
      error: 'Security token / Master key must be at least 6 characters long.',
    };
  }
  const cleanKey = newKey.trim();
  try {
    localStorage.setItem(CUSTOM_KEY_STORAGE, cleanKey);
    // Also update current session if active
    const current = getAdminSession();
    if (current) {
      current.token = cleanKey;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(current));
    }
    return { success: true };
  } catch {
    return {
      success: false,
      error: 'Failed to write to local device storage.',
    };
  }
}

export function resetToDefaultKey(): void {
  try {
    localStorage.removeItem(CUSTOM_KEY_STORAGE);
  } catch {
    // ignore
  }
}

export function generateRandomSecureToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = 'GP-KEY-';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (i < 3) token += '-';
  }
  return token;
}

export function verifyAdminKey(
  inputKey: string,
  remember: boolean = true
): { success: boolean; session?: AdminSession; error?: string } {
  if (!inputKey || !inputKey.trim()) {
    return {
      success: false,
      error: 'Please enter your Admin Master Key or Access Token.',
    };
  }

  const cleanInput = inputKey.trim();
  const customKey = getCustomMasterKey();

  const isMatch =
    cleanInput === customKey ||
    cleanInput === DEFAULT_MASTER_KEY ||
    LEGACY_RECOGNIZED_KEYS.some(
      (k) => k.toLowerCase() === cleanInput.toLowerCase()
    );

  if (!isMatch) {
    return {
      success: false,
      error:
        'Invalid Admin Security Token. Please enter the correct Master Key or click "Use Default Master Key".',
    };
  }

  const session: AdminSession = {
    authenticated: true,
    token: cleanInput,
    adminName: cleanInput.includes('@')
      ? cleanInput.split('@')[0]
      : 'Master Administrator',
    adminEmail: cleanInput.includes('@') ? cleanInput : 'admin@guestpilot.ai',
    authenticatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      if (remember) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      }
    } catch {
      // storage unavailable
    }
  }

  return { success: true, session };
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      localStorage.getItem(SESSION_STORAGE_KEY) ||
      sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.authenticated && parsed.token) {
      return parsed as AdminSession;
    }
  } catch {
    return null;
  }
  return null;
}

export function logoutAdmin(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}
