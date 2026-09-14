import type { DesertSettings } from "./desert-settings";

/** Analytic 3D city with a continuous lateral camera and layered sand parallax. */
export function createDesertRenderer(canvas: HTMLCanvasElement, source: string) {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false });
  if (!gl) throw new Error("WebGL2 unavailable");
  const program = gl.createProgram();
  const shaders: WebGLShader[] = [];
  const dispose = () => { shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program); };
  try {
    if (!program) throw new Error("Desert GPU allocation failed");
    for (const [type, text] of [[gl.VERTEX_SHADER, `#version 300 es
      void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2. - 1., 0., 1.); }`], [gl.FRAGMENT_SHADER, source]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Desert shader allocation failed");
      shaders.push(shader); gl.shaderSource(shader, text); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Desert shader compilation failed");
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Desert shader linking failed");
    gl.useProgram(program);
    const resolution = gl.getUniformLocation(program, "uResolution");
    const travel = gl.getUniformLocation(program, "uTravel");
    const journey = gl.getUniformLocation(program, "uJourney");
    const axis = gl.getUniformLocation(program, "uAxis");
    const look = gl.getUniformLocation(program, "uLook");
    return {
      resize(width: number, height: number) {
        const ratio = Math.min(1.25, Math.sqrt(900_000 / Math.max(1, width * height)));
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(resolution, canvas.width, canvas.height);
      },
      draw(windTravel: number, cityTravel: number, settings: DesertSettings, axisY: number) {
        gl.uniform1f(travel, windTravel);
        gl.uniform1f(journey, cityTravel);
        gl.uniform1f(axis, axisY);
        gl.uniform2f(look, settings.dust, settings.brightness);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}

let shader: Promise<string> | undefined;
export function loadDesertShader() {
  return shader ??= fetch("/assets/desert-gate/scene.frag").then(response => {
    if (!response.ok) throw new Error("Desert shader unavailable");
    return response.text();
  }).catch(error => { shader = undefined; throw error; });
}
