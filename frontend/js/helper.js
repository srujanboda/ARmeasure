// Shared helper functions used by all scripts

export function distance(p1, p2) {
    return Math.sqrt((p2.x - p1.x)**2 + (p2.y - p1.y)**2);
}

export function drawCircle(ctx, x, y, color="lime") {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}
