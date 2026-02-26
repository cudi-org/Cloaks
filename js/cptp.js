/**
 * CPTP: Cloak Parallel Transfer Protocol
 * Handles multi-channel file transfers for files > 1GB
 */

const CPTP = {
    CHANNELS_COUNT: 16,
    activeChannels: [],

    async initTransfer(file) {
        console.log(`[CPTP] Initializing 16-channel transfer for ${file.name} (${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB)`);

        const state = window.Cudi.state;
        if (!state.peer) return;

        this.activeChannels = [];

        // Open 16 channels
        for (let i = 0; i < this.CHANNELS_COUNT; i++) {
            const label = `cptp_channel_${i}`;
            const channel = state.peer.createDataChannel(label);
            this.setupChannel(channel, i, file);
            this.activeChannels.push(channel);
        }

        // Send CPTP Meta
        state.dataChannel.send(JSON.stringify({
            type: 'cptp_init',
            totalChannels: this.CHANNELS_COUNT,
            fileSize: file.size,
            fileName: file.name
        }));
    },

    setupChannel(channel, index, file) {
        channel.onopen = () => {
            console.log(`[CPTP] Channel ${index} open.`);
            // When all 16 are open, we could start. 
            // For simplicity, we just start each part independently.
            this.sendPart(channel, index, file);
        };

        channel.onmessage = () => {
            // Handle ACKs if needed
        };
    },

    async sendPart(channel, index, file) {
        const partSize = Math.ceil(file.size / this.CHANNELS_COUNT);
        const start = index * partSize;
        const end = Math.min(start + partSize, file.size);

        console.log(`[CPTP] Channel ${index} sending part ${start} to ${end}`);

        let offset = start;
        const CHUNK_SIZE = 64 * 1024; // 64KB chunks for parallel channels

        while (offset < end) {
            if (channel.readyState !== 'open') break;

            if (channel.bufferedAmount > 4 * 1024 * 1024) {
                await new Promise(r => setTimeout(r, 10));
                continue;
            }

            const slice = file.slice(offset, Math.min(offset + CHUNK_SIZE, end));
            const buffer = await slice.arrayBuffer();

            // CPTP Packet: [PartIndex (1B)] + [Offset (4B)] + [Data]
            // For now, just send raw with offset metadata handled by secondary signaling or implicitly
            channel.send(buffer);

            offset += CHUNK_SIZE;
        }
        console.log(`[CPTP] Channel ${index} finished.`);
    }
};

window.CPTP = CPTP;
