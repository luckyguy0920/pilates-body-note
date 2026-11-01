/**
 * 필라테스클리닉 체성분 처방 노트 — 구글 시트 저장 스크립트
 *
 * 설치
 * 1. 새 구글 시트를 만들고 [확장 프로그램 > Apps Script]를 엽니다.
 * 2. 이 파일 내용을 Code.gs 에 통째로 붙여넣고 저장합니다.
 * 3. (선택) 위쪽 함수 목록에서 addSampleRecord 를 골라 [실행] → 권한 허용.
 *    시트에 '측정기록', '회원' 탭과 예시 회원(010-0000-0000) 2회 기록이 생깁니다.
 * 4. [배포 > 새 배포 > 유형: 웹 앱] 실행 사용자: 나, 액세스 권한: 모든 사용자 → 배포.
 * 5. 나온 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 페이지 설정에 넣습니다.
 *
 * 지점: 페이지 주소의 ?b=songjeong / guyeong / daldong 로 들어온 지점(송정·구영·달동)을 '지점' 칸에 기록합니다.
 * 회원 구분: 이름 + 휴대폰 번호. 같은 번호인데 출생연도가 다르면 저장·조회를 거절합니다(본인 확인).
 * 이름이 바뀌어 들어오면 회원 탭의 이름을 최신 값으로 바꿉니다.
 * 같은 날 다시 저장하면 그날 기록을 새 값으로 바꿉니다(하루 1행).
 */

var SHEET_RECORDS = '측정기록';
var SHEET_MEMBERS = '회원';
var MAX_RETURN = 24;
var SAMPLE_PHONE = '010-0000-0000';
var BRANCHES = ['송정', '구영', '달동'];

var RECORD_HEADERS = [
  '측정일', '지점', '이름', '휴대폰 번호', '출생연도', '나이', '성별', '키(cm)',
  '체중(kg)', '골격근량(kg)', '체지방률(%)', '체지방량(kg)', '근육조절(kg)', '내장지방 레벨',
  '의자 일어서기 두 발 30초(회)', '한 발 서기 왼발(초)', '한 발 서기 오른발(초)',
  '목표', '활동량', '수면', '자세 고민', '통증 부위', '식습관', '측정 조건',
  '체형 유형', '하루 칼로리(kcal)', '단백질(g)', '이번 달 집중', '저장 시각', '원본 데이터'
];
var MEMBER_HEADERS = [
  '이름', '휴대폰 번호', '출생연도', '성별', '첫 측정일', '최근 측정일', '최근 지점', '측정 횟수',
  '최근 체형 유형', '최근 체중(kg)', '최근 골격근량(kg)', '최근 체지방률(%)', '동의 일시'
];
// 열 번호(1부터)를 제목으로 찾기
var RC = col_(RECORD_HEADERS);
var MC = col_(MEMBER_HEADERS);
function col_(h) { var o = {}; h.forEach(function (n, i) { o[n] = i + 1; }); return o; }

function doGet() {
  return json_({ ok: true, service: 'body-note', time: new Date().toISOString() });
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'json' }); }
  return json_(handle_(body));
}

// 페이지 요청 처리 (doPost 와 테스트가 같이 씀)
function handle_(body) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var phone = normPhone_(body.phone);
    var by = Number(body.birthYear);
    if (!phone) return { ok: false, error: 'phone' };
    if (!(by >= 1900 && by <= 2100)) return { ok: false, error: 'birthYear' };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rec = ensureSheet_(ss, SHEET_RECORDS, RECORD_HEADERS, [RC['측정일'], RC['휴대폰 번호']]);
    var mem = ensureSheet_(ss, SHEET_MEMBERS, MEMBER_HEADERS, [MC['휴대폰 번호'], MC['첫 측정일'], MC['최근 측정일']]);
    var member = findMember_(mem, phone);
    if (member && Number(member.values[MC['출생연도'] - 1]) !== by) return { ok: false, error: 'mismatch' };

    if (body.action === 'load') {
      return { ok: true, member: !!member, name: member ? String(member.values[MC['이름'] - 1]) : '', records: readRecords_(rec, phone) };
    }
    if (body.action !== 'save') return { ok: false, error: 'action' };

    var r = body.record || {};
    var x = r.inputs || {};
    var date = String(r.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(Number(x.weight) > 0)) return { ok: false, error: 'record' };
    var s = body.summary || {};
    var L = s.labels || {};
    var branch = BRANCHES.indexOf(String(body.branch)) >= 0 ? String(body.branch) : '';
    var name = txt_(String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 30));
    if (!name) return { ok: false, error: 'name' };
    var fit = x.fit || {};
    var row = [
      date, branch, name, phone, by, num_(x.age), txt_(L.sex), num_(x.height),
      num_(x.weight), num_(x.smm), num_(x.pbf), round1_(Number(x.weight) * Number(x.pbf) / 100), num_(x.mc), num_(x.vfl),
      num_(fit.sts), num_(fit.balL), num_(fit.balR),
      txt_(L.goal), txt_(L.activity), txt_(L.sleep), txt_(L.posture), txt_(L.cautions), txt_(L.habits), txt_(L.cond),
      txt_(s.type), num_(s.kcal), num_(s.protein), txt_(s.focus), stamp_(new Date()),
      JSON.stringify({ date: date, inputs: x }).slice(0, 8000)
    ];
    upsertRecord_(rec, phone, date, row);

    var records = readRecords_(rec, phone);
    var all = readRecords_(rec, phone, true);
    var ci = MC['동의 일시'] - 1;
    var mrow = [
      name, phone, by, txt_(L.sex), all.length ? all[0].date : date, all.length ? all[all.length - 1].date : date, branch, all.length,
      txt_(s.type), num_(x.weight), num_(x.smm), num_(x.pbf),
      member && member.values[ci] ? member.values[ci] : stamp_(body.consentAt ? new Date(body.consentAt) : new Date())
    ];
    if (member) mem.getRange(member.row, 1, 1, mrow.length).setValues([mrow]);
    else mem.appendRow(mrow);

    return { ok: true, records: records, count: all.length };
  } catch (err) {
    return { ok: false, error: 'server', message: String(err) };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ── 시트 다루기 ──────────────────────────────────────────

function ensureSheet_(ss, name, headers, textCols) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    textCols.forEach(function (c) { sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@'); });
    if (name === SHEET_RECORDS) sh.hideColumns(headers.length);
  }
  return sh;
}

function findMember_(mem, phone) {
  var n = mem.getLastRow() - 1;
  if (n < 1) return null;
  var data = mem.getRange(2, 1, n, MEMBER_HEADERS.length).getValues();
  for (var i = 0; i < data.length; i++) if (String(data[i][MC['휴대폰 번호'] - 1]) === phone) return { row: i + 2, values: data[i] };
  return null;
}

function upsertRecord_(rec, phone, date, row) {
  var n = rec.getLastRow() - 1;
  if (n >= 1) {
    var keys = rec.getRange(2, 1, n, RC['휴대폰 번호']).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (dateText_(keys[i][RC['측정일'] - 1]) === date && String(keys[i][RC['휴대폰 번호'] - 1]) === phone) {
        rec.getRange(i + 2, 1, 1, row.length).setValues([row]);
        return;
      }
    }
  }
  rec.appendRow(row);
}

