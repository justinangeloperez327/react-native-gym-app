import fs from 'node:fs';
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

export function validateReleaseEvidence(app, evidence, qaIds = DEFAULT_QA_IDS, iconExists = false) {
  const errors = [];
  const expo = app?.expo ?? {};
  const projectId = expo.extra?.eas?.projectId;
  if (typeof projectId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId))
    errors.push('EAS project is not linked: run eas init and commit its real projectId');
  if (!iconExists || typeof expo.icon !== 'string' || !expo.icon.endsWith('.png'))
    errors.push('Approved 1024px PNG launcher icon is missing in Expo app config');
  if (!evidence || typeof evidence !== 'object') {
    errors.push('Missing local release/release-evidence.json approval record');
    return errors;
  }
  if (expo.version !== '1.0.0' || evidence.releaseVersion !== '1.0.0')
    errors.push('The app and approval record must both target v1.0.0');
  if (typeof evidence.privacyPolicyUrl !== 'string' ||
      !/^https:\/\/[a-z0-9.-]+(?:\/|$)/i.test(evidence.privacyPolicyUrl))
    errors.push('An externally hosted HTTPS privacy policy URL is required');
  if (typeof evidence.contactEmail !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(evidence.contactEmail))
    errors.push('A verified store support contact address is required');
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
    if (typeof record?.buildUrl === 'string' && !/^https:\/\//i.test(record.buildUrl))
      errors.push(platform + ' buildUrl must be HTTPS');
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

export function qaMatrixIds(markdown) {
  return [...markdown.matchAll(/^\|\s*(\d{2})\s*\|/gm)].map(match => match[1]);
}

function execute() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  const configIssues = validateReleaseConfig(app, eas);
  const strict = process.argv.includes('--ready');
  if (strict) {
    const approvals = path.join(root, 'release', 'release-evidence.json');
    const evidence = fs.existsSync(approvals) ? JSON.parse(fs.readFileSync(approvals, 'utf8')) : null;
    const qaIds = qaMatrixIds(fs.readFileSync(path.join(root, 'docs/qa-device-matrix.md'), 'utf8'));
    if (qaIds.length !== DEFAULT_QA_IDS.length ||
        qaIds.some((id, i) => id !== DEFAULT_QA_IDS[i])) {
      configIssues.push('Device QA matrix no longer matches expected 01–20 checklist');
    }
    const icon = app.expo?.icon;
    const hasIcon = typeof icon === 'string' && fs.existsSync(path.resolve(root, icon));
    configIssues.push(...validateReleaseEvidence(app, evidence, qaIds, hasIcon));
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
