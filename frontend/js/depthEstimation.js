// =======================
// MediaPipe Depth Estimation
// =======================

// Load required imports from MediaPipe
import {
    FilesetResolver,
    DepthEstimator
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js";

let depthModel = null;
let depthRunning = false;
let latestDepthFrame = null;

// =======================
// Load Depth Model
// =======================
(async () => {
    try {
        console.log("Loading depth model...");

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        depthModel = await DepthEstimator.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/assets/depth_estimation/efficient_depth.tflite"
            },
            outputDepth: true
        });

        console.log("Depth model loaded successfully ✅");
    } catch (err) {
        console.error("Depth model loading failed ❌", err);
    }
})();

// =======================
// Start Depth Estimation
// =======================
export async function startDepthEstimator(videoElement) {
    if (!depthModel) {
        console.warn("⏳ Depth model not ready yet");
        return;
    }

    depthRunning = true;

    async function process() {
        if (!depthRunning) return;

        const result = depthModel.estimate(videoElement);

        if (result && result.depthImage) {
            latestDepthFrame = result.depthImage;
        }

        requestAnimationFrame(process);
    }

    process();
}

// =======================
// Get depth at a specific pixel (in meters)
// =======================
export function getDepthAtPixel(x, y, video = document.getElementById("videoFeed")) {
    if (!latestDepthFrame) return null;

    const depthW = latestDepthFrame.width;
    const depthH = latestDepthFrame.height;

    // Scale tap location to depth map resolution
    const dx = Math.floor((x / video.videoWidth) * depthW);
    const dy = Math.floor((y / video.videoHeight) * depthH);

    if (dx < 0 || dx >= depthW || dy < 0 || dy >= depthH) return null;

    const index = dy * depthW + dx;
    const depthMeters = latestDepthFrame.data[index];

    return depthMeters || null;
}
