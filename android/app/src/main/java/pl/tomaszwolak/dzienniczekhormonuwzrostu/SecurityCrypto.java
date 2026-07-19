package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

final class SecurityCrypto {
    static final int PBKDF2_ITERATIONS = 210000;
    private static final int SALT_BYTES = 16;
    private static final int IV_BYTES = 12;
    private static final int KEY_BYTES = 32;
    private static final int TAG_BITS = 128;
    private static final int MAX_BACKUP_BYTES = 12 * 1024 * 1024;
    private static final byte[] BACKUP_AAD = "Dzienniczek Hormonu|encrypted-backup|v1"
            .getBytes(StandardCharsets.UTF_8);
    private static final SecureRandom RANDOM = new SecureRandom();

    private SecurityCrypto() {}

    static String randomBase64(int byteCount) {
        if (byteCount < 8 || byteCount > 64) return "";
        byte[] bytes = new byte[byteCount];
        RANDOM.nextBytes(bytes);
        String encoded = Base64.encodeToString(bytes, Base64.NO_WRAP);
        Arrays.fill(bytes, (byte) 0);
        return encoded;
    }

    static String pinHash(String pin, String saltBase64) {
        try {
            byte[] salt = Base64.decode(saltBase64, Base64.NO_WRAP);
            if (salt.length != SALT_BYTES || pin == null || pin.length() < 6 || pin.length() > 12) return "";
            byte[] key = pbkdf2(pin.getBytes(StandardCharsets.UTF_8), salt, PBKDF2_ITERATIONS, KEY_BYTES);
            String encoded = Base64.encodeToString(key, Base64.NO_WRAP);
            Arrays.fill(key, (byte) 0);
            return encoded;
        } catch (Exception error) {
            return "";
        }
    }

    static String encryptBackupResult(String plaintext, String password) {
        try {
            if (plaintext == null || password == null || password.length() < 8 || password.length() > 256) {
                return errorResult("invalid_password");
            }
            byte[] plaintextBytes = plaintext.getBytes(StandardCharsets.UTF_8);
            if (plaintextBytes.length > MAX_BACKUP_BYTES) return errorResult("backup_too_large");
            byte[] salt = new byte[SALT_BYTES];
            byte[] iv = new byte[IV_BYTES];
            RANDOM.nextBytes(salt);
            RANDOM.nextBytes(iv);
            byte[] keyBytes = pbkdf2(password.getBytes(StandardCharsets.UTF_8), salt, PBKDF2_ITERATIONS, KEY_BYTES);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyBytes, "AES"), new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(BACKUP_AAD);
            byte[] ciphertext = cipher.doFinal(plaintextBytes);

            JSONObject kdf = new JSONObject();
            kdf.put("name", "PBKDF2");
            kdf.put("hash", "SHA-256");
            kdf.put("iterations", PBKDF2_ITERATIONS);
            kdf.put("salt", Base64.encodeToString(salt, Base64.NO_WRAP));
            JSONObject cipherInfo = new JSONObject();
            cipherInfo.put("name", "AES-GCM");
            cipherInfo.put("iv", Base64.encodeToString(iv, Base64.NO_WRAP));
            JSONObject envelope = new JSONObject();
            envelope.put("application", "Dzienniczek Hormonu");
            envelope.put("encryptedBackupFormatVersion", 1);
            envelope.put("kdf", kdf);
            envelope.put("cipher", cipherInfo);
            envelope.put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP));

            Arrays.fill(keyBytes, (byte) 0);
            Arrays.fill(plaintextBytes, (byte) 0);
            Arrays.fill(ciphertext, (byte) 0);
            return successResult(envelope.toString());
        } catch (Exception error) {
            return errorResult("encryption_failed");
        }
    }

    static String decryptBackupResult(String envelopeJson, String password) {
        try {
            if (envelopeJson == null || envelopeJson.length() > MAX_BACKUP_BYTES * 2
                    || password == null || password.length() < 8 || password.length() > 256) {
                return errorResult("invalid_backup");
            }
            JSONObject envelope = new JSONObject(envelopeJson);
            if (envelope.optInt("encryptedBackupFormatVersion", 0) != 1
                    || !"Dzienniczek Hormonu".equals(envelope.optString("application"))) {
                return errorResult("invalid_backup");
            }
            JSONObject kdf = envelope.getJSONObject("kdf");
            JSONObject cipherInfo = envelope.getJSONObject("cipher");
            int iterations = kdf.getInt("iterations");
            if (!"PBKDF2".equals(kdf.optString("name")) || !"SHA-256".equals(kdf.optString("hash"))
                    || iterations < 100000 || iterations > 1000000
                    || !"AES-GCM".equals(cipherInfo.optString("name"))) {
                return errorResult("invalid_backup");
            }
            byte[] salt = Base64.decode(kdf.getString("salt"), Base64.NO_WRAP);
            byte[] iv = Base64.decode(cipherInfo.getString("iv"), Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP);
            if (salt.length != SALT_BYTES || iv.length != IV_BYTES || ciphertext.length < 16
                    || ciphertext.length > MAX_BACKUP_BYTES + 16) return errorResult("invalid_backup");
            byte[] keyBytes = pbkdf2(password.getBytes(StandardCharsets.UTF_8), salt, iterations, KEY_BYTES);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyBytes, "AES"), new GCMParameterSpec(TAG_BITS, iv));
            cipher.updateAAD(BACKUP_AAD);
            byte[] plaintext = cipher.doFinal(ciphertext);
            String value = new String(plaintext, StandardCharsets.UTF_8);
            Arrays.fill(keyBytes, (byte) 0);
            Arrays.fill(plaintext, (byte) 0);
            Arrays.fill(ciphertext, (byte) 0);
            return successResult(value);
        } catch (Exception error) {
            return errorResult("wrong_password_or_corrupted_backup");
        }
    }

    private static byte[] pbkdf2(byte[] password, byte[] salt, int iterations, int length) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(password, "HmacSHA256"));
        int hashLength = mac.getMacLength();
        int blockCount = (int) Math.ceil((double) length / hashLength);
        byte[] output = new byte[length];
        byte[] blockIndex = new byte[4];
        for (int block = 1; block <= blockCount; block++) {
            blockIndex[0] = (byte) (block >>> 24);
            blockIndex[1] = (byte) (block >>> 16);
            blockIndex[2] = (byte) (block >>> 8);
            blockIndex[3] = (byte) block;
            mac.update(salt);
            byte[] u = mac.doFinal(blockIndex);
            byte[] t = u.clone();
            for (int round = 1; round < iterations; round++) {
                u = mac.doFinal(u);
                for (int index = 0; index < t.length; index++) t[index] ^= u[index];
            }
            int offset = (block - 1) * hashLength;
            System.arraycopy(t, 0, output, offset, Math.min(hashLength, length - offset));
            Arrays.fill(u, (byte) 0);
            Arrays.fill(t, (byte) 0);
        }
        Arrays.fill(password, (byte) 0);
        return output;
    }

    private static String successResult(String value) {
        try {
            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("value", value);
            return result.toString();
        } catch (Exception error) {
            return "{\"ok\":false,\"error\":\"serialization_failed\"}";
        }
    }

    private static String errorResult(String code) {
        try {
            JSONObject result = new JSONObject();
            result.put("ok", false);
            result.put("error", code);
            return result.toString();
        } catch (Exception error) {
            return "{\"ok\":false,\"error\":\"security_error\"}";
        }
    }
}
