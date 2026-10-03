package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.OperationCanceledException;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Log;
import org.json.JSONObject;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Activity-scoped jobs: no private health reports left in an unencrypted temp directory. */
final class ReportService {
    static final int SAVE_REPORT = 4106;
    interface Events { void send(String id, boolean done, boolean success, String state); }
    private final Activity activity;
    private final Events events;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private boolean busy;
    private volatile boolean destroyed;
    private String jobId;
    private ReportPdf pending;
    private CancellationSignal cancellation;

    ReportService(Activity activity, Events events) { this.activity = activity; this.events = events; }
    synchronized boolean isBusy() { return busy; }
    synchronized boolean start(String id, String filename, String json, boolean print) {
        if (busy || destroyed || id == null || id.length() > 100 || json == null || json.length() > 20 * 1024 * 1024) return false;
        busy = true; jobId = id; cancellation = new CancellationSignal();
        final CancellationSignal signal = cancellation;
        final String name = filename == null ? "Dzienniczek Hormonu.pdf" : filename.replace('/', '-').replace('\\', '-');
        executor.execute(() -> {
            try {
                final long start = System.nanoTime();
                JSONObject model = new JSONObject(json);
                events.send(id, false, false, "preparing");
                if (print) {
                    activity.runOnUiThread(() -> {
                        if (destroyed) return;
                        try {
                            PrintManager manager = (PrintManager) activity.getSystemService(Activity.PRINT_SERVICE);
                            if (manager == null) throw new IllegalStateException("Brak usługi drukowania");
                            manager.print(name, new Adapter(model, id), new PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape())
                                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR).build());
                        } catch (Exception e) { finish(id, false, "print_failed"); }
                    });
                } else {
                    ReportPdf report = new ReportPdf(model, 842, 595, 30, 30, 30, 0, signal);
                    Log.i("ReportPerformance", "layout_ms=" + (System.nanoTime() - start) / 1000000 + " pages=" + report.pageCount());
                    activity.runOnUiThread(() -> {
                        if (destroyed) return;
                        pending = report;
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("application/pdf");
                        intent.putExtra(Intent.EXTRA_TITLE, name.endsWith(".pdf") ? name : name + ".pdf");
                        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        try { events.send(id, false, false, "picker"); activity.startActivityForResult(intent, SAVE_REPORT); }
                        catch (Exception e) { finish(id, false, "picker_failed"); }
                    });
                }
            } catch (OperationCanceledException e) { finish(id, false, "cancelled"); }
            catch (Exception e) { finish(id, false, "generation_failed"); }
        });
        return true;
    }

    void saveResult(int result, Intent data) {
        final String id = jobId;
        final ReportPdf report = pending;
        pending = null;
        if (result != Activity.RESULT_OK || data == null || data.getData() == null) {
            finish(id, false, "cancelled"); return;
        }
        if (report == null) { finish(id, false, "missing_content"); return; }
        final Uri uri = data.getData();
        final CancellationSignal signal = cancellation;
        executor.execute(() -> {
            events.send(id, false, false, "writing");
            long start = System.nanoTime();
            try (OutputStream out = activity.getContentResolver().openOutputStream(uri, "w")) {
                if (out == null) throw new IllegalStateException("Brak strumienia");
                report.write(out, null, signal);
                out.flush();
                Log.i("ReportPerformance", "write_ms=" + (System.nanoTime() - start) / 1000000);
            } catch (OperationCanceledException e) { finish(id, false, "cancelled"); return; }
            catch (Exception e) { finish(id, false, "write_failed"); return; }
            finish(id, true, "saved");
        });
    }

    private synchronized void finish(String id, boolean success, String state) {
        if (!busy || id == null || !id.equals(jobId)) return;
        pending = null; busy = false; jobId = null;
        if (!destroyed) events.send(id, true, success, state);
    }
    synchronized void destroy() {
        destroyed = true;
        if (cancellation != null) cancellation.cancel();
        pending = null; executor.shutdownNow();
    }

    private final class Adapter extends PrintDocumentAdapter {
        private final JSONObject model;
        private final String id;
        private volatile ReportPdf layout;
        private volatile boolean finished;
        private CancellationSignal activeSignal;
        Adapter(JSONObject model, String id) { this.model = model; this.id = id; }
        @Override public void onLayout(PrintAttributes oldAttributes, PrintAttributes attributes,
                CancellationSignal signal, LayoutResultCallback callback, Bundle extras) {
            activeSignal = signal;
            executor.execute(() -> {
                try {
                    PrintAttributes.MediaSize size = attributes.getMediaSize();
                    PrintAttributes.Margins m = attributes.getMinMargins();
                    if (size == null || m == null) throw new IllegalArgumentException("Format strony");
                    ReportPdf next = new ReportPdf(model, Math.round(size.getWidthMils() * .072f),
                            Math.round(size.getHeightMils() * .072f), m.getLeftMils() * .072f,
                            m.getTopMils() * .072f, m.getRightMils() * .072f, m.getBottomMils() * .072f, signal);
                    signal.throwIfCanceled();
                    layout = next;
                    activity.runOnUiThread(() -> {
                        if (finished || signal.isCanceled()) callback.onLayoutCancelled();
                        else callback.onLayoutFinished(new PrintDocumentInfo.Builder("Dzienniczek Hormonu.pdf")
                                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                                .setPageCount(next.pageCount()).build(), !attributes.equals(oldAttributes));
                    });
                } catch (OperationCanceledException e) { activity.runOnUiThread(callback::onLayoutCancelled); }
                catch (Exception e) { activity.runOnUiThread(() -> callback.onLayoutFailed("Nie udało się przygotować raportu.")); }
            });
        }
        @Override public void onWrite(PageRange[] ranges, ParcelFileDescriptor destination,
                CancellationSignal signal, WriteResultCallback callback) {
            activeSignal = signal;
            final ReportPdf report = layout;
            executor.execute(() -> {
                try (OutputStream out = new ParcelFileDescriptor.AutoCloseOutputStream(destination)) {
                    if (report == null || finished) throw new IllegalStateException("Brak układu");
                    report.write(out, ranges, signal);
                    out.flush(); signal.throwIfCanceled();
                    ArrayList<PageRange> written = new ArrayList<>();
                    for (int i = 0; i < report.pageCount(); i++) if (ReportPdf.selected(i, ranges)) written.add(new PageRange(i, i));
                    activity.runOnUiThread(() -> {
                        if (signal.isCanceled() || finished) callback.onWriteCancelled();
                        else callback.onWriteFinished(written.toArray(new PageRange[0]));
                    });
                } catch (OperationCanceledException e) { activity.runOnUiThread(callback::onWriteCancelled); }
                catch (Exception e) { activity.runOnUiThread(() -> callback.onWriteFailed("Nie udało się zapisać wydruku.")); }
            });
        }
        @Override public void onFinish() {
            finished = true;
            if (activeSignal != null) activeSignal.cancel();
            layout = null;
            // Closing the spooler is not proof that a physical printer printed the report.
            finish(id, true, "print_closed");
        }
    }
}
