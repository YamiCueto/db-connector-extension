import * as crypto from 'crypto';

/**
 * Encryption utility for sensitive data
 * Note: VS Code SecretStorage API is preferred for passwords
 * This utility is for additional encryption needs if required
 */
export class Encryption {
    private static readonly algorithm = 'aes-256-cbc';
    private static readonly keyLength = 32;
    private static readonly ivLength = 16;

    /**
     * Generate a random encryption key
     */
    public static generateKey(): string {
        return crypto.randomBytes(Encryption.keyLength).toString('hex');
    }

    /**
     * Encrypt a string
     */
    public static encrypt(text: string, key: string): string {
        const iv = crypto.randomBytes(Encryption.ivLength);
        const keyBuffer = Buffer.from(key, 'hex');
        const cipher = crypto.createCipheriv(Encryption.algorithm, keyBuffer, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // Prepend IV to encrypted data
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt a string
     */
    public static decrypt(encryptedText: string, key: string): string {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const keyBuffer = Buffer.from(key, 'hex');

        const decipher = crypto.createDecipheriv(Encryption.algorithm, keyBuffer, iv);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Hash a string (one-way)
     */
    public static hash(text: string): string {
        return crypto.createHash('sha256').update(text).digest('hex');
    }
}
