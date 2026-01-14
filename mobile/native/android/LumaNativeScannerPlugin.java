package com.luma.usher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LumaNativeScanner")
public class LumaNativeScannerPlugin extends Plugin {
  private static final String DEFAULT_ACTION = "android.intent.ACTION_DECODE_DATA";
  private static final String EXTRA_BARCODE = "barcode_string";
  private static final String EXTRA_TYPE = "barcodeType";

  private BroadcastReceiver scanReceiver;

  @Override
  public void load() {
    super.load();
    registerScanReceiver();
  }

  @PluginMethod
  public void startScan(PluginCall call) {
    // Trigger scan if SDK is present; otherwise rely on hardware trigger.
    try {
      Class<?> scanManagerClass = Class.forName("android.device.ScanManager");
      Object scanManager = scanManagerClass.getDeclaredConstructor().newInstance();
      scanManagerClass.getMethod("openScanner").invoke(scanManager);
      scanManagerClass.getMethod("scan").invoke(scanManager);
      call.resolve();
    } catch (Exception e) {
      JSObject err = new JSObject();
      err.put("message", "Scan trigger unavailable; use hardware trigger.");
      call.reject("Scan trigger unavailable", err.toString(), e);
    }
  }

  @Override
  protected void handleOnDestroy() {
    super.handleOnDestroy();
    unregisterScanReceiver();
  }

  private void registerScanReceiver() {
    if (scanReceiver != null) {
      return;
    }
    scanReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        if (intent == null) {
          return;
        }
        String code = intent.getStringExtra(EXTRA_BARCODE);
        String type = intent.getStringExtra(EXTRA_TYPE);
        if (code == null || code.trim().isEmpty()) {
          return;
        }
        JSObject data = new JSObject();
        data.put("value", code);
        data.put("type", type == null ? "" : type);
        notifyListeners("scan", data);
      }
    };

    IntentFilter filter = new IntentFilter(DEFAULT_ACTION);
    getContext().registerReceiver(scanReceiver, filter);
  }

  private void unregisterScanReceiver() {
    if (scanReceiver != null) {
      getContext().unregisterReceiver(scanReceiver);
      scanReceiver = null;
    }
  }
}
