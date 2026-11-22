package com.kabisado.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Hardware-backed Android Keystore AES-256-GCM storage for the native refresh token.
 * Plaintext tokens never touch disk; only "{iv_base64}:{ciphertext_base64}" is stored in private SharedPreferences.
 */
@CapacitorPlugin(name = "KabisadoKeystore")
public class KabisadoKeystorePlugin extends Plugin {
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "com.kabisado.app.refresh_key_v1";
    private static final String PREFS_NAME = "kabisado_secure_store";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private synchronized SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        KeyStore.Entry existing = keyStore.getEntry(KEY_ALIAS, null);
        if (existing instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        }
        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build();
        keyGenerator.init(spec);
        return keyGenerator.generateKey();
    }

    @PluginMethod
    public synchronized void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.isEmpty() || value == null) {
            call.reject("Missing key or value", "INVALID_ARGS");
            return;
        }
        try {
            SecretKey secretKey = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);
            byte[] iv = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(iv, Base64.NO_WRAP)
                    + ":"
                    + Base64.encodeToString(ciphertext, Base64.NO_WRAP);
            prefs().edit().putString(key, packed).apply();
            call.resolve();
        } catch (Exception err) {
            call.reject("KEYSTORE_ERROR: " + err.getClass().getSimpleName(), "KEYSTORE_ERROR", err);
        }
    }

    @PluginMethod
    public synchronized void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("Missing key", "INVALID_ARGS");
            return;
        }
        String packed = prefs().getString(key, null);
        if (packed == null) {
            JSObject ret = new JSObject();
            ret.put("value", JSObject.NULL);
            call.resolve(ret);
            return;
        }
        try {
            String[] parts = packed.split(":", 2);
            if (parts.length != 2) {
                prefs().edit().remove(key).apply();
                call.reject("DECRYPTION_ERROR: malformed entry", "DECRYPTION_ERROR");
                return;
            }
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(parts[1], Base64.NO_WRAP);
            SecretKey secretKey = getOrCreateSecretKey();
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);
            JSObject ret = new JSObject();
            ret.put("value", new String(plaintext, StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception err) {
            prefs().edit().remove(key).apply();
            call.reject("DECRYPTION_ERROR: " + err.getClass().getSimpleName(), "DECRYPTION_ERROR", err);
        }
    }

    @PluginMethod
    public synchronized void remove(PluginCall call) {
        String key = call.getString("key");
        if (key != null && !key.isEmpty()) {
            prefs().edit().remove(key).apply();
        }
        call.resolve();
    }
}
