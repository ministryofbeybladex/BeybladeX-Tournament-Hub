// ⚠️ ใส่ ID ของ Google Sheet และโฟลเดอร์ Drive ที่ใช้เก็บรูปโปรโมต
// SHEET_ID: ส่วนกลางของ URL https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
// FOLDER_ID: ส่วนท้ายของ URL https://drive.google.com/drive/folders/<FOLDER_ID>
var SHEET_ID = '1xQhaYo3DOfHjBv6_lMA48BW4Aedxbr5aeUV8iXoeUt4';
var FOLDER_ID = '100glFl8SVEUcs1AvjvAbcnc4Nm1nl-JK';
var SHEET_NAME = 'Tournaments';
var TZ = 'Asia/Bangkok';
var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
var HEADERS = ['id', 'title', 'date', 'times', 'fee', 'province', 'district', 'venue', 'mapLink', 'image', 'rewards', 'link', 'approved'];

// Google Sheet BBXWinnerCombo (แท็บแรก) ที่เว็บงานแข่งและ Part Optimizer ใช้แสดงคอมโบผู้ชนะ
var WINNER_SHEET_ID = '1ZI1xmJw19klKV5arPidy46xINhBCqMBYnTtLkp8ScWU';
// คอลัมน์ที่ส่งออกให้เว็บ (คอลัมน์อื่นในชีต เช่น approved หรือข้อมูลติดต่อ จะไม่หลุดออกไป)
var WINNER_FIELDS = ['date', 'event_name', 'type', 'rank', 'winner_name',
  'blade1', 'ratchet1', 'bit1', 'blade2', 'ratchet2', 'bit2', 'blade3', 'ratchet3', 'bit3', 'source_link'];
var WINNER_TYPES = ['shop winner', 'shop winner (Team)', 'G1 Official', 'G2 Official', 'G3 Official'];
// รูปโปรไฟล์ผู้ชนะ: แท็บ Profiles ใน BBXWinnerCombo (winner_name, image) รูปเก็บในโฟลเดอร์ย่อย WinnerProfiles
// ผู้ดูแลอัปรูปจากหน้า profile-admin.html ด้วยรหัส ADMIN_KEY (ตั้งใน Project Settings > Script Properties)
var PROFILE_TAB = 'Profiles';
var PROFILE_FOLDER = 'WinnerProfiles';
var MAX_PROFILE_BYTES = 200 * 1024; // หน้า admin ย่อเหลือ 256x256 (~20KB) ก่อนส่ง
// Tier List จากแฟนๆ: แท็บ TierLists ใน BBXWinnerCombo (id, owner, image, date) รูปเก็บในโฟลเดอร์ย่อย FanTierLists
// ผู้ดูแลอัป/ลบจากหน้า profile-admin.html ด้วย ADMIN_KEY เดียวกัน · Part Optimizer แสดงที่หน้า /tierlist
var TIERLIST_TAB = 'TierLists';
var TIERLIST_FOLDER = 'FanTierLists';
var MAX_TIERLIST_BYTES = 800 * 1024; // หน้า admin ย่อเหลือกว้าง 1000px JPEG (~100-200KB) ก่อนส่ง

// 1. GET: ส่งเฉพาะงานที่อนุมัติแล้ว และยังไม่ถึงวันแข่ง เรียงจากวันที่ใกล้สุด
//    ?data=winners: ส่งคอมโบผู้ชนะที่อนุมัติแล้วเป็น CSV (รูปแบบเดียวกับ export ของ Google Sheet)
function doGet(e) {
  if (e && e.parameter && e.parameter.data === 'winners') {
    // แคช 5 นาที: ไม่ต้องเปิดชีตทุกครั้ง (ติ๊ก approved แล้วขึ้นเว็บภายใน 5 นาที)
    var cache = CacheService.getScriptCache();
    var csv = cache.get('winnersCsv');
    if (!csv) {
      csv = winnersCsv(getWinnerSheet().getDataRange().getDisplayValues());
      if (csv.length < 100000) cache.put('winnersCsv', csv, 300);
    }
    return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
  }
  if (e && e.parameter && e.parameter.data === 'profiles') {
    return json({ ok: true, data: profilesList(getProfileSheet().getDataRange().getValues()) });
  }
  if (e && e.parameter && e.parameter.data === 'tierlists') {
    return json({ ok: true, data: tierListsList(getTierListSheet().getDataRange().getValues()) });
  }
  try {
    var rows = getSheet().getDataRange().getValues();
    var headers = rows.shift();
    var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

    var data = rows.map(function (row) {
      var record = {};
      headers.forEach(function (key, j) { record[key] = row[j]; });
      return record;
    }).filter(function (r) {
      return r.approved === true;
    }).map(function (r) {
      return {
        id: String(r.id),
        title: String(r.title),
        date: r.date instanceof Date ? Utilities.formatDate(r.date, TZ, 'yyyy-MM-dd') : String(r.date),
        times: parseTimes(r.times),
        fee: String(r.fee),
        province: String(r.province),
        district: String(r.district),
        venue: String(r.venue || ''),
        mapLink: String(r.mapLink || ''),
        image: String(r.image || ''),
        rewards: String(r.rewards || ''),
        link: String(r.link || '')
      };
    }).filter(function (r) {
      return r.date >= today;
    }).sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });

    return json({ ok: true, data: data });
  } catch (error) {
    return json({ ok: false, error: error.toString() });
  }
}

