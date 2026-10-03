package pl.tomaszwolak.dzienniczekhormonuwzrostu;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.os.CancellationSignal;
import android.print.PageRange;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/** Text-only layout shared by SAF export and Android's print spooler. No page bitmaps. */
final class ReportPdf {
    private static final float LINE = 12f;
    private final int width, height;
    private final float left, top, right, bottom;
    private final TextPaint text = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final List<List<Mark>> pages = new ArrayList<>();
    private List<Mark> page;
    private float y;
    private final CancellationSignal cancel;
    private final String footer;

    private static final class Mark {
        final String value;
        final float x, y, w, h, size;
        final boolean bold;
        Mark(String value, float x, float y, float w, float h, float size, boolean bold) {
            this.value = value; this.x = x; this.y = y; this.w = w; this.h = h;
            this.size = size; this.bold = bold;
        }
    }

    ReportPdf(JSONObject model, int width, int height, float left, float top,
              float right, float bottom, CancellationSignal cancel) throws Exception {
        this.width = width; this.height = height;
        this.left = Math.max(24, left); this.top = Math.max(24, top);
        this.right = width - Math.max(24, right); this.bottom = height - Math.max(36, bottom + 20);
        this.cancel = cancel;
        if (this.right - this.left < 150 || this.bottom - this.top < 100) {
            throw new IllegalArgumentException("Za mały obszar wydruku");
        }
        footer = model.optString("footer");
        text.setTextSize(9);
        newPage();
        JSONArray lines = model.getJSONArray("lines");
        for (int i = 0; i < lines.length(); i++) {
            for (String line : wrap(lines.getString(i), this.right - this.left - 8)) {
                if (y + LINE > this.bottom) newPage();
                page.add(new Mark(line, this.left + 4, y, 0, 0, 9, false));
                y += LINE;
            }
            y += 3;
        }
        y += 8;
        JSONArray columns = model.getJSONArray("columns");
        if (columns.length() < 1 || columns.length() > 12) throw new IllegalArgumentException("Kolumny");
        float total = 0;
        for (int i = 0; i < columns.length(); i++) total += columns.getJSONObject(i).getDouble("weight");
        if (total <= 0) throw new IllegalArgumentException("Szerokość tabeli");
        float[] widths = new float[columns.length()];
        JSONArray headers = new JSONArray();
        for (int i = 0; i < widths.length; i++) {
            widths[i] = (this.right - this.left) * (float) columns.getJSONObject(i).getDouble("weight") / total;
            if (widths[i] < 15) throw new IllegalArgumentException("Za wąska kolumna");
            headers.put(columns.getJSONObject(i).getString("label"));
        }
        List<List<String>> heading = cells(headers, widths);
        int headerLines = maxLines(heading);
        float headerHeight = headerLines * LINE + 8;
        if (y + headerHeight + 20 > this.bottom) newPage();
        row(heading, widths, 0, headerLines, true);
        JSONArray rows = model.getJSONArray("rows");
        for (int i = 0; i < rows.length(); i++) {
            cancel.throwIfCanceled();
            JSONArray values = rows.getJSONArray(i);
            if (values.length() != widths.length) throw new IllegalArgumentException("Wiersz");
            List<List<String>> cellLines = cells(values, widths);
            int count = maxLines(cellLines), offset = 0;
            while (offset < count) {
                int available = (int) ((this.bottom - y - 8) / LINE);
                // Keep an ordinary row together; split only a row taller than a whole page.
                int fullPageLines = (int) ((this.bottom - this.top - 28 - headerHeight - 8) / LINE);
                if (available < 1 || (offset == 0 && count <= fullPageLines && count > available)) {
                    newPage(); row(heading, widths, 0, headerLines, true);
                    available = (int) ((this.bottom - y - 8) / LINE);
                }
                int take = Math.min(available, count - offset);
                if (take < 1) throw new IllegalArgumentException("Za mały obszar tabeli");
                row(cellLines, widths, offset, take, false);
                offset += take;
            }
        }
        if (rows.length() == 0) page.add(new Mark("Brak wpisów.", this.left + 4, y + 5, 0, 0, 9, false));
    }

