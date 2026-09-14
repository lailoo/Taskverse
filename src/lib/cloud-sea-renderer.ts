import type { CloudSettings } from "./cloud-settings";

export type CloudFrame = {
  time: number;
  travel: [number, number];
  settings: CloudSettings;
  axisY: number;
  root: [number, number, number, number];
  railway: [number, number, number, number];
  train: [number, number, number, number];
};

const vertexSource = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Two small renderers share the same local texture, shader and scene clock. */
export function createCloudRenderer(canvas: HTMLCanvasElement, source: string, noise: HTMLImageElement, foreground: boolean) {
  const gl = canvas.getContext("webgl2", { alpha: foreground, premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error("WebGL2 unavailable");
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const texture = gl.createTexture();
  const dispose = () => {
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
  };
  try {
    if (!program || !texture) throw new Error("Cloud GPU allocation failed");
    for (const [type, text] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, source]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Cloud shader allocation failed");
      shaders.push(shader);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Cloud shader compilation failed");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Cloud shader linking failed");
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noise);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.uniform1i(gl.getUniformLocation(program, "iChannel0"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uForeground"), foreground ? 1 : 0);
    const resolution = gl.getUniformLocation(program, "iResolution");
    const time = gl.getUniformLocation(program, "iTime");
    const axis = gl.getUniformLocation(program, "uAxisY");
    const root = gl.getUniformLocation(program, "uRootBounds");
    const railway = gl.getUniformLocation(program, "uRailway");
    const train = gl.getUniformLocation(program, "uTrain");
    const size = gl.getUniformLocation(program, "uCanvasSize");
    const travel = gl.getUniformLocation(program, "uCloudTravel");
    const look = gl.getUniformLocation(program, "uCloudLook");
    return {
      resize(width: number, height: number, pixelBudget: number) {
        // The reference uses CSS-pixel resolution. Cap large screens to keep
        // the 14-layer shader from taking GPU time away from task interaction.
        const ratio = Math.min(1, Math.sqrt(pixelBudget / Math.max(1, width * height)));
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform3f(resolution, canvas.width, canvas.height, 1);
        gl.uniform2f(size, width, height);
      },
      draw(frame: CloudFrame) {
        gl.uniform1f(time, frame.time);
        gl.uniform2fv(travel, frame.travel);
        gl.uniform4f(look, frame.settings.density, frame.settings.brightness,
          frame.settings.motionBlur * frame.settings.nearSpeed, frame.settings.dynamicLight ? 1 : 0);
        gl.uniform1f(axis, frame.axisY);
        gl.uniform4fv(root, frame.root);
        gl.uniform4fv(railway, frame.railway);
        gl.uniform4fv(train, frame.train);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

let assets: Promise<{ source: string; noise: HTMLImageElement }> | undefined;
export function loadCloudAssets() {
  return assets ??= Promise.all([
    fetch("/assets/cloud-sea/clouds-controls.frag").then(response => {
      if (!response.ok) throw new Error("Cloud shader asset unavailable");
      return response.text();
    }),
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Cloud noise asset unavailable"));
      image.src = "/assets/cloud-sea/blue-noise.png";
    }),
  ]).then(([source, noise]) => ({ source, noise })).catch(error => {
    assets = undefined;
    throw error;
  });
}
