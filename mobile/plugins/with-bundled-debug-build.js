/**
 * Makes a debug build usable on a phone that has no Metro server.
 *
 * `mobile/android/` is gitignored, because Expo regenerates it with
 * `expo prebuild`. That means a line edited straight into
 * `android/app/build.gradle` survives on one machine and vanishes on the next
 * clone — so this plugin is where the change has to live to be durable.
 *
 * Why the change is needed at all: with `expo-dev-client` installed, React
 * Native treats the `debug` variant as debuggable and *skips* bundling the JS.
 * The resulting APK contains no `assets/index.android.bundle`; on launch it opens
 * a dev client and waits for Metro. That is fine on a laptop with Metro running
 * and shows a judge a blank screen.
 *
 * Setting `debuggableVariants` to an empty list tells the bundler that no
 * variant is debuggable, so `createBundleDebugJsAndAssets` runs and the bundle
 * is packaged into the APK. `expo-dev-client` is left installed on purpose: it
 * still provides the dev menu over USB when Metro *is* available, which is what
 * makes fast refresh work during development.
 *
 * Verify after building:
 *   unzip -l app/build/outputs/apk/debug/app-debug.apk | grep index.android.bundle
 */

const { withAppBuildGradle } = require('expo/config-plugins')

/** The line we want present. Idempotent: returns true if work is needed. */
function ensureDebuggableVariantsEmpty(contents) {
  if (/^\s*debuggableVariants\s*=/m.test(contents)) {
    return contents.replace(
      /^\s*debuggableVariants\s*=.*$/m,
      '    debuggableVariants = []',
    )
  }

  // Not set at all. Put it inside the `react { }` block, where the template
  // documents the option. Anchoring on `/* Variants */` keeps it in the right
  // place and reads as intentional next to the comment that explains it.
  const anchor = '/* Variants */'
  if (!contents.includes(anchor)) return contents

  return contents.replace(
    anchor,
    [
      anchor,
      '    //   Empty so a debug build bundles its JS and assets. See plugins/with-bundled-debug-build.js.',
      '    debuggableVariants = []',
    ].join('\n'),
  )
}

module.exports = function withBundledDebugBuild(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config
    config.modResults.contents = ensureDebuggableVariantsEmpty(
      config.modResults.contents,
    )
    return config
  })
}
