// src/client/builder/index.js
import { Builder, startBuilder } from './main.js';

// Export everything for external use
export { Builder, startBuilder };

// Auto-initialize if in browser and flag is set
if (typeof window !== 'undefined') {
    // Create global namespace for backward compatibility
    window.BuilderApp = {
        Builder,
        startBuilder
    };

    // Auto-start if flag is set (for backward compatibility)
    if (window.BUILDER_USE_MODULAR) {
        startBuilder().catch(error => {
            // Failed to start Builder - error handled by UI
        });
    }
}
