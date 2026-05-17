import { safeStorage } from 'electron';

export const encryptSecret = (plaintext: string): string | null => {
  if (!plaintext) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback for dev: store with marker so we know it's not encrypted.
    return 'PLAIN:' + Buffer.from(plaintext, 'utf8').toString('base64');
  }
  return safeStorage.encryptString(plaintext).toString('base64');
};

export const decryptSecret = (cipher: string | null | undefined): string => {
  if (!cipher) return '';
  if (cipher.startsWith('PLAIN:')) {
    return Buffer.from(cipher.slice(6), 'base64').toString('utf8');
  }
  try {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  } catch {
    return '';
  }
};
