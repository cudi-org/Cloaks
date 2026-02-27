window.Cudi = window.Cudi || {};

/**
 * OPFS Manager for persistent chat history
 */
(function () {
    let isWriting = false;

    window.Cudi.opfs = {
        async getDirectory() {
            if (!navigator.storage || !navigator.storage.getDirectory) {
                console.warn("OPFS not supported in this browser.");
                return null;
            }
            return await navigator.storage.getDirectory();
        },

        async loadHistory(peerId) {
            if (!peerId || peerId === 'state') return [];
            console.log(`📂 [OPFS] Intentando cargar historial de: ${peerId}`);
            const root = await this.getDirectory();
            if (!root) return [];

            try {
                // Check for both naming conventions
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

                // VITAL: Si no hay texto, devolver []. Si hay, parsear.
                const data = text ? JSON.parse(text) : [];

                // Doble check: si lo que parseamos no es array, lo devuelve vacío
                return Array.isArray(data) ? data : [];
            } catch (e) {
                console.error("📂 [OPFS] Error cargando historial:", e);
                return []; // Siempre devuelve un array para que forEach no explote
            }
        },

        async appendMessage(peerId, msg) {
            if (isWriting) {
                console.log("⏳ [OPFS] Disco ocupado, reintentando en 100ms...");
                setTimeout(() => window.Cudi.opfs.appendMessage(peerId, msg), 100);
                return;
            }

            const state = window.Cudi.state;
            if (state.isZeroTrace) {
                console.log("👻 [OPFS] Modo Zero-Trace activo. Mensaje NO guardado.");
                return;
            }

            isWriting = true;
            try {
                console.log(`💾 [OPFS] Guardando mensaje para ${peerId} en disco local...`);
                const root = await this.getDirectory();
                if (!root) throw new Error("No root directory");

                const fileName = `chat_${peerId}.json`;
                const fileHandle = await root.getFileHandle(fileName, { create: true });

                // Atomic logic: Load -> Update -> Save
                // Note: and use the atomicity of renaming if needed, but here we just write
                const history = await this.loadHistory(peerId);
                history.push(msg);

                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(history));
                await writable.close();

                console.log(`✅ [OPFS] Guardado chat con ${peerId}`);
            } catch (e) {
                console.error("❌ Error crítico en OPFS:", e);
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
                // Sort by lastModified DESC
                entries.sort((a, b) => b.lastModified - a.lastModified);
                return entries.map(e => e.peerId);
            } catch (e) {
                console.error("Error listing recent chats", e);
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
            } catch (e) {
                console.error("Error saving metadata", e);
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

        async deleteChat(peerId) {
            const root = await this.getDirectory();
            if (!root) return;
            try {
                await root.removeEntry(`chat_${peerId}.json`);
                console.log(`🗑️ [OPFS] Borrado chat con ${peerId}`);
                return true;
            } catch (e) {
                console.error("Error deleting chat", e);
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
            } catch (e) {
                console.error("Error clearing history", e);
            }
        }
    };

    // Global shortcuts
    window.Cudi.loadHistory = (peerId) => window.Cudi.opfs.loadHistory(peerId);
    window.Cudi.appendMessage = (peerId, msg) => {
        // Memory storage first
        const instance = window.Cudi.state.activeChats.get(peerId);
        if (instance) {
            instance.history.push(msg);
        }
        // OPFS storage
        return window.Cudi.opfs.appendMessage(peerId, msg);
    };

    window.Cudi.autoCleanup = () => {
        const state = window.Cudi.state;
        state.activeChats.forEach((instance) => {
            instance.history = [];
        });
        console.log("RAM history cleared.");
    };

    window.Cudi.syncPendingMessages = async (peerId) => {
        const history = await window.Cudi.opfs.loadHistory(peerId);
        const pending = history.filter(m => m.status === 'pending');
        if (pending.length === 0) return;

        const instance = window.Cudi.state.activeChats.get(peerId);
        if (instance && instance.dc && instance.dc.readyState === 'open') {
            const myAlias = window.Cudi.state.localAlias || 'You';
            console.log(`📡 [OPFS] Sincronizando ${pending.length} mensajes pendientes con ${peerId}`);

            for (const msg of pending) {
                delete msg.status; // Remove pending flag
                instance.dc.send(JSON.stringify({
                    type: "chat",
                    subType: "text",
                    ...msg,
                    alias: myAlias
                }));
            }

            // Save history back without pending flags
            const root = await window.Cudi.opfs.getDirectory();
            const fileHandle = await root.getFileHandle(`chat_${peerId}.json`, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(history));
            await writable.close();

            window.Cudi.showToast(`Synced ${pending.length} offline messages.`, "success");
        }
    };
})();
