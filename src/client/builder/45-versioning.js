// src/client/builder/45-versioning.js
(function () {
    const NS = (window.BuilderApp = window.BuilderApp || {});

    // Auto-save functionality
    let autoSaveTimeout = null;
    let lastSavedState = null;
    let isAutoSaving = false;

    // Initialize versioning features
    NS.Versioning = {
        init() {
            this.setupAutoSave();
            this.setupDraftManagement();
            this.setupVersionManagement();
        },

        setupAutoSave() {
            // Auto-save every 30 seconds if there are changes
            setInterval(() => {
                if (this.hasUnsavedChanges() && !isAutoSaving) {
                    this.autoSave();
                }
            }, 30000);

            // Auto-save on form changes
            document.addEventListener('input', () => {
                this.scheduleAutoSave();
            });
        },

        scheduleAutoSave() {
            if (autoSaveTimeout) {
                clearTimeout(autoSaveTimeout);
            }

            autoSaveTimeout = setTimeout(() => {
                if (this.hasUnsavedChanges() && !isAutoSaving) {
                    this.autoSave();
                }
            }, 2000); // Auto-save 2 seconds after last change
        },

        hasUnsavedChanges() {
            const currentState = this.getCurrentFormState();
            return JSON.stringify(currentState) !== JSON.stringify(lastSavedState);
        },

        getCurrentFormState() {
            const state = NS.State.get();
            return {
                title: state.title,
                fields: state.fields,
                category: state.category
            };
        },

        async autoSave() {
            if (isAutoSaving) return;

            isAutoSaving = true;
            try {
                const state = this.getCurrentFormState();
                const payload = {
                    formId: NS.State.get().id || null,
                    title: state.title,
                    fields: state.fields,
                    categoryId: state.category,
                    isAutoSave: true
                };

                const { res, body } = await NS.API.saveDraft(payload);

                if (res.ok) {
                    lastSavedState = state;
                    this.showAutoSaveIndicator();
                }
            } catch (error) {
                console.warn('Auto-save failed:', error);
            } finally {
                isAutoSaving = false;
            }
        },

        async saveDraft(manual = false) {
            try {
                const state = this.getCurrentFormState();
                const payload = {
                    formId: NS.State.get().id || null,
                    title: state.title,
                    fields: state.fields,
                    categoryId: state.category,
                    isAutoSave: false
                };

                const { res, body } = await NS.API.saveDraft(payload);

                if (res.ok) {
                    lastSavedState = state;
                    if (manual) {
                        this.showSuccessMessage('Draft saved successfully');
                    }
                    return body.draft;
                } else {
                    throw new Error(body.error || 'Failed to save draft');
                }
            } catch (error) {
                console.error('Save draft error:', error);
                this.showErrorMessage('Failed to save draft: ' + error.message);
                throw error;
            }
        },

        async publishDraft(draftId) {
            try {
                const { res, body } = await NS.API.publishDraft(draftId);

                if (res.ok) {
                    this.showSuccessMessage('Draft published successfully');
                    // Redirect to the new form
                    window.location.href = `/builder/${body.form.id}`;
                } else {
                    throw new Error(body.error || 'Failed to publish draft');
                }
            } catch (error) {
                console.error('Publish draft error:', error);
                this.showErrorMessage('Failed to publish draft: ' + error.message);
                throw error;
            }
        },

        async createVersion(changeDescription) {
            try {
                const formId = NS.State.get().id;
                if (!formId) {
                    throw new Error('No form ID available');
                }

                const { res, body } = await NS.API.createVersion(formId, changeDescription);

                if (res.ok) {
                    this.showSuccessMessage(`Version ${body.version.versionNumber} created successfully`);
                    return body.version;
                } else {
                    throw new Error(body.error || 'Failed to create version');
                }
            } catch (error) {
                console.error('Create version error:', error);
                this.showErrorMessage('Failed to create version: ' + error.message);
                throw error;
            }
        },

        async publishVersion(versionId) {
            try {
                const formId = NS.State.get().id;
                if (!formId) {
                    throw new Error('No form ID available');
                }

                const { res, body } = await NS.API.publishVersion(formId, versionId);

                if (res.ok) {
                    this.showSuccessMessage(`Version ${body.version.versionNumber} published successfully`);
                    // Reload the form to get the updated state
                    window.location.reload();
                } else {
                    throw new Error(body.error || 'Failed to publish version');
                }
            } catch (error) {
                console.error('Publish version error:', error);
                this.showErrorMessage('Failed to publish version: ' + error.message);
                throw error;
            }
        },

        async rollbackVersion(versionId) {
            try {
                const formId = NS.State.get().id;
                if (!formId) {
                    throw new Error('No form ID available');
                }

                const { res, body } = await NS.API.rollbackVersion(formId, versionId);

                if (res.ok) {
                    this.showSuccessMessage(`Rolled back to version ${body.version.versionNumber}`);
                    // Reload the form to get the updated state
                    window.location.reload();
                } else {
                    throw new Error(body.error || 'Failed to rollback version');
                }
            } catch (error) {
                console.error('Rollback version error:', error);
                this.showErrorMessage('Failed to rollback version: ' + error.message);
                throw error;
            }
        },

        async getVersions() {
            try {
                const formId = NS.State.get().id;
                if (!formId) {
                    return [];
                }

                const { res, body } = await NS.API.getVersions(formId);

                if (res.ok) {
                    return body.versions;
                } else {
                    throw new Error(body.error || 'Failed to get versions');
                }
            } catch (error) {
                console.error('Get versions error:', error);
                return [];
            }
        },

        async getDrafts() {
            try {
                const { res, body } = await NS.API.getDrafts();

                if (res.ok) {
                    return body.drafts;
                } else {
                    throw new Error(body.error || 'Failed to get drafts');
                }
            } catch (error) {
                console.error('Get drafts error:', error);
                return [];
            }
        },

        setupDraftManagement() {
            // Add draft management UI elements
            this.addDraftButtons();
        },

        setupVersionManagement() {
            // Add version management UI elements
            this.addVersionButtons();
        },

        addDraftButtons() {
            const toolbar = document.querySelector('.builder-toolbar') || this.createToolbar();

            // Save Draft button
            const saveDraftBtn = document.createElement('button');
            saveDraftBtn.className = 'btn btn-outline-primary me-2';
            saveDraftBtn.innerHTML = '<i class="fas fa-save"></i> Save Draft';
            saveDraftBtn.onclick = () => this.saveDraft(true);
            toolbar.appendChild(saveDraftBtn);

            // Drafts dropdown
            const draftsDropdown = document.createElement('div');
            draftsDropdown.className = 'dropdown me-2';
            draftsDropdown.innerHTML = `
        <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
          <i class="fas fa-file-alt"></i> Drafts
        </button>
        <ul class="dropdown-menu" id="drafts-dropdown">
          <li><a class="dropdown-item" href="#" onclick="BuilderApp.Versioning.loadDrafts()">Load Drafts</a></li>
        </ul>
      `;
            toolbar.appendChild(draftsDropdown);
        },

        addVersionButtons() {
            const toolbar = document.querySelector('.builder-toolbar') || this.createToolbar();

            // Create Version button
            const createVersionBtn = document.createElement('button');
            createVersionBtn.className = 'btn btn-outline-info me-2';
            createVersionBtn.innerHTML = '<i class="fas fa-code-branch"></i> Create Version';
            createVersionBtn.onclick = () => this.showCreateVersionDialog();
            toolbar.appendChild(createVersionBtn);

            // Versions dropdown
            const versionsDropdown = document.createElement('div');
            versionsDropdown.className = 'dropdown me-2';
            versionsDropdown.innerHTML = `
        <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
          <i class="fas fa-history"></i> Versions
        </button>
        <ul class="dropdown-menu" id="versions-dropdown">
          <li><a class="dropdown-item" href="#" onclick="BuilderApp.Versioning.loadVersions()">Load Versions</a></li>
        </ul>
      `;
            toolbar.appendChild(versionsDropdown);
        },

        createToolbar() {
            const toolbar = document.createElement('div');
            toolbar.className = 'builder-toolbar d-flex justify-content-between align-items-center p-3 border-bottom';

            const leftSection = document.createElement('div');
            leftSection.className = 'd-flex align-items-center';
            toolbar.appendChild(leftSection);

            const rightSection = document.createElement('div');
            rightSection.className = 'd-flex align-items-center';
            toolbar.appendChild(rightSection);

            // Insert toolbar at the top of the builder
            const builder = document.querySelector('.builder-container') || document.body;
            builder.insertBefore(toolbar, builder.firstChild);

            return rightSection;
        },

        async loadDrafts() {
            try {
                const drafts = await this.getDrafts();
                const dropdown = document.getElementById('drafts-dropdown');

                // Clear existing items except the first one
                dropdown.innerHTML = '<li><a class="dropdown-item" href="#" onclick="BuilderApp.Versioning.loadDrafts()">Refresh</a></li>';

                if (drafts.length === 0) {
                    dropdown.innerHTML += '<li><span class="dropdown-item-text">No drafts found</span></li>';
                    return;
                }

                drafts.forEach(draft => {
                    const item = document.createElement('li');
                    item.innerHTML = `
            <a class="dropdown-item" href="#" onclick="BuilderApp.Versioning.loadDraft('${draft.id}')">
              ${draft.title || '(Untitled)'} 
              <small class="text-muted">(${new Date(draft.lastSavedAt).toLocaleDateString()})</small>
            </a>
          `;
                    dropdown.appendChild(item);
                });
            } catch (error) {
                console.error('Load drafts error:', error);
            }
        },

        async loadVersions() {
            try {
                const versions = await this.getVersions();
                const dropdown = document.getElementById('versions-dropdown');

                // Clear existing items except the first one
                dropdown.innerHTML = '<li><a class="dropdown-item" href="#" onclick="BuilderApp.Versioning.loadVersions()">Refresh</a></li>';

                if (versions.length === 0) {
                    dropdown.innerHTML += '<li><span class="dropdown-item-text">No versions found</span></li>';
                    return;
                }

                versions.forEach(version => {
                    const item = document.createElement('li');
                    const publishedBadge = version.isPublished ? '<span class="badge bg-success ms-1">Published</span>' : '';
                    item.innerHTML = `
            <a class="dropdown-item" href="#" onclick="BuilderApp.Versioning.showVersionActions('${version.id}', ${version.versionNumber})">
              v${version.versionNumber} ${publishedBadge}
              <br><small class="text-muted">${version.changeDescription || 'No description'}</small>
            </a>
          `;
                    dropdown.appendChild(item);
                });
            } catch (error) {
                console.error('Load versions error:', error);
            }
        },

        loadDraft(draftId) {
            // This would load a draft into the current builder state
            // Implementation depends on how the builder state is managed
            this.showInfoMessage('Draft loading functionality needs to be implemented');
        },

        showVersionActions(versionId, versionNumber) {
            const actions = `
        <div class="btn-group" role="group">
          <button class="btn btn-sm btn-outline-primary" onclick="BuilderApp.Versioning.publishVersion('${versionId}')">
            Publish
          </button>
          <button class="btn btn-sm btn-outline-warning" onclick="BuilderApp.Versioning.rollbackVersion('${versionId}')">
            Rollback
          </button>
        </div>
      `;

            this.showModal(`Version ${versionNumber} Actions`, actions);
        },

        showCreateVersionDialog() {
            const formId = NS.State.get().id;
            if (!formId) {
                this.showErrorMessage('Cannot create version: No form ID available');
                return;
            }

            const dialog = `
        <div class="mb-3">
          <label for="changeDescription" class="form-label">Change Description</label>
          <textarea class="form-control" id="changeDescription" rows="3" placeholder="Describe the changes in this version..."></textarea>
        </div>
        <div class="d-flex justify-content-end">
          <button type="button" class="btn btn-secondary me-2" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="BuilderApp.Versioning.createVersionFromDialog()">Create Version</button>
        </div>
      `;

            this.showModal('Create New Version', dialog);
        },

        async createVersionFromDialog() {
            const changeDescription = document.getElementById('changeDescription').value;
            try {
                await this.createVersion(changeDescription);
                // Close modal
                const modal = bootstrap.Modal.getInstance(document.querySelector('.modal'));
                if (modal) modal.hide();
            } catch (error) {
                // Error already shown in createVersion
            }
        },

        showAutoSaveIndicator() {
            this.showToast('Auto-saved', 'success', 2000);
        },

        showSuccessMessage(message) {
            this.showToast(message, 'success');
        },

        showErrorMessage(message) {
            this.showToast(message, 'danger');
        },

        showInfoMessage(message) {
            this.showToast(message, 'info');
        },

        showToast(message, type = 'info', duration = 5000) {
            // Create toast element
            const toast = document.createElement('div');
            toast.className = `toast align-items-center text-white bg-${type} border-0`;
            toast.setAttribute('role', 'alert');
            toast.innerHTML = `
        <div class="d-flex">
          <div class="toast-body">${message}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      `;

            // Add to toast container
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                container.className = 'toast-container position-fixed top-0 end-0 p-3';
                container.style.zIndex = '9999';
                document.body.appendChild(container);
            }

            container.appendChild(toast);

            // Show toast
            const bsToast = new bootstrap.Toast(toast, { delay: duration });
            bsToast.show();

            // Remove from DOM after hiding
            toast.addEventListener('hidden.bs.toast', () => {
                toast.remove();
            });
        },

        showModal(title, content) {
            // Create modal element
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              ${content}
            </div>
          </div>
        </div>
      `;

            document.body.appendChild(modal);

            // Show modal
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();

            // Remove from DOM after hiding
            modal.addEventListener('hidden.bs.modal', () => {
                modal.remove();
            });
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => NS.Versioning.init());
    } else {
        NS.Versioning.init();
    }
})();
