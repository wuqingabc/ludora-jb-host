import test from 'node:test';
import assert from 'node:assert/strict';
import { auditHostTree, collectHostPages } from '../../scripts/audit-host-pages.mjs';

test('discovers every user-facing HTML page in the Host tree', () => {
  const pages = collectHostPages();
  assert.ok(pages.length >= 40);
  assert.ok(pages.some((page) => page.endsWith('900v2/index.html')));
  assert.ok(pages.some((page) => page.endsWith('restore/900v3/index.html')));
});

test('Host audit requires local i18n resources and Ludora-only visible brand copy', () => {
  const result = auditHostTree();
  assert.deepEqual(result.errors, []);
});
