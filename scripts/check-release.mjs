import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_QA_IDS = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0'));

export function validateReleaseConfig(app, eas) {
  const issues = [];
  const expo = app?.expo;
  if (!expo || typeof expo !== 'object') return ['app.json is missing its expo configuration'];
  const names = ['android', 'ios'];
  if (!Array.isArray(expo.platforms) || names.some(name => !expo.platforms.includes(name)))
    issues.push('Expo platforms must contain both android and ios');
  if (!expo.name || !expo.slug) issues.push('Expo app name and slug are required');
  if (!/^\d+\.\d+\.\d+$/.test(expo.version ?? '')) issues.push('Expo version must be a numeric semantic version');
  if (expo.ios?.bundleIdentifier !== 'com.justinangeloperez.gymapp')
    issues.push('iOS bundle identifier changed unexpectedly; confirm ownership before release');
  if (expo.android?.package !== 'com.justinangeloperez.gymapp')
    issues.push('Android package changed unexpectedly; confirm ownership before release');
  if (expo.android?.allowBackup !== false)
    issues.push('Android cloud backup must be disabled for sensitive offline journal data');
  if (expo.android?.softwareKeyboardLayoutMode !== 'resize')
    issues.push('Android keyboard should resize content for forms');
  if (eas?.cli?.requireCommit !== true || eas?.cli?.appVersionSource !== 'remote')
    issues.push('EAS builds require a clean commit and remote native build-number management');
  if (eas?.build?.preview?.distribution !== 'internal' ||
      eas?.build?.preview?.android?.buildType !== 'apk')
    issues.push('Preview must produce an internally distributed Android APK');
  if (eas?.build?.simulator?.ios?.simulator !== true)
    issues.push('An explicit iOS simulator build profile is required');
  if (eas?.build?.production?.autoIncrement !== true ||
      eas?.build?.production?.android?.buildType !== 'app-bundle')
    issues.push('Production must auto-increment native build numbers and produce an Android App Bundle');
  if (eas?.submit?.production?.android?.track !== 'internal' ||
      eas?.submit?.production?.android?.releaseStatus !== 'draft')
    issues.push('First Android submission must stay on internal draft track; never auto-publish');
  return issues;
}

export function validateEasLink(app) {
  const id = app?.expo?.extra?.eas?.projectId;
  return typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? [] : ['EAS project is not linked: run eas init and commit its real projectId'];
}

// Technical checks strengthen the release gate, but cannot independently prove a
// device test, publisher authorization, certificate ownership, or a live URL.
export function validateReleaseEvidence(app, evidence, qaIds = DEFAULT_QA_IDS, iconExists = false, expectedCommit = null) {
  const errors = [];
  const expo = app?.expo ?? {};
  errors.push(...validateEasLink(app));
  if (!iconExists || typeof expo.icon !== 'string' || !expo.icon.endsWith('.png'))
    errors.push('Approved 1024px PNG launcher icon is missing in Expo app config');
  if (!evidence || typeof evidence !== 'object') {
    errors.push('Missing local release/release-evidence.json approval record');
    return errors;
  }
  if (expo.version !== '1.0.0' || evidence.releaseVersion !== '1.0.0')
    errors.push('The app and approval record must both target v1.0.0');
  if (!isPublisherHttpsUrl(evidence.privacyPolicyUrl))
    errors.push('An externally hosted non-placeholder HTTPS privacy policy URL is required');
  if (typeof evidence.contactEmail !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(evidence.contactEmail) ||
      isReservedHost(evidence.contactEmail.split('@')[1]))
    errors.push('A verified non-placeholder store support contact address is required');
  for (const field of ['storeAssetsApproved', 'privacyDisclosuresApproved', 'submissionApproved']) {
    if (evidence[field] !== true) errors.push(field + ' must have documented human approval');
  }
  for (const platform of ['android', 'ios']) {
    const record = evidence[platform];
    if (!record || typeof record !== 'object') {
      errors.push(platform + ' device QA record is missing');
      continue;
    }
    for (const key of ['buildUrl', 'testedCommit', 'device', 'osVersion', 'testedAt']) {
      if (typeof record[key] !== 'string' || !record[key].trim())
        errors.push(platform + ' QA requires ' + key);
    }
    if (typeof record?.buildUrl === 'string' && !isEasBuildPage(record.buildUrl))
      errors.push(platform + ' buildUrl must be an official Expo EAS build page');
    if (typeof record?.testedCommit === 'string') {
      if (!/^[0-9a-f]{40}$/i.test(record.testedCommit))
        errors.push(platform + ' testedCommit must be a full 40-character Git SHA');
      else if (expectedCommit && record.testedCommit.toLowerCase() !== expectedCommit.toLowerCase())
        errors.push(platform + ' tested source commit does not match current HEAD');
    }
    if (typeof record?.testedAt === 'string' && !isPastCalendarDate(record.testedAt))
      errors.push(platform + ' testedAt must be a valid non-future YYYY-MM-DD date');
    if (!Array.isArray(record.passedChecks) ||
        new Set(record.passedChecks).size !== record.passedChecks.length ||
        qaIds.some(id => !record.passedChecks.includes(id)))
      errors.push(platform + ' must pass every device QA matrix check without duplicates');
    if (record.accepted !== true) errors.push(platform + ' must be explicitly accepted');
  }
  if (evidence.android?.testedCommit && evidence.ios?.testedCommit &&
      evidence.android.testedCommit !== evidence.ios.testedCommit)
    errors.push('Android and iOS must be approved against the same source commit');
  return errors;
}

