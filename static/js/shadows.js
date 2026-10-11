// Directional-light shadow map covering a square area around a focus point.

import * as mat4 from "./mat4.js";

export function createShadowMap(gl, size = 2048) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
  // Hardware depth comparison + linear filtering gives smooth 2x2 PCF per tap.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`shadow framebuffer incomplete: ${status}`);

  return {
    texture,
    texelSize: 1 / size,

    // Light-space view-projection for a square of 2 * halfExtent around `focus`. The centre
    // is snapped to whole shadow-map texels so shadows don't shimmer as the player moves.
    matrixFor(lightDir, focus, halfExtent = 22) {
      const texel = (2 * halfExtent) / size;
      const reach = Math.max(80, halfExtent * 1.5); // depth range along the light
      const up = Math.abs(lightDir[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
      const view = mat4.lookAt(lightDir.map((v) => v * 100), [0, 0, 0], up);
      const c = mat4.transformPoint(view, focus);
      const cx = Math.round(c[0] / texel) * texel;
      const cy = Math.round(c[1] / texel) * texel;
      const depth = -c[2];
      const projection = mat4.ortho(cx - halfExtent, cx + halfExtent, cy - halfExtent, cy + halfExtent, depth - reach, depth + reach);
      return mat4.multiply(projection, view);
    },

    begin() {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, null); // never sample the map while rendering into it
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, size, size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.CULL_FACE);             // grass and terrain are single sheets
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(2, 4);
    },

    end() {
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.enable(gl.CULL_FACE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
  };
}
