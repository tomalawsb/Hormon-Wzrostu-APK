'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');

async function main() {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    runScripts: 'outside-only',
    url: 'https://example.test/',
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.fetch = fetch;
  const source = fs
    .readFileSync(path.join(root, 'app.js'), 'utf8')
    .replace("document.addEventListener('DOMContentLoaded', init);", '')
    .replace(
      /\}\)\(\);\s*$/,
      `
      cacheElements();
      window.testReport = () => {
        const profile = data.profiles[0];
        profile.name = 'Żółć <test> & profil';
        profile.ampoules = [{id:'a',number:1,startDate:'2025-01-01',volumeMl:'3',doseMl:'0.3',targetDoseCount:10,status:'finished'}];
        profile.entries = Array.from({length:10}, (_,i) => ({id:'e'+i,ampouleId:'a',date:'2025-01-'+String(i+1).padStart(2,'0'),time:'20:00',status:i===5?'skipped':'given',dose:'1',unit:'mg',ampouleDoseMl:'0.3',side:'lewa',site:'udo',note:i===9?'Długa notatka <&> '.repeat(300)+'KONIEC-NOTATKI':'wpis '+i}));
        el['report-profile-filter'].innerHTML = '<option value="'+profile.id+'">profil</option>';
        el['report-date-from'].value='2025-01-08';
        el['report-include-ampoules'].checked=true;
        const config=getReportConfiguration();
        const before=JSON.stringify(data);
        const model=createReportModel(config);
        return {model,unchanged:before===JSON.stringify(data),memo:model===createReportModel(config),remaining:config.records.find(r=>r.entry.id==='e7').ampouleRow.remainingAfter,summaryRecords:getReportConfiguration({summaryOnly:true}).records.length};
      };
    })();`
    );
  w.eval(source);
  const result = w.testReport();
  assert.equal(result.unchanged, true);
  assert.equal(result.memo, true);
  assert.equal(result.model.rows.length, 3);
  assert.equal(result.summaryRecords, 0);
  assert.ok(
    Math.abs(result.remaining - 0.9) < 0.00001,
    'Include consumption before report start; skip must not consume'
  );
  const context = { Blob, TextEncoder, Uint8Array, Uint32Array, DataView, self: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'report-worker.js'), 'utf8'), context);
  assert.equal(
    vm.runInContext("crc32(new TextEncoder().encode('123456789'))", context),
    0xcbf43926
  );
  const output = await new Promise((resolve) => {
    context.self.postMessage = resolve;
    context.self.onmessage({ data: { id: 7, model: result.model } });
  });
  assert.equal(output.id, 7);
  assert.ok(!output.error);
  const bytes = Buffer.from(output.buffer);
  let offset = 0;
  const files = new Map();
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const n = bytes.readUInt16LE(offset + 26),
      extra = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + n).toString('utf8');
    const content = bytes.subarray(offset + 30 + n + extra, offset + 30 + n + extra + size);
    context.bytes = content;
    assert.equal(bytes.readUInt32LE(offset + 14), vm.runInContext('crc32(bytes)', context), name);
    files.set(name, content.toString('utf8'));
    offset += 30 + n + extra + size;
  }
  assert.equal(files.size, 7);
  for (const [name, xml] of files) {
    const parsed = new w.DOMParser().parseFromString(xml, 'text/xml');
    assert.equal(parsed.querySelector('parsererror'), null, name);
  }
  const xml = files.get('word/document.xml');
  assert.ok(xml.includes('KONIEC-NOTATKI'));
  assert.ok(xml.includes('Żółć &lt;test&gt; &amp; profil'));
  assert.equal((xml.match(/<w:tr>/g) || []).length, 4);
  dom.window.close();

  let now = 10000,
    exits = 0,
    dialogs = [];
  const back = {
    window: {
      NativeBridge: {
        exitApp() {
          exits++;
        },
      },
    },
    document: { querySelectorAll: () => dialogs, activeElement: null },
    el: {},
    activeView: 'more',
    appLocked: false,
    Event,
    performance: { now: () => now },
    showToast() {},
    switchView(value) {
      back.activeView = value;
    },
  };
  vm.createContext(back);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/platform/native-events.js'), 'utf8'), back);
  back.handleNativeBackButton();
  assert.equal(back.activeView, 'today');
  assert.equal(exits, 0);
  back.handleNativeBackButton();
  now += 2001;
  back.handleNativeBackButton();
  assert.equal(exits, 0);
  now += 100;
  back.handleNativeBackButton();
  assert.equal(exits, 1);
  const dialog = {
    open: true,
    dispatchEvent: () => false,
    close() {
      this.open = false;
    },
  };
  dialogs = [dialog];
  back.handleNativeBackButton();
  assert.equal(dialog.open, true, 'Respect cancelled dismissal');
  dialog.dispatchEvent = () => true;
  back.handleNativeBackButton();
  assert.equal(dialog.open, false);
  dialogs = [];
  back.handleNativeBackButton();
  back.resetNativeBackExit();
  now += 50;
  back.handleNativeBackButton();
  assert.equal(exits, 1, 'Background/navigation must reset exit gesture');
  back.appLocked = true;
  back.activeView = 'more';
  now += 2500;
  back.handleNativeBackButton();
  assert.equal(back.activeView, 'more', 'Back must not bypass PIN');
  console.log('Reports: filtered ampoules, complete DOCX/CRC/XML, snapshots and Back: OK');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