    private void newPage() {
        cancel.throwIfCanceled();
        page = new ArrayList<>(); pages.add(page); y = top;
        page.add(new Mark("Dzienniczek Hormonu", left, y, 0, 0, 16, true));
        y += 28;
    }

    private List<String> wrap(String value, float width) {
        cancel.throwIfCanceled();
        // StaticLayout handles Polish glyphs, explicit newlines and long unbroken words.
        StaticLayout layout = StaticLayout.Builder.obtain(value, 0, value.length(), text, Math.max(1, (int) width))
                .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).build();
        List<String> result = new ArrayList<>();
        for (int i = 0; i < layout.getLineCount(); i++) {
            result.add(value.substring(layout.getLineStart(i), layout.getLineEnd(i)).replace("\n", ""));
        }
        if (result.isEmpty()) result.add("");
        return result;
    }

    private List<List<String>> cells(JSONArray values, float[] widths) throws Exception {
        List<List<String>> result = new ArrayList<>();
        for (int i = 0; i < widths.length; i++) result.add(wrap(values.getString(i), widths[i] - 8));
        return result;
    }
    private int maxLines(List<List<String>> cells) {
        int count = 1;
        for (List<String> cell : cells) count = Math.max(count, cell.size());
        return count;
    }
    private void row(List<List<String>> cells, float[] widths, int offset, int count, boolean header) {
        float x = left, h = count * LINE + 8;
        for (int col = 0; col < cells.size(); col++) {
            page.add(new Mark(null, x, y, widths[col], h, 0, header));
            List<String> cell = cells.get(col);
            for (int i = offset; i < Math.min(cell.size(), offset + count); i++) {
                page.add(new Mark(cell.get(i), x + 4, y + 4 + (i - offset) * LINE, 0, 0, 9, false));
            }
            x += widths[col];
        }
        y += h;
    }
    int pageCount() { return pages.size(); }
    static boolean selected(int page, PageRange[] ranges) {
        if (ranges == null) return true;
        for (PageRange range : ranges) if (page >= range.getStart() && page <= range.getEnd()) return true;
        return false;
    }

    void write(OutputStream output, PageRange[] ranges, CancellationSignal signal) throws IOException {
        PdfDocument document = new PdfDocument();
        try {
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            int outputPage = 0;
            for (int i = 0; i < pages.size(); i++) {
                signal.throwIfCanceled();
                if (!selected(i, ranges)) continue;
                PdfDocument.Page pdfPage = document.startPage(new PdfDocument.PageInfo.Builder(width, height, ++outputPage).create());
                Canvas canvas = pdfPage.getCanvas();
                for (Mark mark : pages.get(i)) {
                    if (mark.value == null) {
                        paint.setStyle(Paint.Style.FILL); paint.setColor(mark.bold ? 0xffe9f7f4 : Color.WHITE);
                        canvas.drawRect(mark.x, mark.y, mark.x + mark.w, mark.y + mark.h, paint);
                        paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(0.4f); paint.setColor(0xffcfdce5);
                        canvas.drawRect(mark.x, mark.y, mark.x + mark.w, mark.y + mark.h, paint);
                    } else {
                        paint.setStyle(Paint.Style.FILL); paint.setColor(0xff17324d); paint.setTextSize(mark.size);
                        paint.setTypeface(mark.bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
                        canvas.drawText(mark.value, mark.x, mark.y - paint.ascent(), paint);
                    }
                }
                paint.setStyle(Paint.Style.FILL); paint.setTypeface(Typeface.DEFAULT); paint.setColor(0xff60768a); paint.setTextSize(7);
                canvas.drawText(footer, left, bottom + 12, paint);
                String number = "Strona " + (i + 1) + " z " + pages.size();
                canvas.drawText(number, right - paint.measureText(number), bottom + 12, paint);
                document.finishPage(pdfPage);
            }
            signal.throwIfCanceled();
            document.writeTo(output);
        } finally { document.close(); }
    }
}
