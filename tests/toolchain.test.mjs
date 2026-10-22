import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8');

test('Node 24 is the explicit local, npm and lockfile baseline', () => {
  const pinned = read('.nvmrc').trim();
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pinned, '24');
  assert.equal(pkg.engines.node, '>=24.0.0 <25');
  assert.equal(lock.packages[''].engines.node, pkg.engines.node);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
  assert.equal(process.versions.node.split('.')[0], pinned,
    'Run npm tests under the .nvmrc Node major');
});

test('CI and EAS manual build workflow both use pinned Node 24 and modern actions', () => {
  const ci = read('.github/workflows/ci.yml');
  const native = read('.github/workflows/eas-build.yml');
  for (const workflow of [ci, native]) {
    assert.match(workflow, /uses: actions\/setup-node@v7/);
    assert.match(workflow, /uses: actions\/checkout@v7/);
    assert.match(workflow, /node-version-file: \.nvmrc/);
    assert.doesNotMatch(workflow, /actions\/upload-artifact@v4|node-version: ['"]?20/);
  }
});

test('Expo-managed framework updates require coordinated SDK review', () => {
  const config = read('.github/dependabot.yml');
  for (const name of [
    'expo', 'expo-*', '@expo/*', 'react', 'react-dom', '@types/react',
    'react-native', 'react-native-*', '@react-native/*',
  ]) assert.ok(config.includes('dependency-name: ' + name) ||
    config.includes('dependency-name: "' + name + '"'), name + ' is not excluded');
  assert.match(config, /version-update:semver-major/);
});
