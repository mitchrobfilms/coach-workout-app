package com.glp1life.app;

import android.app.Activity;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.List;

// Standard Google Play Billing (library 8.3.0). This class does not acknowledge a purchase.
// The server verifies the purchase token with Google and acknowledges it only after granting access.
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall purchaseCall;

    private BillingClient client() {
        if (client == null) {
            client = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
        }
        return client;
    }

    private void ready(PluginCall call, Runnable next) {
        BillingClient billing = client();
        if (billing.isReady()) { next.run(); return; }
        billing.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) next.run();
                else call.reject("Billing is unavailable (" + result.getResponseCode() + ")");
            }
            @Override public void onBillingServiceDisconnected() { }
        });
    }

    @PluginMethod
    public void isReady(PluginCall call) {
        ready(call, () -> {
            JSObject out = new JSObject();
            out.put("connected", true);
            out.put("library", "billing-8.3.0");
            call.resolve(out);
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId", "");
        String basePlanId = call.getString("basePlanId", "");
        String accountId = call.getString("obfuscatedAccountId", "");
        if (productId.isEmpty() || accountId.isEmpty()) { call.reject("not_configured"); return; }
        Activity activity = getActivity();
        if (activity == null) { call.reject("no_activity"); return; }
        ready(call, () -> {
            QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build();
            QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();
            client.queryProductDetailsAsync(params, (BillingResult result, QueryProductDetailsResult details) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("product_query_failed"); return; }
                List<ProductDetails> list = details.getProductDetailsList();
                if (list == null || list.isEmpty()) { call.reject("product_missing"); return; }
                ProductDetails found = list.get(0);
                String offerToken = "";
                List<ProductDetails.SubscriptionOfferDetails> offers = found.getSubscriptionOfferDetails();
                if (offers != null) {
                    for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                        if (basePlanId.isEmpty() || basePlanId.equals(offer.getBasePlanId())) { offerToken = offer.getOfferToken(); break; }
                    }
                }
                if (offerToken.isEmpty()) { call.reject("base_plan_missing"); return; }
                BillingFlowParams.ProductDetailsParams productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(found)
                    .setOfferToken(offerToken)
                    .build();
                BillingFlowParams flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(productParams))
                    .setObfuscatedAccountId(accountId)
                    .build();
                purchaseCall = call;
                BillingResult launched = client.launchBillingFlow(activity, flow);
                if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    purchaseCall = null;
                    call.reject("launch_failed");
                }
            });
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = purchaseCall;
        purchaseCall = null;
        if (call == null) return;
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject out = new JSObject();
            out.put("cancelled", true);
            call.resolve(out);
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject("purchase_failed");
            return;
        }
        call.resolve(purchaseObject(purchases.get(0)));
    }

    @PluginMethod
    public void restore(PluginCall call) {
        ready(call, () -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (BillingResult result, List<Purchase> purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("restore_failed"); return; }
                JSArray tokens = new JSArray();
                if (purchases != null) for (Purchase purchase : purchases) tokens.put(purchase.getPurchaseToken());
                JSObject out = new JSObject();
                out.put("purchaseTokens", tokens);
                call.resolve(out);
            }));
    }

    private JSObject purchaseObject(Purchase purchase) {
        JSObject out = new JSObject();
        boolean pending = purchase.getPurchaseState() == Purchase.PurchaseState.PENDING;
        out.put("pending", pending);
        out.put("purchaseState", pending ? "PENDING" : "PURCHASED");
        out.put("purchaseToken", purchase.getPurchaseToken());
        out.put("acknowledgedHere", false);
        return out;
    }
}
