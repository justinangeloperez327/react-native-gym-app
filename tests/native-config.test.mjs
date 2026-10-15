import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNativeIntrospection } from '../scripts/check-native-config.mjs';

function good() {
  return {
    android: { package: 'com.example.gym', allowBackup: false, softwareKeyboardLayoutMode: 'resize' },
    ios: { bundleIdentifier: 'com.example.gym' },
    _internal: { modResults: {
      android: { manifest: { manifest: { application: [{
        $: { 'android:allowBackup': 'false' },
        activity: [{ $: { 'android:name': '.MainActivity', 'android:windowSoftInputMode': 'adjustResize' } }],
      }] } } },
      ios: { infoPlist: { CFBundleName: 'Gym App' } },
    } },
  };
}
test('expected Android native privacy/keyboard settings and iOS plist pass', () => {
  assert.deepEqual(validateNativeIntrospection(good()), []);
});
test('generated Android manifest must actually disable backup', () => {
  const config = good();
  config._internal.modResults.android.manifest.manifest.application[0].$['android:allowBackup'] = 'true';
  assert.ok(validateNativeIntrospection(config).some(m => m.includes('allowBackup=false')));
});
test('missing MainActivity keyboard resizing blocks acceptance', () => {
  const config = good();
  config._internal.modResults.android.manifest.manifest.application[0].activity[0].$['android:windowSoftInputMode'] = 'adjustPan';
  assert.ok(validateNativeIntrospection(config).some(m => m.includes('adjustResize')));
});
test('missing actual evaluated iOS native config is not silently accepted', () => {
  const config = good();
  delete config._internal.modResults.ios;
  assert.ok(validateNativeIntrospection(config).some(m => m.includes('Info.plist')));
});
