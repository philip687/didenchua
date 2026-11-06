import test from 'node:test';
import assert from 'node:assert/strict';
import { DiDenChuaClient } from '../src/client.js';
import { renderDashboardHTML } from '../server.js';

test('CLIENT ABORT: abort() immediately cancels pending sleep and throws', async () => {
  const client = new DiDenChuaClient();
  assert.equal(client.aborted, false);

  const sleepPromise = client.sleep(5000);
  setTimeout(() => {
    client.abort('Dừng test');
  }, 50);

  await assert.rejects(sleepPromise, {
    message: 'Tác vụ đã bị dừng bởi người dùng.'
  });
  assert.equal(client.aborted, true);
  assert.throws(() => client.checkAborted(), {
    message: 'Tác vụ đã bị dừng bởi người dùng.'
  });
});

test('CLIENT ABORT: send() is a no-op when client is aborted', () => {
  const client = new DiDenChuaClient();
  client.aborted = true;
  let sent = false;
  client.ws = {
    readyState: 1,
    send: () => { sent = true; }
  };
  client.send({ t: 'checkin' });
  assert.equal(sent, false);
});

test('DASHBOARD UI: renderDashboardHTML includes Dừng Auto / Tiếp Tục Auto & Dừng Tác Vụ buttons', () => {
  const html = renderDashboardHTML();

  // Kiểm tra sự hiện diện của nút Tạm Dừng / Tiếp Tục Auto
  assert.match(html, /id="autoToggleBtn"/);
  assert.match(html, /toggleAutoMode\(\)/);
  assert.match(html, /id="autoEngineBadge"/);
  assert.match(html, /id="autoEngineDesc"/);

  // Kiểm tra sự hiện diện của nút Dừng Tác Vụ
  assert.match(html, /id="stopTaskBtn"/);
  assert.match(html, /stopTask\(\)/);
  assert.match(html, /id="headerStopBtn"/);

  // Kiểm tra script xử lý UI cập nhật động
  assert.match(html, /function updateAutoUI\(autoEnabled\)/);
  assert.match(html, /function updateRunningUI\(running, taskName, isStopping\)/);
});

