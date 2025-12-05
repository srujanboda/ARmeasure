// ----------------------------------------------
// WebRTC + Socket.IO Signaling (Fixed for Render)
// ----------------------------------------------

const SIGNALING_SERVER = "https://collateral-webxr.onrender.com";

// Force websocket transport for Render + Socket.IO
const socket = io(SIGNALING_SERVER, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 10,
});

// Room name (can be customized)
const ROOM_ID = "default-room";

// Join signaling room
socket.emit("join", ROOM_ID);

// Debug logs
socket.on("connect", () => {
    console.log("✅ Connected to signaling server");
});

// When another peer joins, backend sends "ready"
socket.on("ready", () => {
    console.log("📡 Peer ready — sending offer");
    if (pc) {
        createOffer();
    }
});

// Receive offer → set remote description → respond with answer
socket.on("offer", async (desc) => {
    console.log("📡 Received offer");
    await pc.setRemoteDescription(desc);
    await createAnswer();
});

// Receive answer → complete handshake
socket.on("answer", async (desc) => {
    console.log("📡 Received answer");
    await pc.setRemoteDescription(desc);
});

// ICE candidate exchange
socket.on("candidate", async (candidate) => {
    console.log("🌐 Received ICE candidate");
    if (candidate) {
        try {
            await pc.addIceCandidate(candidate);
        } catch (err) {
            console.error("🔥 ICE add error:", err);
        }
    }
});

// ---------------------------------------------------------
// WebRTC Peer Connection Setup
// ---------------------------------------------------------

let pc = null;
let localStream = null;

// Call this function when starting AR session or camera preview
async function startConnection() {
    console.log("🎥 Starting camera + peer connection");

    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
    });

    pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
        ]
    });

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log("🌐 Sending ICE candidate");
            socket.emit("candidate", {
                room: ROOM_ID,
                candidate: event.candidate
            });
        }
    };

    pc.ontrack = (event) => {
        const remoteVideo = document.getElementById("remoteVideo");
        if (remoteVideo) {
            remoteVideo.srcObject = event.streams[0];
        }
    };
}

// ---------------------------------------------------------
// Offer / Answer functions
// ---------------------------------------------------------

async function createOffer() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    console.log("📡 Sending offer");
    socket.emit("offer", {
        room: ROOM_ID,
        description: offer,
    });
}

async function createAnswer() {
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    console.log("📡 Sending answer");
    socket.emit("answer", {
        room: ROOM_ID,
        description: answer,
    });
}

// ---------------------------------------------------------
// Export functions to global scope if needed
// ---------------------------------------------------------

window.startConnection = startConnection;
