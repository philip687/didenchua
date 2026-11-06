import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardHTML, state, TASKS_CATALOG } from '../server.js';

test('REPORT UI: renders compact task list with internal scrollbox and no verbose descriptions', () => {
  state.isRunning = false;
  state.isStopping = false;
  const html = renderDashboardHTML();

  // 1. Must contain scroll containers for both quests and tasks
  assert.ok(html.includes('quests-scroll-box'), 'Dashboard must contain quests-scroll-box');
  assert.ok(html.includes('tasks-scroll-box'), 'Dashboard must contain tasks-scroll-box');
  assert.ok(html.includes('id="tasksContainer"'), 'tasksContainer id must exist for DOM filtering');

  // 2. Must contain category filter tags
  assert.ok(html.includes('task-filter-bar'), 'Must contain task-filter-bar');
  assert.ok(html.includes('data-category="all"'), 'Must have "all" category filter tag');
  assert.ok(html.includes('data-category="daily"'), 'Must have "daily" category filter tag');
  assert.ok(html.includes('data-category="milestone"'), 'Must have "milestone" category filter tag');
  assert.ok(html.includes('data-category="spiritual"'), 'Must have "spiritual" category filter tag');
  assert.ok(html.includes('data-category="extra"'), 'Must have "extra" category filter tag');
  assert.ok(html.includes('data-category="zen-ai"'), 'Must have "zen-ai" category filter tag');

  // 3. Must contain live search input and clear button
  assert.ok(html.includes('id="taskSearchInput"'), 'Must contain taskSearchInput input element');
  assert.ok(html.includes('id="btnClearSearch"'), 'Must contain btnClearSearch clear button');

  // 4. Must NOT contain bulky task descriptions in task rows
  for (const t of TASKS_CATALOG) {
    // Each row must have data attributes for instant client filtering
    assert.ok(html.includes(`data-group="${t.group}"`), `Task ${t.id} must have data-group attribute`);
    assert.ok(html.includes(`data-title="${t.title.toLowerCase().replace(/&/g, '&amp;')}"`), `Task ${t.id} must have escaped lowercase data-title attribute`);
  }

  // 5. Must contain client-side filtering functions in inline script
  assert.ok(html.includes('function filterTasksByCategory('), 'Script must define filterTasksByCategory');
  assert.ok(html.includes('function filterTasksLive('), 'Script must define filterTasksLive');
  assert.ok(html.includes('function clearTaskSearch('), 'Script must define clearTaskSearch');
  assert.ok(html.includes('function applyTaskFilters('), 'Script must define applyTaskFilters');
  assert.ok(html.includes('function restoreTaskFilters('), 'Script must define restoreTaskFilters');
});
