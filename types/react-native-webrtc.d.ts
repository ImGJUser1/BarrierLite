// frontend/types/react-native-webrtc.d.ts
declare module 'react-native-webrtc' {
  export class RTCPeerConnection {
    constructor(config: any);
    createOffer: () => Promise<RTCSessionDescriptionInit>;
    createAnswer: () => Promise<RTCSessionDescriptionInit>;
    setLocalDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
    setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
    addTrack: (track: MediaStreamTrack, stream: MediaStream) => void;
    addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
    createDataChannel: (label: string) => RTCDataChannel;
    getStats: () => Promise<any>;
    close: () => void;
    ontrack?: (event: { track: MediaStreamTrack }) => void;
    onicecandidate?: (event: { candidate: RTCIceCandidateInit | null }) => void;
    onconnectionstatechange?: () => void;
    connectionState: string;
  }

  export class RTCDataChannel {
    readyState: string;
    send: (data: any) => void;
    close: () => void;
    onopen?: () => void;
    onmessage?: (event: { data: any }) => void;
    onclose?: () => void;
  }

  export class MediaStream {
    constructor(tracks: MediaStreamTrack[]);
    getTracks: () => MediaStreamTrack[];
    toURL: () => string;
  }

  export class MediaStreamTrack {
    stop: () => void;
  }

  export class RTCSessionDescription {
    constructor(init: RTCSessionDescriptionInit);
    sdp: string;
    type: string;
  }

  export interface RTCSessionDescriptionInit {
    sdp?: string;
    type: 'offer' | 'answer';
  }

  export class RTCIceCandidate {
    constructor(init: RTCIceCandidateInit);
    toJSON: () => RTCIceCandidateInit;
  }

  export interface RTCIceCandidateInit {
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
  }

  export const mediaDevices: {
    getUserMedia: (constraints: any) => Promise<MediaStream>;
    getDisplayMedia: (constraints: any) => Promise<MediaStream>;
  };
}