// 2. POST: รับงานแข่งใหม่ บันทึกรูปลง Drive แล้วเพิ่มแถว (approved = ไม่ติ๊ก รอผู้ดูแลอนุมัติ)
//    kind = 'winner': รับคอมโบผู้ชนะ เพิ่มแถวใน BBXWinnerCombo (approved = ไม่ติ๊ก)
function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.kind === 'winner') {
      var winnerSheet = getWinnerSheet();
      var winnerHeaders = trimmed(winnerSheet.getRange(1, 1, 1, winnerSheet.getLastColumn()).getValues()[0]);
      if (winnerHeaders.indexOf('approved') === -1) throw new Error('ยังไม่ได้รัน setupWinners');
      winnerSheet.appendRow(winnerRow(p, winnerHeaders));
      winnerSheet.getRange(winnerSheet.getLastRow(), winnerHeaders.indexOf('approved') + 1).insertCheckboxes();
      return json({ ok: true });
    }
    if (p.kind === 'profile') {
      saveProfile(p);
      return json({ ok: true });
    }
    if (p.kind === 'tierlist') {
      return json({ ok: true, data: saveTierList(p) });
    }
    if (p.kind === 'tierlist-delete') {
      deleteTierList(p);
      return json({ ok: true });
    }
    if (!p.title || !p.date || !p.fee || !p.province || !p.district || !p.venue) {
      throw new Error('กรอกข้อมูลไม่ครบ');
    }

    var image = '';
    if (p.imageData) {
      image = saveImage(p.imageData, p.title);
    } else if (/^https?:\/\//.test(p.image || '')) {
      image = p.image;
    }

    var values = {
      id: new Date().getTime(),
      title: p.title,
      date: p.date,
      times: JSON.stringify(Array.isArray(p.times) ? p.times : []),
      fee: p.fee,
      province: p.province,
      district: p.district,
      venue: p.venue,
      mapLink: /^https?:\/\//.test(p.mapLink || '') ? p.mapLink : '',
      image: image,
      rewards: p.rewards || '',
      link: /^https?:\/\//.test(p.link || '') ? p.link : '',
      approved: false
    };

    var sheet = getSheet();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    // ใส่ ' นำหน้าข้อความ กัน Sheet แปลงเป็นสูตร/ตัวเลข/วันที่เอง
    sheet.appendRow(headers.map(function (key) {
      var v = values.hasOwnProperty(key) ? values[key] : '';
      return typeof v === 'string' && v !== '' ? "'" + v : v;
    }));
    sheet.getRange(sheet.getLastRow(), headers.indexOf('approved') + 1).insertCheckboxes();

    return json({ ok: true });
  } catch (error) {
    return json({ ok: false, error: error.toString() });
  }
}

// เปิดแท็บ Tournaments และเพิ่มคอลัมน์ header ที่ยังขาดให้อัตโนมัติ
function getSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  var lastCol = sheet.getLastColumn();
  var headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var missing = HEADERS.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

// แท็บแรก (gid=0) ของ BBXWinnerCombo
function getWinnerSheet() {
  return SpreadsheetApp.openById(WINNER_SHEET_ID).getSheets().filter(function (s) { return s.getSheetId() === 0; })[0];
}

function trimmed(headers) {
  return headers.map(function (h) { return String(h).trim(); });
}

// ค่าที่ชีตแสดง (getDisplayValues) -> CSV เฉพาะแถวที่ติ๊ก approved และเฉพาะคอลัมน์ใน WINNER_FIELDS
function winnersCsv(values) {
  var headers = trimmed(values[0]);
  var approved = headers.indexOf('approved');
  var cols = WINNER_FIELDS.map(function (f) { return headers.indexOf(f); });
  var cell = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
  var lines = [WINNER_FIELDS.map(cell).join(',')];
  values.slice(1).forEach(function (row) {
    if (approved === -1 || row[approved] !== 'TRUE') return;
    lines.push(cols.map(function (j) { return cell(j === -1 ? '' : row[j]); }).join(','));
  });
  return lines.join('\n');
}