function isReservedHost(host) {
  if (typeof host !== 'string') return true;
  const value = host.toLowerCase();
  return ['example.com', 'example.org', 'example.net', 'localhost', 'test', 'invalid'].some(
    suffix => value === suffix || value.endsWith('.' + suffix));
}

function isPublisherHttpsUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !isReservedHost(url.hostname) && url.hostname.includes('.') &&
      !/^\d+(\.\d+){3}$/.test(url.hostname);
  } catch { return false; }
}

function isEasBuildPage(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://expo.dev' && !url.username && !url.password &&
      /^\/accounts\/[^/]+\/projects\/[^/]+\/builds\/[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(url.pathname);
  } catch { return false; }
}

function isPastCalendarDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date &&
    parsed.getTime() <= Date.now();
}

// Only validates the file format/dimensions. Human approval of artwork remains mandatory.
export function hasValidLauncherIcon(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const signature = Buffer.from([137,80,78,71,13,10,26,10]);
    return data.length >= 33 && data.subarray(0, 8).equals(signature) &&
      data.toString('ascii', 12, 16) === 'IHDR' &&
      data.readUInt32BE(16) === 1024 && data.readUInt32BE(20) === 1024;
  } catch { return false; }
}

export function validateVersionPair(app, pkg) {
  return app?.expo?.version === pkg?.version ? [] :
    ['Expo app.json version and package.json version must match'];
}

export function qaMatrixIds(markdown) {
  return [...markdown.matchAll(/^\|\s*(\d{2})\s*\|/gm)].map(match => match[1]);
}

function execute() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const configIssues = [
    ...validateReleaseConfig(app, eas), ...validateVersionPair(app, pkg),
  ];
  const strict = process.argv.includes('--ready');
  if (process.argv.includes('--linked')) configIssues.push(...validateEasLink(app));
  if (strict) {
    const approvals = path.join(root, 'release', 'release-evidence.json');
    const evidence = fs.existsSync(approvals) ? JSON.parse(fs.readFileSync(approvals, 'utf8')) : null;
    const qaIds = qaMatrixIds(fs.readFileSync(path.join(root, 'docs/qa-device-matrix.md'), 'utf8'));
    if (qaIds.length !== DEFAULT_QA_IDS.length ||
        qaIds.some((id, i) => id !== DEFAULT_QA_IDS[i])) {
      configIssues.push('Device QA matrix no longer matches expected 01–20 checklist');
    }
    const icon = app.expo?.icon;
    const hasIcon = typeof icon === 'string' && hasValidLauncherIcon(path.resolve(root, icon));
    let currentCommit = null;
    try { currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
    catch { configIssues.push('Cannot read the current Git commit for native QA evidence validation'); }
    configIssues.push(...validateReleaseEvidence(app, evidence, qaIds, hasIcon, currentCommit));
  }
  if (configIssues.length) {
    console.error(strict ? 'Release blocked:' : 'Release configuration invalid:');
    for (const reason of configIssues) console.error(' - ' + reason);
    process.exitCode = 1;
    return;
  }
  console.log(strict
    ? 'All locally documented release gates passed; external store review is still required.'
    : 'EAS release configuration is structurally valid. This does not approve native release.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  execute();
