// Live, turning 3D previews of the avatars for the start screen. Each avatar is
// rendered off-screen with the game's own renderer and copied into a 2D canvas.

import { drawAvatar } from "./avatars.js";
import { environmentAt } from "./daynight.js";
import * as mat4 from "./mat4.js";
import { setSkyUniforms } from "./skycolor.js";

const SIZE = 256;

export function createAvatarPreviews(gl, lit, meshes, canvases) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  const color = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, color);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, SIZE, SIZE);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, SIZE, SIZE);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  const image = new ImageData(SIZE, SIZE);
  const env = environmentAt(10);
  const projection = mat4.perspective(0.6, 1, 0.1, 20);
  // A pretend player per avatar, standing idle at the origin.
  const models = canvases.map(({ id, canvas }) => ({
    canvas,
    context: canvas.getContext("2d"),
    player: {
      x: 0, z: 0, y: 0, prevX: 0, prevZ: 0, floating: false,
      orientation: mat4.identity(), avatar: { id, heading: 0, speed: 0, phase: 0, time: Math.random() * 10 },
    },
  }));
  for (const { canvas } of models) canvas.width = canvas.height = SIZE;

  return {
    // Renders one frame of every preview; the models slowly turn.
    draw(dt) {
      const u = lit.uniforms;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, SIZE, SIZE);
      gl.useProgram(lit.program);
      const eye = [0, 1.25, 2.6];
      gl.uniformMatrix4fv(u.uViewProj, false, mat4.multiply(projection, mat4.lookAt(eye, [0, 0.45, 0], [0, 1, 0])));
      gl.uniform3fv(u.uLightDir, env.lightDir);
      gl.uniform3fv(u.uLightColor, env.lightColor);
      gl.uniform3fv(u.uAmbientSky, env.ambientSky);
      gl.uniform3fv(u.uAmbientGround, env.ambientGround);
      gl.uniform3fv(u.uCameraPos, eye);
      gl.uniform2f(u.uFogRange, 1000, 2000);
      gl.uniform1f(u.uShadowStrength, 0);
      gl.uniform1f(u.uTileSize, 0);
      gl.uniform1f(u.uFadeRadius, 0);
      setSkyUniforms(gl, u, env);

      for (const { player, context } of models) {
        player.avatar.time += dt;
        player.avatar.heading = 0.6 + Math.sin(player.avatar.time * 0.5) * 0.7;
        if (player.avatar.id === "ball") {
          player.orientation = mat4.multiply(mat4.rotationAxis([0, 1, 0], dt * 0.8), player.orientation);
        }
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        drawAvatar(gl, u, meshes, player);
        gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        // WebGL rows run bottom-up; canvas rows top-down.
        for (let row = 0; row < SIZE; row++) {
          image.data.set(pixels.subarray(row * SIZE * 4, (row + 1) * SIZE * 4), (SIZE - 1 - row) * SIZE * 4);
        }
        context.putImageData(image, 0, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
  };
}