// ข้อมูลจากฟอร์ม -> แถวตามลำดับ header ของชีต (approved = false รอผู้ดูแลติ๊ก)
function winnerRow(p, headers) {
  var text = function (v, max) { return String(v || '').trim().slice(0, max); };
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.date || '');
  if (!m) throw new Error('วันที่ไม่ถูกต้อง');
  var values = {
    date: Number(m[3]) + '/' + Number(m[2]) + '/' + m[1], // d/m/yyyy แบบเดียวกับแถวเดิม
    event_name: text(p.event_name, 80),
    type: WINNER_TYPES.indexOf(p.type) !== -1 ? p.type : '',
    rank: String(Math.min(Math.max(parseInt(p.rank, 10) || 0, 1), 8)),
    winner_name: text(p.winner_name, 60),
    source_link: /^https?:\/\//.test(p.source_link || '') ? text(p.source_link, 300) : '',
    approved: false
  };
  [1, 2, 3].forEach(function (n) {
    ['blade', 'ratchet', 'bit'].forEach(function (k) { values[k + n] = text(p[k + n], 40); });
  });
  if (!values.event_name || !values.type || !values.winner_name || !values.blade1 || !values.bit1) {
    throw new Error('กรอกข้อมูลไม่ครบ');
  }
  // ใส่ ' นำหน้าข้อความ กัน Sheet แปลงเป็นสูตร/ตัวเลข/วันที่เอง
  return headers.map(function (key) {
    var v = values.hasOwnProperty(key) ? values[key] : '';
    return typeof v === 'string' && v !== '' ? "'" + v : v;
  });
}

// กด Run ฟังก์ชันนี้ในหน้า editor หนึ่งครั้ง: เพิ่มคอลัมน์ approved ใน BBXWinnerCombo และติ๊กให้แถวเดิมทั้งหมด
function setupWinners() {
  var sheet = getWinnerSheet();
  var headers = trimmed(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
  if (headers.indexOf('approved') !== -1) return;
  var col = headers.length + 1;
  sheet.getRange(1, col).setValue('approved');
  var rows = sheet.getLastRow() - 1;
  if (rows > 0) {
    var range = sheet.getRange(2, col, rows, 1);
    range.insertCheckboxes();
    range.setValues(sheet.getRange(2, 1, rows, col - 1).getValues().map(function (r) { return [r.join('') !== '']; }));
  }
}

// ชื่อเดียวกันถ้าต่างแค่ช่องว่าง/ตัวพิมพ์เล็กใหญ่ (ต้องตรงกับ nameKey ในเว็บ)
function nameKey(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ');
}

// แถวในแท็บ Profiles -> [{ name, image }] (ข้ามหัวตารางและแถวว่าง)
function profilesList(values) {
  return values.slice(1).filter(function (r) { return r[0] && r[1]; })
    .map(function (r) { return { name: String(r[0]), image: String(r[1]) }; });
}

// เลขแถว (เริ่ม 1 แบบ Sheet) ของชื่อนี้ในแท็บ Profiles, 0 ถ้ายังไม่มี
function profileRow(values, name) {
  for (var i = 1; i < values.length; i++) {
    if (nameKey(values[i][0]) === nameKey(name)) return i + 1;
  }
  return 0;
}

function getProfileSheet() {
  var ss = SpreadsheetApp.openById(WINNER_SHEET_ID);
  var sheet = ss.getSheetByName(PROFILE_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(PROFILE_TAB);
    sheet.appendRow(['winner_name', 'image']);
  }
  return sheet;
}

// บันทึก/แทนรูปโปรไฟล์ (รูปเก่าย้ายไปถังขยะ Drive)
function checkAdmin(key) {
  var adminKey = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!adminKey || key !== adminKey) throw new Error('รหัสผู้ดูแลไม่ถูกต้อง');
}

function saveProfile(p) {
  checkAdmin(p.key);
  var name = String(p.name || '').trim().slice(0, 60);
  if (!name) throw new Error('ไม่มีชื่อผู้ชนะ');
  var m = /^data:image\/jpeg;base64,(.+)$/.exec(p.imageData || '');
  if (!m) throw new Error('ไฟล์รูปไม่ถูกต้อง');
  var bytes = Utilities.base64Decode(m[1]);
  if (bytes.length > MAX_PROFILE_BYTES) throw new Error('รูปใหญ่เกิน 200KB');

  var parent = DriveApp.getFolderById(FOLDER_ID);
  var folders = parent.getFoldersByName(PROFILE_FOLDER);
  var folder = folders.hasNext() ? folders.next() : parent.createFolder(PROFILE_FOLDER);
  var file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', new Date().getTime() + '-' + name + '.jpg'));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var image = 'https://lh3.googleusercontent.com/d/' + file.getId();

  var sheet = getProfileSheet();
  var values = sheet.getDataRange().getValues();
  var row = profileRow(values, name);
  if (row) {
    var oldId = String(values[row - 1][1]).split('/d/')[1];
    try { if (oldId) DriveApp.getFileById(oldId).setTrashed(true); } catch (err) { /* ไฟล์เก่าถูกลบไปแล้ว */ }
    sheet.getRange(row, 1, 1, 2).setValues([["'" + name, image]]);
  } else {
    sheet.appendRow(["'" + name, image]);
  }
}

