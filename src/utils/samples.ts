export interface SampleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  width: number;
  height: number;
  generate: (ctx: CanvasRenderingContext2D) => void;
  knownDistractions: {
    label: string;
    description: string;
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  }[];
}

export const SAMPLE_TEMPLATES: SampleTemplate[] = [
  {
    id: "beach_clutter",
    name: "Sunset Beach",
    description: "Remove the ugly red container from the peaceful beach sand",
    icon: "🏖️",
    width: 800,
    height: 500,
    knownDistractions: [
      {
        label: "Red Container",
        description: "Unwanted red container littering the sandy shore",
        box_2d: [640, 680, 800, 820], // mapped on 1000 scale: y: 320 to 400 (64% to 80%), x: 544 to 656 (68% to 82%)
      }
    ],
    generate: (ctx: CanvasRenderingContext2D) => {
      // Draw background sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 300);
      skyGrad.addColorStop(0, "#1e3c72");
      skyGrad.addColorStop(0.5, "#2a5298");
      skyGrad.addColorStop(0.8, "#f12711");
      skyGrad.addColorStop(1, "#f5af19");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, 800, 500);

      // Draw shiny sun
      ctx.beginPath();
      ctx.arc(400, 280, 45, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 244, 200, 0.95)";
      ctx.shadowBlur = 40;
      ctx.shadowColor = "rgba(255, 175, 25, 0.8)";
      ctx.fill();
      ctx.shadowBlur = 0; // reset shadow

      // Draw calm ocean
      const oceanGrad = ctx.createLinearGradient(0, 270, 0, 340);
      oceanGrad.addColorStop(0, "#19547b");
      oceanGrad.addColorStop(1, "#ffd89b");
      ctx.fillStyle = "rgba(10, 80, 130, 0.95)";
      ctx.fillRect(0, 260, 800, 70);

      // Waves reflections
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      for (let i = 0; i < 20; i++) {
        ctx.fillRect(300 + Math.random() * 200, 270 + Math.random() * 50, 40 + Math.random() * 60, 2);
      }

      // Draw beach sand
      const sandGrad = ctx.createLinearGradient(0, 320, 0, 500);
      sandGrad.addColorStop(0, "#eecd88");
      sandGrad.addColorStop(1, "#bfa369");
      ctx.fillStyle = sandGrad;
      ctx.beginPath();
      ctx.moveTo(0, 310);
      ctx.bezierCurveTo(200, 315, 600, 290, 800, 315);
      ctx.lineTo(800, 500);
      ctx.lineTo(0, 500);
      ctx.closePath();
      ctx.fill();

      // Draw beautiful Palm Tree Trunk
      ctx.fillStyle = "#5c4033";
      ctx.beginPath();
      ctx.moveTo(120, 500);
      ctx.quadraticCurveTo(130, 320, 150, 160);
      ctx.lineTo(165, 160);
      ctx.quadraticCurveTo(145, 320, 140, 500);
      ctx.closePath();
      ctx.fill();

      // Palm trunk texture lines
      ctx.strokeStyle = "#402d24";
      ctx.lineWidth = 3;
      for (let y = 180; y < 480; y += 30) {
        ctx.beginPath();
        ctx.moveTo(130 + (y - 300) * 0.05, y);
        ctx.lineTo(155 + (y - 300) * 0.05, y + 5);
        ctx.stroke();
      }

      // Palm Leaves (elegant green fans)
      ctx.fillStyle = "#2d5a27";
      const leafCount = 6;
      for (let i = 0; i < leafCount; i++) {
        const angle = (i * Math.PI * 2) / leafCount;
        ctx.save();
        ctx.translate(157, 160);
        ctx.rotate(angle);
        
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(60, -30, 130, 10);
        ctx.quadraticCurveTo(50, 20, 0, 0);
        ctx.closePath();
        ctx.fill();
        
        // Leaf ribs
        ctx.strokeStyle = "#1b3d16";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(60, -30, 130, 10);
        ctx.stroke();
        ctx.restore();
      }

      // Coconut fruit
      ctx.fillStyle = "#4a3525";
      ctx.beginPath();
      ctx.arc(150, 175, 10, 0, Math.PI * 2);
      ctx.arc(164, 172, 11, 0, Math.PI * 2);
      ctx.fill();

      // Draw the Distraction: An ugly red plastic box (the target to erase)
      ctx.save();
      // Bounding box: ymin=320, xmin=544 (x width=115, height=80 => maps to [640,680] to [800, 820])
      ctx.fillStyle = "#d32f2f"; // Dark Red
      ctx.strokeStyle = "#7f0000";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(550, 330, 100, 70, 8);
      ctx.fill();
      ctx.stroke();

      // Clutter lid tag
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(570, 345, 60, 10);

      // Warning hazard strip on distraction
      ctx.fillStyle = "#f57c00";
      ctx.beginPath();
      ctx.moveTo(560, 385);
      ctx.lineTo(580, 365);
      ctx.lineTo(595, 365);
      ctx.lineTo(575, 385);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(610, 385);
      ctx.lineTo(630, 365);
      ctx.lineTo(645, 365);
      ctx.lineTo(625, 385);
      ctx.closePath();
      ctx.fill();

      // Distraction cast shadow on sand
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.beginPath();
      ctx.ellipse(600, 405, 50, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    },
  },
  {
    id: "wall_socket",
    name: "Minimalist Wall",
    description: "Heal the dark power socket with custom smudge or healing settings",
    icon: "🔌",
    width: 800,
    height: 500,
    knownDistractions: [
      {
        label: "Power Socket",
        description: "Ugly gray twin electrical power outlet plate on the clean wall",
        box_2d: [300, 375, 520, 525], // maps to x: 300 to 420 (37.5% - 52.5%), y: 150 to 260 (30% - 52%)
      }
    ],
    generate: (ctx: CanvasRenderingContext2D) => {
      // Plain Minimalist Wall canvas
      ctx.fillStyle = "#eaeae1"; // Stylish light warm-grey / plaster wall
      ctx.fillRect(0, 0, 800, 500);

      // Subtle wall plaster texture
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      for (let i = 0; i < 2000; i++) {
        const x = Math.random() * 800;
        const y = Math.random() * 500;
        ctx.fillRect(x, y, 1.5, 1.5);
      }

      // Wooden baseline board at the bottom
      const woodGrad = ctx.createLinearGradient(0, 440, 0, 500);
      woodGrad.addColorStop(0, "#a05a2c");
      woodGrad.addColorStop(1, "#653b1b");
      ctx.fillStyle = woodGrad;
      ctx.fillRect(0, 440, 800, 60);

      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, 440, 800, 3); // Baseboard highlight rim

      // Draw a sleek tall glass vase with flower stem
      ctx.save();
      // Drop shadow for vase
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
      ctx.shadowOffsetX = 10;
      ctx.shadowOffsetY = 10;

      // Flower Stem
      ctx.strokeStyle = "#4e6a4b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(150, 440);
      ctx.bezierCurveTo(140, 310, 200, 200, 160, 100);
      ctx.stroke();

      // Vase
      ctx.fillStyle = "rgba(200, 230, 240, 0.35)"; // translucent glass
      ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(125, 440);
      ctx.lineTo(135, 260);
      ctx.lineTo(165, 260);
      ctx.lineTo(175, 440);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Water level in vase
      ctx.fillStyle = "rgba(100, 180, 210, 0.25)";
      ctx.beginPath();
      ctx.moveTo(131, 330);
      ctx.lineTo(134, 270);
      ctx.lineTo(166, 270);
      ctx.lineTo(169, 330);
      ctx.closePath();
      ctx.fill();

      // Red rosebud flower at top
      ctx.fillStyle = "#c53030";
      ctx.beginPath();
      ctx.ellipse(160, 95, 12, 18, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e53e3e";
      ctx.beginPath();
      ctx.ellipse(156, 92, 8, 12, -0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Draw the Distraction: Power Outlet plate on the center right (x: 300 to 420, y: 150 to 260)
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      ctx.shadowOffsetX = 2;

      // Beige outlet outline
      ctx.fillStyle = "#cbc4bc";
      ctx.strokeStyle = "#b0a79d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(310, 160, 90, 90, 10);
      ctx.fill();
      ctx.stroke();

      ctx.shadowColor = "transparent"; // reset
      ctx.shadowBlur = 0;

      // Draw two gray socket plugs inside
      ctx.fillStyle = "#8a8175";
      ctx.lineWidth = 1;

      // Socket Top
      ctx.beginPath();
      ctx.arc(355, 188, 16, 0, Math.PI * 2);
      ctx.fill();
      // Socket Top holes
      ctx.fillStyle = "#4a443c";
      ctx.fillRect(348, 184, 4, 8);
      ctx.fillRect(358, 184, 4, 8);
      ctx.beginPath();
      ctx.arc(355, 196, 3, 0, Math.PI*2); // ground hole
      ctx.fill();

      // Socket Bottom
      ctx.fillStyle = "#8a8175";
      ctx.beginPath();
      ctx.arc(355, 222, 16, 0, Math.PI * 2);
      ctx.fill();
      // Socket Bottom holes
      ctx.fillStyle = "#4a443c";
      ctx.fillRect(348, 218, 4, 8);
      ctx.fillRect(358, 218, 4, 8);
      ctx.beginPath();
      ctx.arc(355, 230, 3, 0, Math.PI*2); // ground hole
      ctx.fill();

      ctx.restore();
    },
  },
  {
    id: "skin_blemish",
    name: "Skin Touchup",
    description: "Remove the moles and blemishes to achieve perfectly smooth studio skin",
    icon: "🧖",
    width: 600,
    height: 600,
    knownDistractions: [
      {
        label: "Blemish Dot",
        description: "A dark blemish mole on the cheeks",
        box_2d: [300, 310, 350, 360], // x: 186 to 216, y: 180 to 210 -> relative bounds
      },
      {
        label: "Red Acne",
        description: "Small red mark on the smooth skin",
        box_2d: [530, 460, 580, 510], // mapped on 1000 scale
      }
    ],
    generate: (ctx: CanvasRenderingContext2D) => {
      // Glow peach skin gradient
      const gradient = ctx.createRadialGradient(300, 300, 50, 300, 300, 400);
      gradient.addColorStop(0, "#ffeedb");   // Pearl light glow
      gradient.addColorStop(0.5, "#ffdcae"); // Mid rosy-peach skin
      gradient.addColorStop(1, "#e6b080");   // Soft amber studio shadow
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 600, 600);

      // Aesthetic soft lighting blush circles
      ctx.fillStyle = "rgba(229, 62, 62, 0.08)";
      ctx.beginPath();
      ctx.arc(420, 300, 90, 0, Math.PI * 2);
      ctx.fill();

      // Let's draw a professional makeup grid line (faint studio beauty guide overlay in white)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(300, 300, 150, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(300, 50);
      ctx.lineTo(300, 550);
      ctx.moveTo(50, 300);
      ctx.lineTo(550, 300);
      ctx.stroke();

      // Labels to make it look like a macro face photo analysis
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.font = "italic 11px monospace";
      ctx.fillText("FACIAL SKIN ANALYSIS [ZOOM-MACRO]", 30, 40);
      ctx.fillText("BEAUTY GLOW TONE / ISO-AUTO", 30, 560);

      // Distraction 1: Dark spot mole (x: 186 to 216, y: 180 to 210) => Center around [200, 195]
      ctx.save();
      const dotGrad = ctx.createRadialGradient(200, 195, 1, 203, 197, 8);
      dotGrad.addColorStop(0, "#4a3325");
      dotGrad.addColorStop(0.6, "#5a3a25");
      dotGrad.addColorStop(1, "transparent");
      ctx.fillStyle = dotGrad;
      ctx.beginPath();
      ctx.arc(200, 195, 12, 0, Math.PI * 2);
      ctx.fill();

      // Distraction 2: Red skin blemish (x: 276 to 306, y: 318 to 348) => Center around [290, 330]
      const redGrad = ctx.createRadialGradient(290, 330, 2, 292, 332, 12);
      redGrad.addColorStop(0, "rgba(235, 100, 100, 0.9)");
      redGrad.addColorStop(0.6, "rgba(229, 62, 62, 0.35)");
      redGrad.addColorStop(1, "transparent");
      ctx.fillStyle = redGrad;
      ctx.beginPath();
      ctx.arc(290, 330, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
];