function readRecords_(rec, phone, all) {
  var n = rec.getLastRow() - 1;
  if (n < 1) return [];
  var data = rec.getRange(2, 1, n, RECORD_HEADERS.length).getValues();
  var out = [];
  data.forEach(function (v) {
    if (String(v[RC['휴대폰 번호'] - 1]) !== phone) return;
    try {
      var o = JSON.parse(v[RECORD_HEADERS.length - 1]);
      if (o && o.inputs) out.push({ date: dateText_(v[RC['측정일'] - 1]), inputs: o.inputs });
    } catch (e) {}
  });
  out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return all ? out : out.slice(-MAX_RETURN);
}

// ── 값 정리 ──────────────────────────────────────────────

function normPhone_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (!/^01[016789]\d{7,8}$/.test(d)) return '';
  return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
}
function num_(v) { var n = Number(v); return v === null || v === undefined || v === '' || !isFinite(n) ? '' : n; }
function round1_(v) { return isFinite(v) ? Math.round(v * 10) / 10 : ''; }
// 시트가 수식으로 읽지 않도록 = + - @ 로 시작하는 글자는 앞에 ' 를 붙임
function txt_(v) { var s = String(v === null || v === undefined ? '' : v).slice(0, 300); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function dateText_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}
function stamp_(d) { return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ── 확인용 (Apps Script 편집기에서 직접 실행) ─────────────

// 예시 회원 010-0000-0000 의 기록 2개를 넣어 시트 모양을 확인합니다.
function addSampleRecord() {
  var labels = { sex: '여성', goal: '체지방 감량', activity: '주로 앉아서 지냄', sleep: '6시간', posture: '거북목·라운드숄더', cautions: '손목', habits: '야식 주 2회 이상, 단 음료·달달한 커피 매일', cond: '공복, 운동 전, 화장실 다녀온 뒤' };
  var base = { sex: 'F', birthYear: 1985, age: 41, height: 161, goal: 'lose', activity: 'low', sleep: '6' };
  var first = Object.assign({}, base, { weight: 63.9, smm: 20.6, pbf: 35.0, mc: 2.0, vfl: 10, fit: { sts: 14, balL: 11, balR: 30 } });
  var second = Object.assign({}, base, { weight: 62.8, smm: 21.0, pbf: 33.6, mc: 1.6, vfl: 9, fit: { sts: 16, balL: 14, balR: 34 } });
  var a = handle_({ action: 'save', branch: '송정', name: '예시회원', phone: SAMPLE_PHONE, birthYear: 1985, consentAt: new Date().toISOString(),
    record: { date: '2026-10-04', inputs: first }, summary: { type: '근력 우선 감량형', kcal: 1300, protein: 100, focus: '하체·엉덩이', labels: labels } });
  var b = handle_({ action: 'save', branch: '구영', name: '예시회원', phone: SAMPLE_PHONE, birthYear: 1985, consentAt: new Date().toISOString(),
    record: { date: '2026-11-01', inputs: second }, summary: { type: '근력 우선 감량형', kcal: 1300, protein: 100, focus: '하체·엉덩이', labels: labels } });
  Logger.log(JSON.stringify([a.ok, b.ok, b.count]));
}

// 예시 회원 기록을 지웁니다.
function removeSampleRecord() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [[SHEET_RECORDS, RC['휴대폰 번호']], [SHEET_MEMBERS, MC['휴대폰 번호']]].forEach(function (t) {
    var sh = ss.getSheetByName(t[0]);
    if (!sh) return;
    for (var r = sh.getLastRow(); r >= 2; r--) {
      if (String(sh.getRange(r, t[1]).getValue()) === SAMPLE_PHONE) sh.deleteRow(r);
    }
  });
}
