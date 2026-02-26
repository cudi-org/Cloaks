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
                for await (const entry of root.values()) {
                    if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                        const peerId = entry.name.replace('chat_', '').replace('.json', '');
                        if (!chats.includes(peerId)) chats.push(peerId);
                    }
                }
            } catch (e) {
                console.error("Error listing recent chats", e);
            }
            return chats;
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
})();
