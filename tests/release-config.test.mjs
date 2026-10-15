import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_QA_IDS, qaMatrixIds, validateReleaseConfig, validateReleaseEvidence, validateEasLink, validateVersionPair, hasValidLauncherIcon } from '../scripts/check-release.mjs';

function appConfig() {
  return { expo: {
    name: 'Gym App', slug: 'react-native-gym-app', version: '0.1.0',
    platforms: ['ios','android'], icon: undefined,
    ios: { bundleIdentifier: 'com.justinangeloperez.gymapp' },
    android: { package: 'com.justinangeloperez.gymapp',
      allowBackup: false, softwareKeyboardLayoutMode: 'resize' },
  } };
}
function easConfig() {
  return {
    cli: { requireCommit: true, appVersionSource: 'remote' },
    build: {
      preview: { distribution: 'internal', android: { buildType: 'apk' } },
      simulator: { ios: { simulator: true } },
      production: { autoIncrement: true, android: { buildType: 'app-bundle' } },
    },
    submit: { production: { android: { track: 'internal', releaseStatus: 'draft' } } },
  };
}
test('valid EAS profiles keep internal previews and store submission in draft', () => {
  assert.deepEqual(validateReleaseConfig(appConfig(), easConfig()), []);
  assert.deepEqual(DEFAULT_QA_IDS, Array.from({ length: 20 }, (_, n) => String(n + 1).padStart(2, '0')));
});
test('release config rejects accidental autobackup and shipping profiles', () => {
  const app = appConfig(), eas = easConfig();
  app.expo.android.allowBackup = true;
  eas.submit.production.android.track = 'production';
  eas.build.production.android.buildType = 'apk';
  const errors = validateReleaseConfig(app, eas);
  assert.ok(errors.some(e => e.includes('cloud backup')));
  assert.ok(errors.some(e => e.includes('internal draft')));
  assert.ok(errors.some(e => e.includes('App Bundle')));
});
test('release gate remains closed until EAS, icons and manual evidence exist', () => {
  const missing = validateReleaseEvidence(appConfig(), null);
  assert.ok(missing.some(x => x.includes('not linked')));
  assert.ok(missing.some(x => x.includes('icon')));
  assert.ok(missing.some(x => x.includes('approval record')));
});
test('release evidence requires both platforms, complete QA checks and human approval', () => {
  const app = appConfig();
  app.expo.version = '1.0.0';
  app.expo.icon = './assets/icon.png';
  app.expo.extra = { eas: { projectId: 'bedf148e-5c9a-4d83-8ad8-d8d08076a1b6' } };
  const sha = 'a'.repeat(40);
  const item = {
    buildUrl: 'https://expo.dev/accounts/fitapp/projects/gym-app/builds/bedf148e-5c9a-4d83-8ad8-d8d08076a1b6', testedCommit: sha,
    device: 'Test device', osVersion: 'Test OS', testedAt: '2026-10-15',
    passedChecks: [...DEFAULT_QA_IDS], accepted: true,
  };
  const record = {
    releaseVersion: '1.0.0', privacyPolicyUrl: 'https://fitness-studio.com/privacy',
    contactEmail: 'support@fitness-studio.com', storeAssetsApproved: true,
    privacyDisclosuresApproved: true, submissionApproved: true,
    android: item, ios: { ...item },
  };
  assert.deepEqual(validateReleaseEvidence(app, record, DEFAULT_QA_IDS, true, sha), []);
  assert.ok(validateReleaseEvidence(app, { ...record, ios: { ...item, passedChecks: ['01'] } },
    DEFAULT_QA_IDS, true).some(e => e.includes('every device QA')));
  assert.ok(validateReleaseEvidence(app, { ...record, submissionApproved: false },
    DEFAULT_QA_IDS, true).some(e => e.includes('submissionApproved')));
  assert.ok(validateReleaseEvidence(app, { ...record, ios: { ...item, testedCommit: 'different' } },
    DEFAULT_QA_IDS, true).some(e => e.includes('same source commit')));
});
test('approval evidence rejects stale, partial and inconsistent native build evidence', () => {
  const app = appConfig();
  app.expo.version = '1.0.0';
  app.expo.icon = './assets/icon.png';
  app.expo.extra = { eas: { projectId: 'bedf148e-5c9a-4d83-8ad8-d8d08076a1b6' } };
  const sha = 'a'.repeat(40);
  const record = {
    releaseVersion: '1.0.0', privacyPolicyUrl: 'https://fitness-studio.com/privacy',
    contactEmail: 'support@fitness-studio.com', storeAssetsApproved: true,
    privacyDisclosuresApproved: true, submissionApproved: true,
    android: { buildUrl: 'https://expo.dev/accounts/x/projects/y/builds/bedf148e-5c9a-4d83-8ad8-d8d08076a1b6',
      testedCommit: sha, device: 'Pixel', osVersion: 'Android 16', testedAt: '2026-10-15',
      passedChecks: [...DEFAULT_QA_IDS], accepted: true },
  };
  record.ios = { ...record.android };
  const check = patch => validateReleaseEvidence(app, { ...record, ...patch }, DEFAULT_QA_IDS, true, sha);
  assert.deepEqual(check({}), []);
  assert.ok(check({ android: { ...record.android, testedCommit: 'short' } }).some(e => e.includes('40-character')));
  assert.ok(check({ android: { ...record.android, testedCommit: 'b'.repeat(40) } }).some(e => e.includes('current HEAD')));
  assert.ok(check({ ios: { ...record.ios, testedAt: '2026-02-30' } }).some(e => e.includes('YYYY-MM-DD')));
  assert.ok(check({ ios: { ...record.ios, buildUrl: 'https://example.com/build' } }).some(e => e.includes('Expo EAS')));
  assert.ok(check({ privacyPolicyUrl: 'https://example.com/privacy' }).some(e => e.includes('non-placeholder')));
  assert.ok(check({ contactEmail: 'support@example.com' }).some(e => e.includes('non-placeholder')));
});

test('release package and Expo versions must agree', () => {
  assert.deepEqual(validateVersionPair(appConfig(), { version: '0.1.0' }), []);
  assert.ok(validateVersionPair(appConfig(), { version: '1.0.0' }).length > 0);
});

test('release icon must have a real 1024 by 1024 PNG header', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-icon-test-'));
  const file = path.join(dir, 'icon.png');
  try {
    const png = Buffer.alloc(33);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(1024, 16); png.writeUInt32BE(1024, 20);
    fs.writeFileSync(file, png);
    assert.equal(hasValidLauncherIcon(file), true);
    png.writeUInt32BE(512, 16);
    fs.writeFileSync(file, png);
    assert.equal(hasValidLauncherIcon(file), false);
    fs.writeFileSync(file, Buffer.from('not an image'));
    assert.equal(hasValidLauncherIcon(file), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('QA ID parser reads canonical table rows and ignores headers', () => {
  const md = '| ID | Thing |\n|---|---|\n| 01 | One |\n| 02 | Two |\n| Notes | Ignore |';
  assert.deepEqual(qaMatrixIds(md), ['01','02']);
});

test('manual native build requires a linked EAS project', () => {
  const app = appConfig();
  assert.match(validateEasLink(app).join(';'), /not linked/);
  app.expo.extra = { eas: { projectId: 'not-a-uuid' } };
  assert.match(validateEasLink(app).join(';'), /not linked/);
  app.expo.extra.eas.projectId = 'bedf148e-5c9a-4d83-8ad8-d8d08076a1b6';
  assert.deepEqual(validateEasLink(app), []);
});
