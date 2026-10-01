// ICE servers for the peer-to-peer connections.
// STUN lets most home networks connect directly. A TURN relay is needed when a friend is
// behind a strict NAT (some mobile networks, campus/office Wi-Fi).
//
// PeerJS runs a free public TURN relay (used below). For more reliable game nights, create a
// free account at metered.ca (or expressturn.com) and put your own credentials in TURN.
const TURN = null; // e.g. { urls: ['turn:yourapp.metered.live:80', 'turns:yourapp.metered.live:443'], username: '…', credential: '…' }

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  ...(TURN ? [TURN] : []),
];