// แถวในแท็บ TierLists -> [{ id, owner, image, date }] ใหม่สุดก่อน (ข้ามหัวตารางและแถวไม่มีรูป)
function tierListsList(values) {
  return values.slice(1).filter(function (r) { return r[0] && r[2]; })
    .map(function (r) {
      var d = r[3] instanceof Date ? Utilities.formatDate(r[3], TZ, 'yyyy-MM-dd') : String(r[3]);
      return { id: String(r[0]), owner: String(r[1]), image: String(r[2]), date: d };
    })
    .sort(function (a, b) { return Number(b.id) - Number(a.id); });
}

function getTierListSheet() {
  var ss = SpreadsheetApp.openById(WINNER_SHEET_ID);
  var sheet = ss.getSheetByName(TIERLIST_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(TIERLIST_TAB);
    sheet.appendRow(['id', 'owner', 'image', 'date']);
  }
  return sheet;
}

// เพิ่มรูป Tier List ของแฟน (owner = ชื่อเจ้าของ) คืนแถวที่เพิ่มให้หน้า admin แสดงทันที
function saveTierList(p) {
  checkAdmin(p.key);
  var owner = String(p.owner || '').trim().slice(0, 40);
  if (!owner) throw new Error('ไม่มีชื่อเจ้าของ Tier List');
  var m = /^data:image\/jpeg;base64,(.+)$/.exec(p.imageData || '');
  if (!m) throw new Error('ไฟล์รูปไม่ถูกต้อง');
  var bytes = Utilities.base64Decode(m[1]);
  if (bytes.length > MAX_TIERLIST_BYTES) throw new Error('รูปใหญ่เกิน 800KB');

  var parent = DriveApp.getFolderById(FOLDER_ID);
  var folders = parent.getFoldersByName(TIERLIST_FOLDER);
  var folder = folders.hasNext() ? folders.next() : parent.createFolder(TIERLIST_FOLDER);
  var id = String(new Date().getTime());
  var file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', id + '-' + owner + '.jpg'));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var row = { id: id, owner: owner, image: 'https://lh3.googleusercontent.com/d/' + file.getId(), date: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') };
  getTierListSheet().appendRow([id, "'" + owner, row.image, "'" + row.date]);
  return row;
}

// เลขแถว (เริ่ม 1 แบบ Sheet) ของ id นี้ในแท็บ TierLists, 0 ถ้าไม่มี
function tierListRow(values, id) {
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1;
  }
  return 0;
}

// ลบ Tier List: ลบแถว และย้ายรูปไปถังขยะ Drive
function deleteTierList(p) {
  checkAdmin(p.key);
  var sheet = getTierListSheet();
  var values = sheet.getDataRange().getValues();
  var row = tierListRow(values, p.id);
  if (!row) throw new Error('ไม่พบ Tier List นี้');
  var fileId = String(values[row - 1][2]).split('/d/')[1];
  try { if (fileId) DriveApp.getFileById(fileId).setTrashed(true); } catch (err) { /* ไฟล์ถูกลบไปแล้ว */ }
  sheet.deleteRow(row);
}

// รับ data URL (base64) บันทึกเป็นไฟล์ใน Drive และคืนลิงก์ที่ใช้ใน <img> ได้
function saveImage(dataUrl, title) {
  var m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('ไฟล์รูปไม่ถูกต้อง');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('รูปใหญ่เกิน 2MB');

  var file = DriveApp.getFolderById(FOLDER_ID)
    .createFile(Utilities.newBlob(bytes, m[1], new Date().getTime() + '-' + title));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

// กด Run ฟังก์ชันนี้ในหน้า editor หนึ่งครั้ง เพื่ออนุญาตสิทธิ์ Drive และ Sheets
function authorize() {
  DriveApp.getFolderById(FOLDER_ID).createFile('auth-test.txt', 'ok').setTrashed(true);
  SpreadsheetApp.openById(SHEET_ID).getName();
}

function parseTimes(v) {
  if (Array.isArray(v)) return v;
  try {
    var arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (err) {
    return v ? String(v).split(',') : [];
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
