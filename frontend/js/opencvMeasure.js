import { startDepthEstimator, getDepthAtPixel } from "./depthEstimation.js";
const video = document.getElementById("videoFeed");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

let points = [];

// Resize canvas to match video
function resizeCanvas() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
}

// Trigger when video feed becomes ready
video.addEventListener("loadeddata", () => {
    resizeCanvas();
    startDepthEstimator(video);   // ⭐ start depth estimation
    startWallDetection(video, canvas, ctx); 
});

// Handle clicks
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    points.push({ x, y });
    if (points.length > 2) points.shift();   // keep only 2 points

    drawOverlay();
});

// Draw dots + line + depth-based measurement
function drawOverlay() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // === Draw Points ===
    points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "lime";
        ctx.fill();
    });

    // === Draw Line + Measurement ===
    if (points.length === 2) {
        const p1 = points[0];
        const p2 = points[1];

        // draw line
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = "yellow";
        ctx.lineWidth = 3;
        ctx.stroke();

        const pixelDist = calcPixelDistance(p1, p2);

        // ⭐ Read depth at each point
        const d1 = getDepthAtPixel(p1.x, p1.y);
        const d2 = getDepthAtPixel(p2.x, p2.y);

        let meterDist;

        if (d1 && d2) {
            meterDist = Math.abs(d2 - d1);         // real depth measurement
        } else {
            meterDist = pixelToMeters(pixelDist);  // fallback
        }

        // Label text
        drawLabel(
            `${pixelDist.toFixed(1)} px  |  ${meterDist.toFixed(2)} m`,
            p2
        );
    }
}

function calcPixelDistance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// fallback (only if depth missing)
function pixelToMeters(pixelDistance) {
    const FOV = 60;
    const distToWall = 0.5;
    const width = video.videoWidth;

    const meterPerPixel =
        (2 * distToWall * Math.tan((FOV / 2) * Math.PI / 180)) / width;

    return pixelDistance * meterPerPixel;
}

// draw text
function drawLabel(text, pos) {
    ctx.fillStyle = "yellow";
    ctx.font = "20px Arial";
    ctx.fillText(text, pos.x + 10, pos.y - 10);
}
