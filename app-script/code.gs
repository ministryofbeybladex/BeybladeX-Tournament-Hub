// ⚠️ ใส่ ID ของ Google Sheet และโฟลเดอร์ Drive ที่ใช้เก็บรูปโปรโมต
// SHEET_ID: ส่วนกลางของ URL https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
// FOLDER_ID: ส่วนท้ายของ URL https://drive.google.com/drive/folders/<FOLDER_ID>
var SHEET_ID = '1xQhaYo3DOfHjBv6_lMA48BW4Aedxbr5aeUV8iXoeUt4';
var FOLDER_ID = '100glFl8SVEUcs1AvjvAbcnc4Nm1nl-JK';
var SHEET_NAME = 'Tournaments';
var TZ = 'Asia/Bangkok';
var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
var HEADERS = ['id', 'title', 'date', 'times', 'fee', 'province', 'district', 'venue', 'mapLink', 'image', 'rewards', 'link', 'approved'];

// 1. GET: ส่งเฉพาะงานที่อนุมัติแล้ว และยังไม่ถึงวันแข่ง เรียงจากวันที่ใกล้สุด
function doGet(e) {
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
function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
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
