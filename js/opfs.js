window.Cudi = window.Cudi || {};

(function () {
    let isWriting = false;

    window.Cudi.opfs = {
        async getDirectory() {
            if (!navigator.storage || !navigator.storage.getDirectory) {
                return null;
            }
            return await navigator.storage.getDirectory();
        },

        async loadHistory(peerId, offset = 0, limit = 50) {
            if (!peerId || peerId === 'state') return [];
            const root = await this.getDirectory();
            if (!root) return [];

            try {
                const fileName = `chat_${peerId}.json`;
                let fileHandle;
                try {
                    fileHandle = await root.getFileHandle(fileName);
                } catch {
                    try {
                        fileHandle = await root.getFileHandle(`${peerId}.json`);
                    } catch {
                        return [];
                    }
                }

                const file = await fileHandle.getFile();
                const text = await file.text();

                if (!text) return [];

                if (text.trim().startsWith('[')) {
                    const data = JSON.parse(text);
                    return data.slice(Math.max(0, data.length - offset - limit), data.length - offset);
                } else {
                    const lines = text.split('\n').filter(l => l.trim());
                    const messages = lines.map(l => JSON.parse(l));
                    return messages.slice(Math.max(0, messages.length - offset - limit), messages.length - offset);
                }
            } catch {
                return [];
            }
        },

        async appendMessage(peerId, msg) {
            if (isWriting) {
                setTimeout(() => window.Cudi.opfs.appendMessage(peerId, msg), 100);
                return;
            }

            const state = window.Cudi.state;
            if (state.isZeroTrace) {
                return;
            }

            isWriting = true;
            try {
                const root = await this.getDirectory();
                if (!root) throw new Error("No root directory");

                const fileName = `chat_${peerId}.json`;
                const fileHandle = await root.getFileHandle(fileName, { create: true });
                const file = await fileHandle.getFile();

                const writable = await fileHandle.createWritable({ keepExistingData: true });
                await writable.write({ type: 'write', data: JSON.stringify(msg) + '\n', position: file.size });
                await writable.close();
            } catch {
                // Ignore write error
            } finally {
                isWriting = false;
            }
        },

        async getRecentChats() {
            const root = await this.getDirectory();
            if (!root) return [];

            const chats = [];
            try {
                const entries = [];
                for await (const entry of root.values()) {
                    if (entry.kind === 'file' && entry.name.startsWith('chat_') && entry.name.endsWith('.json')) {
                        const file = await entry.getFile();
                        entries.push({
                            name: entry.name,
                            lastModified: file.lastModified,
                            peerId: entry.name.replace('chat_', '').replace('.json', '')
                        });
                    }
                }
                entries.sort((a, b) => b.lastModified - a.lastModified);
                return entries.map(e => e.peerId);
            } catch {
                // Ignore read error
            }
            return chats;
        },

        async saveContactMetadata(peerId, metadata) {
            const root = await this.getDirectory();
            if (!root) return;
            try {
                const fileHandle = await root.getFileHandle('contacts_cache.json', { create: true });
                const file = await fileHandle.getFile();
                const text = await file.text();
                const cache = text ? JSON.parse(text) : {};

                cache[peerId] = {
                    ...cache[peerId],
                    ...metadata,
                    updatedAt: Date.now()
                };

                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(cache));
                await writable.close();
            } catch {
                // Ignore save error
            }
        },

        async getContactMetadata(peerId) {
            const root = await this.getDirectory();
            if (!root) return null;
            try {
                const fileHandle = await root.getFileHandle('contacts_cache.json');
                const file = await fileHandle.getFile();
                const text = await file.text();
                const cache = JSON.parse(text);
                return cache[peerId] || null;
            } catch {
                return null;
            }
        },

        async getAllCachedContacts() {
            const root = await this.getDirectory();
            if (!root) return [];
            try {
                const fileHandle = await root.getFileHandle('contacts_cache.json');
                const file = await fileHandle.getFile();
                const text = await file.text();
                const cache = JSON.parse(text);
                return Object.keys(cache);
            } catch {
                return [];
            }
        },

        async isPermanentContact(peerId) {
            const meta = await this.getContactMetadata(peerId);
            return !!meta;
        },

        async savePermanentContact(peerId, alias) {
            await this.saveContactMetadata(peerId, {
                alias: alias,
                isPermanent: true
            });
            window.Cudi.showToast(`Contacto guardado soberanamente: ${alias}`, "success");
            if (window.Cudi.ui) {
                window.Cudi.ui.updateMemberSidebar();
                window.Cudi.ui.renderRecentChats();
            }
        },

        async deleteChat(peerId) {
            const root = await this.getDirectory();
            if (!root) return;
            try {
                await root.removeEntry(`chat_${peerId}.json`);
                return true;
            } catch {
                return false;
            }
        },

        async clearAllHistory() {
            const root = await this.getDirectory();
            if (!root) return;

            try {
                for await (const entry of root.values()) {
                    if (entry.kind === 'file') {
                        await root.removeEntry(entry.name);
                    }
                }
            } catch {
                // Ignore cleanup error
            }
        }
    };

    window.Cudi.loadHistory = (peerId) => window.Cudi.opfs.loadHistory(peerId);
    window.Cudi.appendMessage = (peerId, msg) => {
        const instance = window.Cudi.state.activeChats.get(peerId);
        if (instance) {
            instance.history.push(msg);
        }
        return window.Cudi.opfs.appendMessage(peerId, msg);
    };

    window.Cudi.autoCleanup = () => {
        const state = window.Cudi.state;
        state.activeChats.forEach((instance) => {
            instance.history = [];
        });
    };

    window.Cudi.syncPendingMessages = async (peerId) => {
        const history = await window.Cudi.opfs.loadHistory(peerId);
        const pending = history.filter(m => m.status === 'pending');
        if (pending.length === 0) return;

        const instance = window.Cudi.state.activeChats.get(peerId);
        if (instance && instance.dc && instance.dc.readyState === 'open') {
            const myAlias = window.Cudi.state.localAlias || 'You';

            for (const msg of pending) {
                delete msg.status;
                instance.dc.send(JSON.stringify({
                    type: "chat",
                    subType: "text",
                    ...msg,
                    alias: myAlias
                }));
            }

            const root = await window.Cudi.opfs.getDirectory();
            const fileHandle = await root.getFileHandle(`chat_${peerId}.json`, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(history));
            await writable.close();

            window.Cudi.showToast(`Synced ${pending.length} offline messages.`, "success");
        }
    };
})();
