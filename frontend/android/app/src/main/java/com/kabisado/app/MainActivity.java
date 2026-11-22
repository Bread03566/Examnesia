package com.kabisado.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KabisadoKeystorePlugin.class);
        registerPlugin(KabisadoSpeechPlugin.class);
        registerPlugin(KabisadoUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
