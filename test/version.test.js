import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAppVersion, renderDashboardHTML } from '../server.js';

test('VERSION: getAppVersion returns valid version object based on commit hash', () => {
  const v = getAppVersion();
  assert.ok(v, 'Must return a version object');
  assert.ok(typeof v.baseVersion === 'string' && v.baseVersion.length > 0, 'baseVersion must be a non-empty string');
  assert.ok(typeof v.commit === 'string' && v.commit.length >= 7, 'commit must be at least 7 characters');
  assert.ok(v.displayVersion.startsWith('v'), 'displayVersion must start with v');
  assert.ok(v.displayVersion.includes(v.commit), 'displayVersion must contain the commit short hash');
  assert.ok(v.githubCommitUrl.includes(v.fullCommit), 'githubCommitUrl must point to fullCommit');
});

test('VERSION: renderDashboardHTML includes version badge in top-right header and meta tags', () => {
  const v = getAppVersion();
  const html = renderDashboardHTML();

  // 1. Phải có meta tag version
  assert.ok(html.includes(`<meta name="version" content="${v.displayVersion}">`), 'HTML must contain meta version');

  // 2. Title phải chứa version
  assert.ok(html.includes(v.displayVersion), 'HTML title must contain version');

  // 3. Khối header phải có header-top-bar và header-version ở góc phải đầu tiên
  assert.ok(html.includes('header-top-bar'), 'Header must contain header-top-bar container');
  assert.ok(html.includes('header-version'), 'Header must contain header-version container');
  assert.ok(html.includes('version-badge'), 'Header must contain version-badge');
  assert.ok(html.includes(v.displayVersion), 'version-badge must render displayVersion');
  assert.ok(html.includes(v.githubCommitUrl), 'version-badge must link to githubCommitUrl');

  // 4. Footer cũng phải hiển thị version đồng bộ
  assert.ok(html.includes(`Phiên bản: <b>${v.displayVersion}</b>`), 'Footer must show synchronized version');
});
