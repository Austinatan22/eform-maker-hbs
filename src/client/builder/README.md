This directory will house the modular Builder UI code.

Goal
- Split the current `public/js/builder.js` into small focused modules (utils, templates, state, dnd, api, main).
- Bundle them back into a single browser file at `public/js/builder.js` for the app to serve.

Suggested modules
- utils.js: debounce, uuid, string sanitizers
- templates.js: Handlebars preload + render helpers
- state.js: defaults, option types, localStorage persistence
- dnd.js: drag-and-drop helpers
- api.js: fetch wrappers for save/check-title
- main.js: Builder class wiring everything together
- boot.js: DOMContentLoaded bootstrap

Build
- Use `npm run build:builder` to concatenate the module files into `public/js/builder.js`.
- Initially, the build falls back to the legacy file to avoid regressions while we migrate code incrementally.

