This directory contains the modular Builder UI code using native ES modules.

Architecture
- Each module is a focused ES module with clear exports/imports
- No build step required - browsers load modules directly
- Better debugging with individual file source maps
- Tree shaking support for optimal loading

Modules
- utils.js: debounce, uuid, string sanitizers
- ui.js: DOM helpers, flash effects, tabs
- templates.js: Handlebars preload + render helpers
- helpers.js: Field validation helpers
- constants.js: Configuration and defaults
- state.js: localStorage persistence
- dnd.js: drag-and-drop utilities
- api.js: Server communication
- main.js: Main Builder class
- index.js: Entry point with exports

Usage
- Import directly in HTML: `<script type="module" src="/src/client/builder/index.js"></script>`
- Server serves modules from `/src/client/builder/` route
- No build step needed for development

