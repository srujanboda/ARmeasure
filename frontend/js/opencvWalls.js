// === FAST Corner Detection (Lightweight) ===
// Runs when OpenCV.js is ready

let wallProcessing = false;

function startWallDetection(video, canvas, ctx) {
    if (wallProcessing) return;
    wallProcessing = true;

    function process() {
        if (!wallProcessing) return;

        if (video.videoWidth === 0 || video.videoHeight === 0) {
            requestAnimationFrame(process);
            return;
        }

        const frame = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
        const gray = new cv.Mat();

        // Read frame into matrix
        cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

        // Detect corners using FAST
        const corners = new cv.KeyPointVector();
        const fast = new cv.FastFeatureDetector();

        fast.detect(gray, corners);

        // Draw corners on canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < corners.size(); i++) {
            const kp = corners.get(i);
            ctx.beginPath();
            ctx.arc(kp.pt.x, kp.pt.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = "cyan";
            ctx.fill();
        }

        frame.delete();
        gray.delete();
        fast.delete();
        corners.delete();

        requestAnimationFrame(process);
    }

    process();
}
