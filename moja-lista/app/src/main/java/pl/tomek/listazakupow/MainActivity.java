package pl.tomek.listazakupow;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

public class MainActivity extends Activity {
    private static final int GREEN = Color.rgb(31,138,91);
    private static final int BG = Color.rgb(247,248,250);
    private static final int TEXT = Color.rgb(35,40,48);
    private static final int MUTED = Color.rgb(110,116,124);
    private static final String PREFS = "moja_lista";
    private static final String DATA = "data";
    private static final String[] CATS = {"Inne","Warzywa i owoce","Pieczywo","Nabiał","Mięso i wędliny","Napoje","Słodycze","Mrożonki","Chemia","Dom"};

    private final List<ShopList> lists = new ArrayList<>();
    private ShopList current;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        load();
        if (lists.isEmpty()) {
            ShopList l = new ShopList("Zakupy");
            l.items.add(new Item("Mleko","Nabiał","1 szt."));
            l.items.add(new Item("Chleb","Pieczywo","1 szt."));
            lists.add(l);
            save();
        }
        showLists();
    }

    @Override public void onBackPressed() {
        if (current != null) { current = null; showLists(); }
        else super.onBackPressed();
    }

    private void showLists() {
        current = null;
        LinearLayout root = root();
        root.addView(header("Moja Lista", "Zakupy bez konta i bez internetu"));
        Button add = button("+  Nowa lista");
        add.setOnClickListener(v -> newList());
        root.addView(add, lp(16,14,16,8));
        root.addView(label("Twoje listy",18,true,TEXT), lp(18,12,18,6));
        for (ShopList l : lists) root.addView(listCard(l), lp(12,4,12,4));
        setContentView(scroll(root));
    }

    private View listCard(ShopList l) {
        LinearLayout card = card();
        int bought = 0; for (Item i : l.items) if (i.bought) bought++;
        TextView name = label(l.name,19,true,TEXT);
        TextView sub = label(l.items.size()+" produktów • "+bought+" kupionych",14,false,MUTED);
        card.addView(name); card.addView(sub);
        card.setOnClickListener(v -> { current=l; showCurrent(); });
        card.setOnLongClickListener(v -> { listMenu(l); return true; });
        return card;
    }

    private void showCurrent() {
        if (current == null) return;
        LinearLayout root = root();
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL); bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(8),dp(10),dp(8),dp(10)); bar.setBackgroundColor(GREEN);
        Button back = headerButton("‹"); back.setOnClickListener(v -> { current=null; showLists(); });
        bar.addView(back,new LinearLayout.LayoutParams(dp(50),dp(50)));
        LinearLayout titles = new LinearLayout(this); titles.setOrientation(LinearLayout.VERTICAL);
        titles.addView(label(current.name,22,true,Color.WHITE));
        titles.addView(label(progress(),13,false,Color.WHITE));
        bar.addView(titles,new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));
        Button menu = headerButton("⋮"); menu.setOnClickListener(v -> currentMenu());
        bar.addView(menu,new LinearLayout.LayoutParams(dp(50),dp(50))); root.addView(bar);

        Button add = button("+  Dodaj produkt"); add.setOnClickListener(v -> addProduct());
        root.addView(add, lp(16,14,16,6));

        List<Item> copy = new ArrayList<>(current.items);
        copy.sort(Comparator.comparing((Item i)->i.bought).thenComparing(i->i.category).thenComparing(i->i.name.toLowerCase()));
        if (copy.isEmpty()) {
            TextView e=label("Lista jest pusta. Dodaj pierwszy produkt.",16,false,MUTED); e.setGravity(Gravity.CENTER); e.setPadding(20,80,20,80); root.addView(e);
        } else {
            String last="";
            for (Item i:copy) {
                String group=i.bought?"KUPIONE":i.category.toUpperCase();
                if (!group.equals(last)) { root.addView(label(group,12,true,MUTED),lp(18,16,18,2)); last=group; }
                root.addView(itemRow(i),lp(12,3,12,3));
            }
        }
        setContentView(scroll(root));
    }

    private View itemRow(Item i) {
        LinearLayout row=card(); row.setOrientation(LinearLayout.HORIZONTAL); row.setGravity(Gravity.CENTER_VERTICAL); row.setPadding(dp(10),dp(8),dp(10),dp(8));
        CheckBox cb=new CheckBox(this); cb.setChecked(i.bought); row.addView(cb,new LinearLayout.LayoutParams(dp(50),dp(50)));
        LinearLayout info=new LinearLayout(this); info.setOrientation(LinearLayout.VERTICAL);
        TextView n=label(i.name,17,true,i.bought?MUTED:TEXT); if(i.bought) n.setPaintFlags(n.getPaintFlags()|Paint.STRIKE_THRU_TEXT_FLAG);
        info.addView(n); info.addView(label(i.quantity+" • "+i.category,13,false,MUTED));
        row.addView(info,new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));
        Button more=headerButton("⋮"); more.setTextColor(MUTED); more.setOnClickListener(v->itemMenu(i)); row.addView(more,new LinearLayout.LayoutParams(dp(48),dp(48)));
        cb.setOnCheckedChangeListener((b,x)->{ i.bought=x; save(); showCurrent(); });
        row.setOnClickListener(v->cb.setChecked(!cb.isChecked()));
        return row;
    }

    private void addProduct() {
        LinearLayout box=dialogBox();
        EditText name=edit("Nazwa produktu");
        EditText qty=edit("Ilość, np. 2 szt."); qty.setText("1 szt.");
        Spinner cat=new Spinner(this); cat.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,CATS));
        box.addView(name); box.addView(qty,lp(0,8,0,8)); box.addView(cat);
        new AlertDialog.Builder(this).setTitle("Dodaj produkt").setView(box).setNegativeButton("Anuluj",null).setPositiveButton("Dodaj",(d,w)->{
            String n=name.getText().toString().trim(); if(n.isEmpty()){ Toast.makeText(this,"Wpisz nazwę produktu",Toast.LENGTH_SHORT).show(); return; }
            String q=qty.getText().toString().trim(); if(q.isEmpty()) q="1 szt.";
            current.items.add(new Item(n,cat.getSelectedItem().toString(),q)); save(); showCurrent();
        }).show();
    }

    private void itemMenu(Item i) {
        new AlertDialog.Builder(this).setTitle(i.name).setItems(new String[]{"Edytuj","Usuń"},(d,w)->{ if(w==0) editItem(i); else { current.items.remove(i); save(); showCurrent(); } }).show();
    }

    private void editItem(Item i) {
        LinearLayout box=dialogBox(); EditText name=edit("Nazwa"); name.setText(i.name); EditText qty=edit("Ilość"); qty.setText(i.quantity);
        Spinner cat=new Spinner(this); cat.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,CATS));
        for(int x=0;x<CATS.length;x++) if(CATS[x].equals(i.category)) cat.setSelection(x);
        box.addView(name); box.addView(qty,lp(0,8,0,8)); box.addView(cat);
        new AlertDialog.Builder(this).setTitle("Edytuj produkt").setView(box).setNegativeButton("Anuluj",null).setPositiveButton("Zapisz",(d,w)->{
            String n=name.getText().toString().trim(); if(!n.isEmpty()) i.name=n;
            String q=qty.getText().toString().trim(); i.quantity=q.isEmpty()?"1 szt.":q; i.category=cat.getSelectedItem().toString(); save(); showCurrent();
        }).show();
    }

    private void newList() {
        EditText e=edit("Np. Zakupy na weekend"); e.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        LinearLayout box=dialogBox(); box.addView(e);
        new AlertDialog.Builder(this).setTitle("Nowa lista").setView(box).setNegativeButton("Anuluj",null).setPositiveButton("Utwórz",(d,w)->{
            String n=e.getText().toString().trim(); if(n.isEmpty()) n="Nowa lista"; ShopList l=new ShopList(n); lists.add(0,l); save(); current=l; showCurrent();
        }).show();
    }

    private void listMenu(ShopList l) {
        new AlertDialog.Builder(this).setTitle(l.name).setItems(new String[]{"Otwórz","Zmień nazwę","Usuń"},(d,w)->{
            if(w==0){current=l;showCurrent();} else if(w==1) rename(l); else confirmDelete(l);
        }).show();
    }

    private void currentMenu() {
        new AlertDialog.Builder(this).setTitle(current.name).setItems(new String[]{"Zmień nazwę","Udostępnij jako tekst","Usuń kupione","Usuń listę"},(d,w)->{
            if(w==0) rename(current); else if(w==1) share(); else if(w==2){ current.items.removeIf(i->i.bought); save(); showCurrent(); } else confirmDelete(current);
        }).show();
    }

    private void rename(ShopList l) {
        EditText e=edit("Nazwa listy"); e.setText(l.name); LinearLayout box=dialogBox(); box.addView(e);
        new AlertDialog.Builder(this).setTitle("Zmień nazwę").setView(box).setNegativeButton("Anuluj",null).setPositiveButton("Zapisz",(d,w)->{
            String n=e.getText().toString().trim(); if(!n.isEmpty()) l.name=n; save(); if(current==l) showCurrent(); else showLists();
        }).show();
    }

    private void confirmDelete(ShopList l) {
        new AlertDialog.Builder(this).setTitle("Usunąć listę?").setMessage(l.name).setNegativeButton("Nie",null).setPositiveButton("Usuń",(d,w)->{ lists.remove(l); current=null; save(); showLists(); }).show();
    }

    private void share() {
        StringBuilder s=new StringBuilder(current.name).append("\n\n"); for(Item i:current.items) if(!i.bought) s.append("☐ ").append(i.name).append(" — ").append(i.quantity).append("\n");
        Intent in=new Intent(Intent.ACTION_SEND); in.setType("text/plain"); in.putExtra(Intent.EXTRA_TEXT,s.toString()); startActivity(Intent.createChooser(in,"Udostępnij listę"));
    }

    private String progress(){ int b=0; for(Item i:current.items) if(i.bought)b++; return b+" z "+current.items.size()+" kupione"; }

    private LinearLayout root(){ LinearLayout l=new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); l.setBackgroundColor(BG); l.setMinimumHeight(getResources().getDisplayMetrics().heightPixels); return l; }
    private ScrollView scroll(View v){ ScrollView s=new ScrollView(this); s.setFillViewport(true); s.addView(v,new ScrollView.LayoutParams(-1,-2)); return s; }
    private View header(String a,String b){ LinearLayout l=new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); l.setPadding(dp(20),dp(22),dp(20),dp(20)); l.setBackgroundColor(GREEN); l.addView(label(a,28,true,Color.WHITE)); l.addView(label(b,14,false,Color.WHITE)); return l; }
    private LinearLayout card(){ LinearLayout l=new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); l.setPadding(dp(16),dp(14),dp(16),dp(14)); android.graphics.drawable.GradientDrawable g=new android.graphics.drawable.GradientDrawable(); g.setColor(Color.WHITE); g.setCornerRadius(dp(14)); g.setStroke(dp(1),Color.rgb(228,232,236)); l.setBackground(g); l.setElevation(dp(1)); return l; }
    private Button button(String s){ Button b=new Button(this); b.setText(s); b.setTextColor(Color.WHITE); b.setTextSize(16); b.setAllCaps(false); android.graphics.drawable.GradientDrawable g=new android.graphics.drawable.GradientDrawable(); g.setColor(GREEN); g.setCornerRadius(dp(12)); b.setBackground(g); b.setMinHeight(dp(52)); return b; }
    private Button headerButton(String s){ Button b=new Button(this); b.setText(s); b.setTextSize(28); b.setTextColor(Color.WHITE); b.setBackgroundColor(Color.TRANSPARENT); b.setPadding(0,0,0,0); return b; }
    private TextView label(String s,int sp,boolean bold,int color){ TextView t=new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(color); if(bold)t.setTypeface(null,1); return t; }
    private EditText edit(String h){ EditText e=new EditText(this); e.setHint(h); e.setTextSize(16); e.setPadding(dp(12),dp(9),dp(12),dp(9)); return e; }
    private LinearLayout dialogBox(){ LinearLayout l=new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); l.setPadding(dp(20),dp(6),dp(20),dp(2)); return l; }
    private LinearLayout.LayoutParams lp(int l,int t,int r,int b){ LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2); p.setMargins(dp(l),dp(t),dp(r),dp(b)); return p; }
    private int dp(int x){ return Math.round(x*getResources().getDisplayMetrics().density); }

    private void save(){
        try{ JSONArray a=new JSONArray(); for(ShopList l:lists){ JSONObject o=new JSONObject(); o.put("id",l.id); o.put("name",l.name); JSONArray ia=new JSONArray(); for(Item i:l.items){ JSONObject q=new JSONObject(); q.put("id",i.id); q.put("name",i.name); q.put("category",i.category); q.put("quantity",i.quantity); q.put("bought",i.bought); ia.put(q);} o.put("items",ia); a.put(o);} getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString(DATA,a.toString()).apply(); }catch(Exception ignored){}
    }

    private void load(){
        lists.clear(); String raw=getSharedPreferences(PREFS,MODE_PRIVATE).getString(DATA,"[]");
        try{ JSONArray a=new JSONArray(raw); for(int x=0;x<a.length();x++){ JSONObject o=a.getJSONObject(x); ShopList l=new ShopList(o.optString("name","Lista")); l.id=o.optString("id",UUID.randomUUID().toString()); JSONArray ia=o.optJSONArray("items"); if(ia!=null) for(int y=0;y<ia.length();y++){ JSONObject q=ia.getJSONObject(y); Item i=new Item(q.optString("name","Produkt"),q.optString("category","Inne"),q.optString("quantity","1 szt.")); i.id=q.optString("id",UUID.randomUUID().toString()); i.bought=q.optBoolean("bought",false); l.items.add(i);} lists.add(l);} }catch(Exception ignored){ lists.clear(); }
    }

    static class ShopList { String id=UUID.randomUUID().toString(); String name; List<Item> items=new ArrayList<>(); ShopList(String n){name=n;} }
    static class Item { String id=UUID.randomUUID().toString(); String name,category,quantity; boolean bought=false; Item(String n,String c,String q){name=n;category=c;quantity=q;} }
}
