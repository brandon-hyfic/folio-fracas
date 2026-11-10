// WebRTC transport via PeerJS (loaded from CDN as global `Peer`). Host-authoritative star topology.
// The free public PeerJS broker (0.peerjs.com) is a third-party service: it can be down, and some networks
// need a TURN server (none configured here).
const PREFIX = 'folio-fracas-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const randomCode = (n = 5) => Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const peerAvailable = () => typeof window !== 'undefined' && typeof window.Peer === 'function';

export function hostRoom({ onOpen, onJoin, onMessage, onLeave, onError }) {
  let tries = 0, peer = null, closed = false;
  const conns = new Map(); // connId -> DataConnection
  function open() {
    const code = randomCode();
    peer = new window.Peer(PREFIX + code, { debug: 1 });
    peer.on('open', () => onOpen(code));
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && tries++ < 6) { peer.destroy(); open(); return; }
      onError(e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' ? 'Cannot reach the PeerJS broker (it may be down).' : 'Network error: ' + e.type);
    });
    peer.on('connection', (c) => {
      c.on('open', () => { conns.set(c.peer, c); onJoin(c.peer); });
      c.on('data', (m) => { try { onMessage(c.peer, m); } catch (err) { console.error(err); } });
      const gone = () => { if (conns.delete(c.peer)) onLeave(c.peer); };
      c.on('close', gone); c.on('error', gone);
    });
  }
  open();
  return {
    send(id, msg) { const c = conns.get(id); if (c && c.open) c.send(msg); },
    broadcast(msg) { for (const c of conns.values()) if (c.open) c.send(msg); },
    kick(id) { const c = conns.get(id); if (c) c.close(); },
    close() { closed = true; try { peer.destroy(); } catch {} },
    get ids() { return [...conns.keys()]; },
  };
}

export function joinRoom(code, { onOpen, onMessage, onClose, onError }) {
  const peer = new window.Peer({ debug: 1 });
  let conn = null, opened = false;
  const timer = setTimeout(() => { if (!opened) { onError('No answer from that room. Check the code, or the broker/network may be blocking WebRTC.'); try { peer.destroy(); } catch {} } }, 12000);
  peer.on('error', (e) => { clearTimeout(timer); onError(e.type === 'peer-unavailable' ? 'No room with that code.' : 'Network error: ' + e.type); });
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code.toUpperCase().trim(), { reliable: true });
    conn.on('open', () => { opened = true; clearTimeout(timer); onOpen(); });
    conn.on('data', (m) => { try { onMessage(m); } catch (err) { console.error(err); } });
    conn.on('close', () => onClose()); conn.on('error', () => onClose());
  });
  return { send(m) { if (conn && conn.open) conn.send(m); }, close() { clearTimeout(timer); try { peer.destroy(); } catch {} } };
}
