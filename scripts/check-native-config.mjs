import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Check evaluated Expo config plugins, not just app.json intent.
 * Expo config introspection runs safe native config mods in memory.
 * This cannot replace inspecting a signed APK/AAB/IPA on a physical device.
 */
export function validateNativeIntrospection(config) {
  const errors = [];
  const mods = config?._internal?.modResults;
  const androidManifest = mods?.android?.manifest?.manifest ?? mods?.android?.manifest;
  const applications = androidManifest?.application;
  const app = Array.isArray(applications) ? applications[0] : null;
  const appAttrs = app?.$ ?? {};
  if (!app || String(appAttrs['android:allowBackup']) !== 'false')
    errors.push('Generated AndroidManifest application must set android:allowBackup=false');

  const activities = Array.isArray(app?.activity) ? app.activity : [];
  const main = activities.find(activity => {
    const name = (activity?.$ ?? {})['android:name'];
    return typeof name === 'string' && name.endsWith('MainActivity');
  });
  const activityAttrs = main?.$ ?? {};
  if (!main || !String(activityAttrs['android:windowSoftInputMode'] ?? '').includes('adjustResize'))
    errors.push('Generated Android MainActivity must use adjustResize for keyboard forms');

  const iosPlist = mods?.ios?.infoPlist;
  if (!iosPlist || typeof iosPlist !== 'object')
    errors.push('iOS Info.plist introspection is missing');
  if (config?.android?.allowBackup !== false)
    errors.push('Expo Android backup configuration is no longer disabled');
  if (config?.android?.softwareKeyboardLayoutMode !== 'resize')
    errors.push('Expo Android keyboard resize configuration changed');
  if (!config?.ios?.bundleIdentifier || !config?.android?.package)
    errors.push('Native app identifiers must be configured for both platforms');
  return errors;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/check-native-config.mjs <expo-introspect-json>');
    process.exitCode = 2;
    return;
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  } catch (cause) {
    console.error('Unable to parse Expo introspection JSON:', cause instanceof Error ? cause.message : cause);
    process.exitCode = 2;
    return;
  }
  const errors = validateNativeIntrospection(config);
  if (errors.length) {
    for (const e of errors) console.error('Native config inspection failed: ' + e);
    process.exitCode = 1;
    return;
  }
  console.log('Native configuration introspection passed: Android backup disabled, keyboard resize set, iOS plist generated.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
