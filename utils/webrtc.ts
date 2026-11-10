/**
 * Relay Messenger — WebRTC Peer-to-Peer Data Channel Bridge
 * Manages direct P2P data channel communication for bot commands,
 * multiplayer games, and real-time sync without server latency.
 */

import { saveOutboxItem, saveMessage } from "./db";

export interface P2PMessage {
  type: "bot_command" | "game_sync" | "typing" | "presence" | "file_chunk";
  payload: unknown;
  timestamp: number;
  from: string;
  to?: string;
}

export interface RelayP2PEvents {
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onMessage?: (data: P2PMessage) => void;
  onError?: (error: Error) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
}

export class RelayP2PBridge {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private channelLabel: string;
  private events: RelayP2PEvents = {};
  private localId: string;
  private remoteId?: string;

  constructor(localId: string, config?: RTCConfiguration) {
    this.localId = localId;
    this.channelLabel = `relay-${localId}`;
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      ...config,
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.events.onIceCandidate) {
        this.events.onIceCandidate(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "connected") {
        this.events.onChannelOpen?.();
      } else if (this.pc.connectionState === "disconnected" || this.pc.connectionState === "failed") {
        this.events.onChannelClose?.();
      }
    };
  }

  /**
   * Set event handlers for the P2P bridge.
   */
  public setEvents(events: RelayP2PEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Create a data channel and return the local SDP offer for signaling.
   * Caller should send this offer to the remote peer via signaling server.
   */
  public async createChannel(): Promise<RTCSessionDescriptionInit> {
    this.dataChannel = this.pc.createDataChannel(this.channelLabel, {
      ordered: true,
      maxRetransmitTime: 3000,
    });
    this.setupDataChannel();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Set the remote SDP answer received via signaling.
   */
  public async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(description);
  }

  /**
   * Set a local ICE candidate received from signaling (for the initiator).
   */
  public addIceCandidate(candidate: RTCIceCandidateInit): void {
    this.pc.addIceCandidate(candidate).catch((err) => {
      this.events.onError?.(err);
    });
  }

  /**
   * Set up as a receiver: wait for the remote peer to create the data channel.
   */
  public setupReceiver(): void {
    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.channelLabel = this.dataChannel.label;
      this.setupDataChannel();
    };
  }

  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      this.events.onChannelOpen?.();
    };

    this.dataChannel.onclose = () => {
      this.events.onChannelClose?.();
    };

    this.dataChannel.onerror = (err) => {
      this.events.onError?.(err as Error);
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as P2PMessage;
        this.events.onMessage?.(parsed);

        // Persist bot commands and game syncs to IndexedDB
        if (parsed.type === "bot_command") {
          saveOutboxItem({
            id: `p2p_${parsed.timestamp}`,
            chatId: parsed.to || this.localId,
            payload: { type: "bot_command", ...parsed.payload },
            retryCount: 0,
            createdAt: parsed.timestamp,
          }).catch(console.error);
        }
        if (parsed.type === "game_sync") {
          saveMessage({
            id: `p2p_${parsed.timestamp}`,
            chatId: parsed.to || this.localId,
            senderId: parsed.from,
            body: JSON.stringify(parsed.payload),
            createdAt: new Date(parsed.timestamp).toISOString(),
          }).catch(console.error);
        }
      } catch (err) {
        console.warn("Failed to parse P2P message:", err);
      }
    };
  }

  /**
   * Send a structured P2P message over the data channel.
   */
  public send(message: P2PMessage): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.events.onError?.(
        new Error("P2P Data Channel is not open. Call createChannel() or wait for onopen.")
      );
      return;
    }

    const payload: P2PMessage = {
      ...message,
      from: this.localId,
      timestamp: message.timestamp || Date.now(),
    };

    this.dataChannel.send(JSON.stringify(payload));
  }

  /**
   * Send a raw string message.
   */
  public sendRaw(text: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.events.onError?.(new Error("P2P Data Channel is not open."));
      return;
    }
    this.dataChannel.send(text);
  }

  /**
   * Close the peer connection and data channel.
   */
  public close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    this.pc.close();
  }

  /**
   * Get the current connection state.
   */
  public getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  /**
   * Get the local peer ID.
   */
  public getLocalId(): string {
    return this.localId;
  }
}

/**
 * Create a new P2P bridge instance for the current user.
 */
export const createP2PBridge = (localId: string): RelayP2PBridge =>
  new RelayP2PBridge(localId);
