package com.kabisado.app;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.UUID;

/**
 * Native Android TextToSpeech adapter for reading flashcards, quiz questions, and chat answers aloud.
 * Resolves the speak() call when the matching utteranceId completes or is stopped so the UI Stop toggle stays accurate.
 */
@CapacitorPlugin(name = "KabisadoSpeech")
public class KabisadoSpeechPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private volatile boolean ready = false;
    private PluginCall activeCall = null;
    private String activeUtteranceId = null;

    @Override
    public synchronized void load() {
        tts = new TextToSpeech(getContext(), this);
    }

    @Override
    public synchronized void onInit(int status) {
        if (status == TextToSpeech.SUCCESS && tts != null) {
            tts.setLanguage(Locale.US);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {}

                @Override
                public void onDone(String utteranceId) {
                    resolveIfMatching(utteranceId);
                }

                @Override
                @SuppressWarnings("deprecation")
                public void onError(String utteranceId) {
                    resolveIfMatching(utteranceId);
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    resolveIfMatching(utteranceId);
                }

                @Override
                public void onStop(String utteranceId, boolean interrupted) {
                    resolveIfMatching(utteranceId);
                }
            });
            ready = true;
        }
    }

    private synchronized void resolveIfMatching(String utteranceId) {
        if (utteranceId != null && utteranceId.equals(activeUtteranceId)) {
            resolveActiveCall();
        }
    }

    private synchronized void resolveActiveCall() {
        activeUtteranceId = null;
        if (activeCall != null) {
            PluginCall callToResolve = activeCall;
            activeCall = null;
            callToResolve.resolve();
        }
    }

    @PluginMethod
    public synchronized void speak(PluginCall call) {
        resolveActiveCall();
        String text = call.getString("text", "");
        Float rate = call.getFloat("rate", 1.0f);
        if (!ready || tts == null || text == null || text.isEmpty()) {
            call.resolve();
            return;
        }
        String utteranceId = "kabisado-" + UUID.randomUUID().toString();
        activeCall = call;
        activeUtteranceId = utteranceId;
        tts.setSpeechRate(rate != null ? rate : 1.0f);
        int res = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        if (res == TextToSpeech.ERROR) {
            resolveActiveCall();
        }
    }

    @PluginMethod
    public synchronized void stop(PluginCall call) {
        if (tts != null) {
            tts.stop();
        }
        resolveActiveCall();
        call.resolve();
    }

    @Override
    protected synchronized void handleOnDestroy() {
        resolveActiveCall();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        ready = false;
    }
}
