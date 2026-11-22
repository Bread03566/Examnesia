package com.kabisado.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Pattern;

import javax.net.ssl.HttpsURLConnection;

/**
 * Native Android APK update downloader, SHA-256 & signing-certificate verifier, and system package-installer handoff.
 * Never performs silent installation and refuses any APK whose package name, versionCode, SHA-256, or signing key fails verification.
 */
@CapacitorPlugin(name = "KabisadoUpdater")
public class KabisadoUpdaterPlugin extends Plugin {
    private static final Pattern GITHUB_RELEASE_URL_RE =
            Pattern.compile("^https://github\\.com/[^/]+/[^/]+/releases/download/[^/]+/[^/]+\\.apk$");
    private static final Pattern HEX64_RE = Pattern.compile("^[0-9a-f]{64}$");
    private static final String UPDATE_DIR = "updates";
    private static final String UPDATE_FILENAME = "kabisado-update.apk";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final int MAX_REDIRECTS = 5;

    private File updateFile() {
        File dir = new File(getContext().getCacheDir(), UPDATE_DIR);
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return new File(dir, UPDATE_FILENAME);
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format(Locale.US, "%02x", b & 0xff));
        }
        return sb.toString();
    }

    private static boolean constantTimeEqualsHex(String a, String b) {
        if (a == null || b == null) return false;
        byte[] ba = a.trim().toLowerCase(Locale.US).getBytes(StandardCharsets.UTF_8);
        byte[] bb = b.trim().toLowerCase(Locale.US).getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(ba, bb);
    }

    private String extractCertSha256(PackageInfo pkgInfo) throws Exception {
        Signature[] signatures = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            SigningInfo signingInfo = pkgInfo.signingInfo;
            if (signingInfo != null) {
                signatures = signingInfo.hasMultipleSigners()
                        ? signingInfo.getApkContentsSigners()
                        : signingInfo.getSigningCertificateHistory();
            }
        }
        if (signatures == null || signatures.length == 0) {
            signatures = pkgInfo.signatures;
        }
        if (signatures == null || signatures.length == 0 || signatures[0] == null) {
            throw new IllegalStateException("APK has no signing certificate");
        }
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        return toHex(md.digest(signatures[0].toByteArray()));
    }

    @SuppressWarnings("deprecation")
    private PackageInfo getInstalledPackageInfo() throws Exception {
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;
        return pm.getPackageInfo(pkg, flags);
    }

    @SuppressWarnings("deprecation")
    private PackageInfo getArchivePackageInfo(String archivePath) {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;
        return pm.getPackageArchiveInfo(archivePath, flags);
    }

    private boolean canRequestInstalls() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return getContext().getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }

    @PluginMethod
    public void getInstalledInfo(PluginCall call) {
        try {
            PackageInfo info = getInstalledPackageInfo();
            JSObject ret = new JSObject();
            ret.put("packageName", info.packageName);
            ret.put("versionName", info.versionName != null ? info.versionName : "1.0.0");
            ret.put("versionCode", PackageInfoCompat.getLongVersionCode(info));
            ret.put("sdkInt", Build.VERSION.SDK_INT);
            ret.put("canInstallPackages", canRequestInstalls());
            ret.put("signingCertSha256", extractCertSha256(info));
            call.resolve(ret);
        } catch (Exception err) {
            call.reject("Could not read installed package info: " + err.getMessage(), "INFO_ERROR", err);
        }
    }

    @PluginMethod
    public void downloadAndVerifyApk(PluginCall call) {
        final String apkUrl = call.getString("apkUrl", "").trim();
        final String expectedSha256 = call.getString("expectedSha256", "").trim().toLowerCase(Locale.US);
        final String expectedCertSha256 = call.getString("expectedSigningCertSha256", "").trim().toLowerCase(Locale.US);

        if (!GITHUB_RELEASE_URL_RE.matcher(apkUrl).matches()) {
            call.reject("Refusing APK download: URL must be an official HTTPS GitHub Releases .apk asset.", "INVALID_URL");
            return;
        }
        if (!HEX64_RE.matcher(expectedSha256).matches()) {
            call.reject("Refusing APK download: missing or invalid expected SHA-256 checksum.", "INVALID_SHA256");
            return;
        }

        new Thread(() -> {
            File target = updateFile();
            if (target.exists()) {
                //noinspection ResultOfMethodCallIgnored
                target.delete();
            }
            HttpsURLConnection conn = null;
            try {
                String currentUrl = apkUrl;
                boolean connected = false;
                for (int hops = 0; hops <= MAX_REDIRECTS; hops++) {
                    URL url = new URL(currentUrl);
                    if (!"https".equalsIgnoreCase(url.getProtocol())) {
                        throw new SecurityException("Refusing non-HTTPS redirect during APK download");
                    }
                    conn = (HttpsURLConnection) url.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
                    conn.setReadTimeout(READ_TIMEOUT_MS);
                    conn.setRequestProperty("Accept", "application/octet-stream");
                    int status = conn.getResponseCode();
                    if (status == HttpURLConnection.HTTP_MOVED_TEMP
                            || status == HttpURLConnection.HTTP_MOVED_PERM
                            || status == HttpURLConnection.HTTP_SEE_OTHER
                            || status == 307
                            || status == 308) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (loc == null || !loc.startsWith("https://")) {
                            throw new SecurityException("Invalid redirect target during APK download");
                        }
                        currentUrl = loc;
                        continue;
                    }
                    if (status != HttpURLConnection.HTTP_OK) {
                        throw new IllegalStateException("Download failed with HTTP " + status);
                    }
                    connected = true;
                    break;
                }

                if (!connected || conn == null) {
                    throw new IllegalStateException("Too many redirects during APK download");
                }

                long totalBytes = conn.getContentLengthLong();
                MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
                long bytesRead = 0;
                int lastPercent = -1;

                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(target)) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        sha256.update(buf, 0, n);
                        bytesRead += n;
                        if (totalBytes > 0) {
                            int pct = (int) Math.min(100, (bytesRead * 100) / totalBytes);
                            if (pct != lastPercent) {
                                lastPercent = pct;
                                JSObject prog = new JSObject();
                                prog.put("percent", pct);
                                prog.put("bytesRead", bytesRead);
                                prog.put("totalBytes", totalBytes);
                                notifyListeners("downloadProgress", prog);
                            }
                        }
                    }
                    out.getFD().sync();
                }

                String actualSha256 = toHex(sha256.digest());
                if (!constantTimeEqualsHex(actualSha256, expectedSha256)) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    call.reject("APK checksum verification failed (SHA-256 mismatch).", "SHA256_MISMATCH");
                    return;
                }

                PackageInfo installed = getInstalledPackageInfo();
                PackageInfo archive = getArchivePackageInfo(target.getAbsolutePath());
                if (archive == null) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    call.reject("Downloaded file is not a valid Android package archive.", "INVALID_ARCHIVE");
                    return;
                }

                if (!installed.packageName.equals(archive.packageName)) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    call.reject("APK package ID mismatch.", "PACKAGE_MISMATCH");
                    return;
                }

                long installedCode = PackageInfoCompat.getLongVersionCode(installed);
                long archiveCode = PackageInfoCompat.getLongVersionCode(archive);
                if (archiveCode <= installedCode) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    call.reject("Refusing downgrade or same-version APK install.", "VERSION_NOT_NEWER");
                    return;
                }

                String installedCert = extractCertSha256(installed);
                String archiveCert = extractCertSha256(archive);
                if (!constantTimeEqualsHex(installedCert, archiveCert)) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    call.reject("APK signing certificate does not match the installed app.", "CERT_MISMATCH");
                    return;
                }
                if (!expectedCertSha256.isEmpty() && !constantTimeEqualsHex(archiveCert, expectedCertSha256)) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                    call.reject("APK signing certificate does not match release metadata.", "MANIFEST_CERT_MISMATCH");
                    return;
                }

                JSObject ret = new JSObject();
                ret.put("verified", true);
                ret.put("sha256", actualSha256);
                ret.put("versionCode", archiveCode);
                ret.put("versionName", archive.versionName != null ? archive.versionName : "");
                ret.put("canInstallPackages", canRequestInstalls());
                call.resolve(ret);
            } catch (Exception err) {
                if (target.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                }
                call.reject("APK download or verification failed: " + err.getMessage(), "DOWNLOAD_ERROR", err);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }).start();
    }

    @PluginMethod
    public void installVerifiedApk(PluginCall call) {
        File target = updateFile();
        if (!target.exists() || !target.isFile()) {
            call.reject("No verified APK update file found. Please download the update again.", "NO_APK");
            return;
        }
        if (!canRequestInstalls()) {
            JSObject ret = new JSObject();
            ret.put("launched", false);
            ret.put("needsInstallPermission", true);
            call.resolve(ret);
            return;
        }
        try {
            Uri apkUri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    target
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("launched", true);
            ret.put("needsInstallPermission", false);
            call.resolve(ret);
        } catch (Exception err) {
            call.reject("Could not launch Android package installer: " + err.getMessage(), "INSTALLER_ERROR", err);
        }
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }
}
