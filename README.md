# Cloaks Beta-Test: Communication Logic & JSON Protocols
------------------------------------------------------

This Beta version focuses on the robustness of the **P2P Tunnel**. Unlike conventional chat apps, Cloaks uses a "blind" signaling system where the server acts as a facilitator but never stores or interprets the conversation data.

### Conversation Logic (P2P Handshake)

The system operates under two distinct logic flows to ensure peers always find each other:

1.  **Room Mode (Signaling/Cloaks)**: When entering a room, the server introduces all participants. The **"New Participant"** (the one just joining) takes the initiative to send WebRTC offers to all "Veterans" currently in the room.
    
2.  **Messenger Mode (Direct)**: This is based on proactive searching. When a user searches for an ID (find\_peer) and the server confirms they are online, the WebRTC protocol is triggered immediately to establish a direct link.
    

### JSON Key Structure (The Protocol)

To ensure messages reach their destination through the signaling server, we use a specific JSON schema. It is vital that these keys remain intact to prevent the server from discarding the packet:

*   **type**: Defines the primary action, such as join, register, offer, answer, candidate, or signal.
    
*   **appType**: Acts as a router on the server; it can be cloaks (for rooms) or cudi-messenger (for direct chats).
    
*   **fromPeerId / targetPeerId**: Identity keys using persistent 32-character hexadecimal IDs generated locally.
    
*   **signalType**: A masking key used only in Rooms so the server can relay WebRTC data without reading the internal SDP content.
    

### How the "Tunnel" Works

1.  **Registration**: The client generates a unique ID using crypto.getRandomValues and registers via the socket.
    
2.  **Signaling**: JSON keys for offer and answer are exchanged through the signaling server.
    
3.  **DataChannel Opening**: Once the connection state changes to connected, a canalDatos (DataChannel) is opened. From this point forward, the signaling server no longer intervenes; messages travel directly through the encrypted WebRTC tunnel.
    

### Beta Notes

*   **Local Identity**: If you clear browser data, your ID will change, as it resides exclusively in your **Identity-Silo** (IndexedDB).