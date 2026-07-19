package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureDataStore {
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "dzienniczek_medical_data_aes_v1";
    private static final String PREFS_NAME = "secure_medical_data_v1";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private static final int MAX_PLAINTEXT_BYTES = 12 * 1024 * 1024;
    static final String REMINDER_SCHEDULE_SLOT = "dzienniczek-hormonu-reminder-schedule-v1";

    private final SharedPreferences preferences;
    private final SecureRandom random = new SecureRandom();

    SecureDataStore(Context context) {
        preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    String readResult(String slot) {
        JSONObject result = new JSONObject();
        try {
            requireSlot(slot);
            String encoded = preferences.getString(slot, "");
            result.put("ok", true);
            if (encoded == null || encoded.isEmpty()) {
                result.put("exists", false);
                result.put("value", "");
            } else {
                result.put("exists", true);
                result.put("value", decrypt(slot, encoded));
            }
        } catch (Exception error) {
            try {
                result.put("ok", false);
                result.put("exists", false);
                result.put("value", "");
                result.put("error", "secure_storage_unavailable");
            } catch (Exception ignored) {
                return "{\"ok\":false,\"error\":\"secure_storage_unavailable\"}";
            }
        }
        return result.toString();
    }

    String readValue(String slot) {
        try {
            requireSlot(slot);
            String encoded = preferences.getString(slot, "");
            return encoded == null || encoded.isEmpty() ? "" : decrypt(slot, encoded);
        } catch (Exception error) {
            return "";
        }
    }

    boolean write(String slot, String plaintext) {
        try {
            requireSlot(slot);
            String value = plaintext == null ? "" : plaintext;
            if (value.getBytes(StandardCharsets.UTF_8).length > MAX_PLAINTEXT_BYTES) return false;
            return preferences.edit().putString(slot, encrypt(slot, value)).commit();
        } catch (Exception error) {
            return false;
        }
    }

    boolean remove(String slot) {
        try {
            requireSlot(slot);
            return preferences.edit().remove(slot).commit();
        } catch (Exception error) {
            return false;
        }
    }

    private String encrypt(String slot, String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance(CIPHER);
        byte[] iv = new byte[IV_BYTES];
        random.nextBytes(iv);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(TAG_BITS, iv));
        cipher.updateAAD(aad(slot));
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
        JSONObject envelope = new JSONObject();
        envelope.put("v", 1);
        envelope.put("alg", "AES-GCM");
        envelope.put("iv", Base64.encodeToString(iv, Base64.NO_WRAP));
        envelope.put("ct", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
        Arrays.fill(ciphertext, (byte) 0);
        return envelope.toString();
    }

    private String decrypt(String slot, String encoded) throws Exception {
        JSONObject envelope = new JSONObject(encoded);
        if (envelope.optInt("v", 0) != 1 || !"AES-GCM".equals(envelope.optString("alg"))) {
            throw new IllegalArgumentException("Unsupported secure storage envelope");
        }
        byte[] iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP);
        byte[] ciphertext = Base64.decode(envelope.getString("ct"), Base64.NO_WRAP);
        if (iv.length != IV_BYTES || ciphertext.length < 16 || ciphertext.length > MAX_PLAINTEXT_BYTES + 16) {
            throw new IllegalArgumentException("Invalid encrypted payload");
        }
        Cipher cipher = Cipher.getInstance(CIPHER);
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(TAG_BITS, iv));
        cipher.updateAAD(aad(slot));
        byte[] plaintext = cipher.doFinal(ciphertext);
        String value = new String(plaintext, StandardCharsets.UTF_8);
        Arrays.fill(plaintext, (byte) 0);
        Arrays.fill(ciphertext, (byte) 0);
        return value;
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        KeyStore.Entry existing = keyStore.getEntry(KEY_ALIAS, null);
        if (existing instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }

    private static byte[] aad(String slot) {
        return ("DzienniczekHormonu|" + slot + "|v1").getBytes(StandardCharsets.UTF_8);
    }

    private static void requireSlot(String slot) {
        if (!"dzienniczek-hormonu-wzrostu-v1".equals(slot)
                && !"dzienniczek-hormonu-wzrostu-v1-backup".equals(slot)
                && !"dzienniczek-hormonu-wzrostu-auto-import-backup-v1".equals(slot)
                && !REMINDER_SCHEDULE_SLOT.equals(slot)) {
            throw new IllegalArgumentException("Invalid secure storage slot");
        }
    }
}
