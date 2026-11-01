(function () {
  "use strict";

  const year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const canvas = document.getElementById("marketField");
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frameId = 0;
  let tick = 0;
  let columns = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.max(28, Math.floor(width / 38));
    columns = Array.from({ length: count }, (_, index) => {
      const base = index / Math.max(count - 1, 1);
      return {
        x: base * width,
        phase: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.65,
        amplitude: 18 + Math.random() * 54,
        tone: Math.random(),
      };
    });
  }

  function drawGrid() {
    context.strokeStyle = "rgba(220, 232, 224, 0.055)";
    context.lineWidth = 1;

    for (let x = 0; x < width; x += 74) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    for (let y = 0; y < height; y += 52) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  }

  function drawMarketPath() {
    context.lineWidth = 1.6;
    context.strokeStyle = "rgba(57, 208, 216, 0.5)";
    context.beginPath();

    columns.forEach((column, index) => {
      const wave = Math.sin(tick * column.speed + column.phase);
      const drift = Math.cos(tick * 0.35 + column.phase) * column.amplitude;
      const y = height * 0.46 + wave * column.amplitude + drift;

      if (index === 0) {
        context.moveTo(column.x, y);
      } else {
        context.lineTo(column.x, y);
      }
    });

    context.stroke();

    columns.forEach((column) => {
      const wave = Math.sin(tick * column.speed + column.phase);
      const y = height * 0.46 + wave * column.amplitude;
      const color = column.tone > 0.64 ? "240, 184, 77" : column.tone > 0.32 ? "103, 211, 142" : "57, 208, 216";
      context.fillStyle = `rgba(${color}, 0.62)`;
      context.fillRect(column.x - 1, y - 1, 2, 2);
    });
  }

  function drawBars() {
    const barWidth = Math.max(5, width / 160);
    const baseY = height * 0.82;
    const limit = Math.ceil(width / (barWidth * 3));

    for (let index = 0; index < limit; index += 1) {
      const x = index * barWidth * 3;
      const pulse = Math.abs(Math.sin(tick * 0.8 + index * 0.41));
      const barHeight = 16 + pulse * 96;
      const alpha = 0.1 + pulse * 0.16;
      context.fillStyle = index % 5 === 0 ? `rgba(240, 184, 77, ${alpha})` : `rgba(103, 211, 142, ${alpha})`;
      context.fillRect(x, baseY - barHeight, barWidth, barHeight);
    }
  }

  function render() {
    context.clearRect(0, 0, width, height);
    drawGrid();
    drawBars();
    drawMarketPath();

    tick += 0.008;
    if (!motionQuery.matches) {
      frameId = window.requestAnimationFrame(render);
    }
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();
  render();

  motionQuery.addEventListener("change", () => {
    window.cancelAnimationFrame(frameId);
    render();
  });
})();
