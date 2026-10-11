import { AVATAR_IDS, createAvatarMeshes, drawAvatar, updateAvatar } from "./avatars.js";
import { createChickenMeshes, drawChicken, keepOnLand, spawnChickens, updateChicken } from "./chicken.js";
import { clampToBounds, resolveCollisions } from "./collision.js";
import { DAY_SECONDS, environmentAt, formatClock } from "./daynight.js";
import { createDolphinMeshes, drawDolphin, spawnDolphins, updateDolphin } from "./dolphins.js";
import { buildBuildings } from "./buildings/models.js";
import { createEditor } from "./editor.js";
import { buildGlb } from "./glb.js";
import { createDepthProgram, createLitProgram, createMesh, createTexture, PAVING_UNITS } from "./gl.js";
import { onLanguageChange, t } from "./i18n.js";
import { createInput } from "./input.js";
import { worldLayers } from "./layers.js";
import { createLanguageSwitcher } from "./langswitch.js";
import * as mat4 from "./mat4.js";
import { createPavingDetail, DETAIL_METRES } from "./pavingdetail.js";
import { paintPaving, pavingResolution } from "./pavingpaint.js";
import { chooseAvatar, createPlayer, movePlayer, rollPlayer, settlePlayer } from "./player.js";
import { createAvatarPreviews } from "./preview.js";
import { createRandom } from "./random.js";
import { buildScenery } from "./scenery.js";
import { createShadowMap } from "./shadows.js";
import { createSky } from "./sky.js";
import { setSkyUniforms } from "./skycolor.js";
import { buildTerrainGeometry } from "./terrain.js";
import { createTouchControls, isTouchDevice } from "./touch.js";
import { createWater } from "./water.js";
import { SEA_LEVEL } from "./waves.js";
import { CLIMATES } from "./world/climates.js";
import { optionsFromQuery, optionsToQuery, SIZES } from "./world/options.js";
import { generateWorld, worldFromJSON, worldToJSON } from "./world/world.js";

const KEY_TURN_SPEED = 2;      // radians per second
const MOUSE_SENSITIVITY = 0.0025;
const PITCH_MIN = -0.9, PITCH_MAX = 1.3; // below 0 the camera stays low and tilts the view up
const CAMERA_DISTANCE_MIN = 2, CAMERA_DISTANCE_MAX = 16;
const OVERVIEW_PITCH_MIN = 0.12, OVERVIEW_PITCH_MAX = 1.5;
const OVERVIEW_PAN_SPEED = 0.6; // WASD in the overview: camera distances per second
const ZOOM_STEP = 1.15;       // distance multiplier per wheel notch
const START_HOUR = 10;
const TIME_WARP = 40;         // clock speed-up while T is held
const FADE_RADIUS = 1.3;      // width of the see-through tunnel from the camera to the player
const SHADOW_EXTENT = 22;     // half-width of the shadowed area around the player
const FAR_PLANE = 25000;      // reaches the far edge of the sea, so it meets the horizon
const NOBODY = { x: -1e4, z: -1e4, floating: false }; // what chickens and dolphins react to in the overview
const SAIL_SPEED = 0.7;       // windmill sails, radians per second

const canvas = document.getElementById("game");
const hud = document.getElementById("hud");
const clockLabel = document.getElementById("clock");
const startScreen = document.getElementById("start");
const panel = document.getElementById("editor");
const showPanelButton = document.getElementById("show-panel");
const backButton = document.getElementById("back-button");

createLanguageSwitcher(document.getElementById("lang"));
applyStaticText();
onLanguageChange(applyStaticText);

async function start() {
  const gl = canvas.getContext("webgl2", { antialias: true });
  if (!gl) throw new Error("WebGL2 is not supported in this browser");

  const params = new URLSearchParams(location.search);
  const startHour = Number.parseFloat(params.get("time") ?? "");

  const lit = createLitProgram(gl);
  const depth = createDepthProgram(gl);
  const sky = createSky(gl);
  const shadowMap = createShadowMap(gl, isTouchDevice() ? 1024 : 2048); // lighter on phones
  const avatarMeshes = createAvatarMeshes(gl);
  const chickenMeshes = createChickenMeshes(gl);
  const dolphinMeshes = createDolphinMeshes(gl);
  const pavingDetail = createTexture(gl, createPavingDetail(), { repeat: true });

  // mode: "overview" (the editor's orbiting camera), "choosing" (avatar dialog) or "explore" (on foot)
  const app = {
    mode: "overview",
    panelHidden: false,
    world: null,
    scene: null,
    player: createPlayer(0, 0),
    orbit: { x: 0, z: 0, yaw: 0.6, pitch: 0.75, distance: 100 },
    camera: { yaw: 0, pitch: 0.4, distance: 7 },
    settings: { fadeRadius: FADE_RADIUS, grid: true },
    clock: { hour: Number.isFinite(startHour) ? ((startHour % 24) + 24) % 24 : START_HOUR, elapsed: 0 },
  };
  const input = createInput(canvas, { capturesMouse: () => app.mode === "explore" });

  // Everything built from one world; replaced as a whole when a new world loads.
  function buildScene(world) {
    const field = world.field;
    const climate = CLIMATES[world.options.climate];
    const random = createRandom(world.options.seed);
    const scenery = buildScenery(world.props, field, climate, random);
    const buildings = buildBuildings(world.settlement, field, world.options.climate, random);
    const obstacles = [...scenery.obstacles, ...buildings.obstacles];
    const centre = { x: field.size / 2, z: field.size / 2 };
    const islandRadius = SIZES[world.options.size].islandRadius;
    const chickens = spawnChickens(Math.min(Math.round(16 * (islandRadius / 42) ** 2), 40), random, field, centre, obstacles);
    const dolphins = spawnDolphins(random, field);
    const meshes = [createMesh(gl, buildTerrainGeometry(field, climate)), createMesh(gl, scenery.geometry)];
    const buildingsMesh = buildings.geometry.indices.length ? createMesh(gl, buildings.geometry) : null;
    const sailsMesh = buildings.mills.length ? createMesh(gl, buildings.sails) : null;
    meshes.push(...[buildingsMesh, sailsMesh].filter(Boolean));
    const water = createWater(gl, field);
    const paving = createPavingTextures(world, climate, random);
    return {
      field, random, chickens, dolphins, water, paving, obstacles,
      terrainMesh: meshes[0],
      sceneryMesh: meshes[1],
      buildingsMesh, sailsMesh,
      mills: buildings.mills,
      bodies: [app.player, ...chickens, ...dolphins],
      dispose() {
        for (const mesh of meshes) mesh.dispose();
        water.dispose();
        paving?.dispose();
      },
    };
  }

  // The settlement's paving painted into textures the terrain shader lays over the ground.
  function createPavingTextures(world, climate, random) {
    const { settlement, field } = world;
    if (!settlement.roads.length && !settlement.squares.length && !settlement.fields?.length) return null;
    const budget = Math.min(isTouchDevice() ? 1536 : 3072, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const painted = paintPaving(settlement, climate, field.size, pavingResolution(field.size, budget), random);
    const color = createTexture(gl, painted.color, { premultiply: true });
    const kinds = createTexture(gl, painted.kinds);
    painted.color.width = painted.kinds.width = 0; // free the canvases' memory
    // Close-up detail runs along the street grid.
    const cos = Math.cos(settlement.angle) / DETAIL_METRES, sin = Math.sin(settlement.angle) / DETAIL_METRES;
    return {
      color, kinds,
      rotation: [cos, -sin, sin, cos],
      dispose() {
        gl.deleteTexture(color);
        gl.deleteTexture(kinds);
      },
    };
  }

  function loadWorld(world) {
    app.scene?.dispose();
    app.world = world;
    app.scene = buildScene(world);
    const size = world.field.size;
    const [x, z] = world.settlement.centre ?? [size / 2, size / 2];
    Object.assign(app.orbit, { x, z, distance: size * 0.85 });
    setMode("overview");
    let land = 0;
    for (const h of world.terrain.heights) if (h > SEA_LEVEL) land++;
    app.landShare = Math.round((land / world.terrain.heights.length) * 100);
    showStats();
  }

  function showStats() {
    if (!app.world) return;
    let roads = 0;
    for (const { points } of app.world.settlement.roads) {
      for (let i = 1; i < points.length; i++) roads += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    }
    editor.setStats(t("stats", {
      roads: Math.round(roads),
      trees: app.world.props.trees.length,
      buildings: app.world.settlement.buildings.length,
      rocks: app.world.props.rocks.length,
      land: app.landShare,
      width: app.world.field.size,
    }));
  }

  async function generate(options) {
    editor.setBusy(true);
    editor.showMessage(null);
    hud.textContent = t("generating");
    await new Promise((resolve) => setTimeout(resolve, 30)); // let the message paint first
    try {
      loadWorld(generateWorld(options));
      editor.write(app.world.options);
      history.replaceState(null, "", `?${optionsToQuery(app.world.options)}`);
    } finally {
      editor.setBusy(false);
      showHelp();
    }
  }

  const editor = createEditor(panel, {
    generate: (options) => generate(options).catch(showError),
    explore: () => setMode("choosing"),
    exportWorld() {
      download(new Blob([JSON.stringify(worldToJSON(app.world))], { type: "application/json" }), `${fileName(app.world)}.json`);
    },
    async exportGlb() {
      download(new Blob([await worldGlb(app.world)], { type: "model/gltf-binary" }), `${fileName(app.world)}.glb`);
    },
    async importWorld(file) {
      editor.showMessage(null);
      try {
        const world = worldFromJSON(JSON.parse(await file.text()));
        loadWorld(world);
        editor.write(world.options);
      } catch (err) {
        editor.showMessage(t("importFailed", { file: file.name, message: err.message }));
      }
    },
    showGrid(on) {
      app.settings.grid = on;
    },
  });

  function setMode(mode) {
    app.mode = mode;
    if (mode !== "explore") document.exitPointerLock?.();
    startScreen.hidden = mode !== "choosing";
    panel.hidden = mode === "explore" || app.panelHidden;
    showPanelButton.hidden = mode === "explore" || !app.panelHidden;
    backButton.hidden = mode !== "explore";
    document.body.classList.toggle("panel-open", !panel.hidden);
    if (mode === "choosing") {
      (startScreen.querySelector(`[data-id="${lastAvatar()}"]`) ?? startScreen.querySelector(".card")).focus();
    }
    showHelp();
  }

  function setPanelHidden(hidden) {
    app.panelHidden = hidden;
    setMode(app.mode);
  }
  document.getElementById("hide-panel").addEventListener("click", () => setPanelHidden(true));
  showPanelButton.addEventListener("click", () => setPanelHidden(false));
  backButton.addEventListener("click", () => leaveExplore());

  function enterExplore(avatarId) {
    const { field, obstacles } = app.scene;
    const player = app.player;
    chooseAvatar(player, avatarId);
    const spot = findLandSpot(field, obstacles, app.orbit.x, app.orbit.z, player.radius);
    Object.assign(player, { x: spot.x, z: spot.z, prevX: spot.x, prevZ: spot.z });
    Object.assign(app.camera, { yaw: app.orbit.yaw, pitch: 0.4, distance: 7 });
    setMode("explore");
    canvas.focus();
  }

  function leaveExplore() {
    Object.assign(app.orbit, { x: app.player.x, z: app.player.z, yaw: app.camera.yaw });
    app.orbit.distance = Math.min(app.orbit.distance, app.scene.field.size * 0.5);
    setMode("overview");
  }

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  function update(dt) {
    const { scene, clock } = app;
    const mouse = input.takeLookDelta();
    const turn = (input.isDown("ArrowLeft") ? 1 : 0) - (input.isDown("ArrowRight") ? 1 : 0);
    const tilt = (input.isDown("ArrowDown") ? 1 : 0) - (input.isDown("ArrowUp") ? 1 : 0);
    const zoom = input.takeZoom(ZOOM_STEP);

    const warp = input.isDown("KeyT") ? TIME_WARP : 1;
    clock.hour = (clock.hour + (dt * warp * 24) / DAY_SECONDS) % 24;
    clock.elapsed += dt;

    const player = app.player;
    if (app.mode === "explore") {
      const camera = app.camera;
      camera.yaw += turn * KEY_TURN_SPEED * dt - mouse.x * MOUSE_SENSITIVITY;
      camera.pitch += tilt * KEY_TURN_SPEED * dt + mouse.y * MOUSE_SENSITIVITY;
      camera.pitch = Math.min(Math.max(camera.pitch, PITCH_MIN), PITCH_MAX);
      camera.distance = Math.min(Math.max(camera.distance * zoom, CAMERA_DISTANCE_MIN), CAMERA_DISTANCE_MAX);
      movePlayer(player, input.moveVector(), camera.yaw, dt);
      if (input.wasPressed("KeyM")) leaveExplore();
    } else {
      const orbit = app.orbit;
      const size = scene.field.size;
      // Dragging grabs the island: drag right and it turns right.
      orbit.yaw += turn * KEY_TURN_SPEED * dt + mouse.x * MOUSE_SENSITIVITY * 1.5;
      orbit.pitch += tilt * KEY_TURN_SPEED * 0.5 * dt + mouse.y * MOUSE_SENSITIVITY * 1.5;
      orbit.pitch = Math.min(Math.max(orbit.pitch, OVERVIEW_PITCH_MIN), OVERVIEW_PITCH_MAX);
      orbit.distance = Math.min(Math.max(orbit.distance * zoom, 8), size * 1.6);
      if (app.mode === "overview") {
        // WASD slides the point the camera circles around, faster when zoomed out.
        const move = input.moveVector();
        const speed = OVERVIEW_PAN_SPEED * orbit.distance;
        const forward = [Math.sin(orbit.yaw), Math.cos(orbit.yaw)];
        orbit.x += (forward[0] * move.ahead - forward[1] * move.strafe) * speed * dt;
        orbit.z += (forward[1] * move.ahead + forward[0] * move.strafe) * speed * dt;
        orbit.x = Math.min(Math.max(orbit.x, 0), size);
        orbit.z = Math.min(Math.max(orbit.z, 0), size);
      }
      input.wasPressed("KeyM"); // only means something while exploring
    }

    const actor = app.mode === "explore" ? player : NOBODY;
    for (const chicken of scene.chickens) updateChicken(chicken, dt, actor, scene.field, scene.random);
    for (const dolphin of scene.dolphins) updateDolphin(dolphin, dt, actor, scene.field, scene.random);
    const bodies = app.mode === "explore" ? scene.bodies : scene.bodies.slice(1);
    resolveCollisions(bodies, scene.obstacles);
    for (const body of bodies) clampToBounds(body, scene.field.size);
    for (const chicken of scene.chickens) keepOnLand(chicken, scene.field); // pushed toward the sea: stay put
    if (app.mode === "explore") {
      settlePlayer(player, scene.field, clock.elapsed);
      if (player.avatar.id === "ball") rollPlayer(player);
      updateAvatar(player, dt);
    }
  }

  // Draws every mesh with whichever program is active (lit or depth-only).
  // `fade` makes whatever stands between the camera and the player see-through
  // (terrain and the player's own avatar are never faded). The paving is painted
  // onto the terrain (only in the lit pass; the depth program ignores it).
  function drawScene(u, { fade = 0, grid = false } = {}) {
    const { scene } = app;
    gl.uniform1f(u.uFadeRadius, 0);
    gl.uniform3f(u.uTint, 1, 1, 1);
    gl.uniformMatrix4fv(u.uModel, false, mat4.identity());
    gl.uniform1f(u.uTileSize, grid ? scene.field.tileSize : 0);
    gl.uniform1f(u.uPavingSize, scene.paving ? scene.field.size : 0);
    scene.terrainMesh.draw();

    gl.uniform1f(u.uTileSize, 0);
    gl.uniform1f(u.uPavingSize, 0);
    if (app.mode === "explore") drawAvatar(gl, u, avatarMeshes, app.player);

    gl.uniform1f(u.uFadeRadius, fade);
    gl.uniform3f(u.uTint, 1, 1, 1);
    gl.uniformMatrix4fv(u.uModel, false, mat4.identity()); // the avatar left its own transform set
    scene.sceneryMesh.draw();
    scene.buildingsMesh?.draw();
    for (const mill of scene.mills) {
      const turn = mill.phase + app.clock.elapsed * SAIL_SPEED;
      const model = [mat4.rotationAxis([0, 1, 0], mill.yaw), mat4.rotationAxis([0, 0, 1], turn)]
        .reduce((acc, m) => mat4.multiply(acc, m), mat4.translation(mill.x, mill.y, mill.z));
      gl.uniformMatrix4fv(u.uModel, false, model);
      scene.sailsMesh.draw();
    }
    gl.uniformMatrix4fv(u.uModel, false, mat4.identity());

    for (const chicken of scene.chickens) drawChicken(gl, u, chickenMeshes, chicken, scene.field);
    for (const dolphin of scene.dolphins) drawDolphin(gl, u, dolphinMeshes, dolphin, app.clock.elapsed);
  }

  // Camera for the current mode: eye, look-at point, shadow focus and ranges.
  function cameraView() {
    const { field } = app.scene;
    const size = field.size;
    if (app.mode === "explore") {
      const { player, camera } = app;
      const target = [player.x, player.y + 1.3, player.z];
      const eye = orbitEye(target, camera.yaw, Math.max(camera.pitch, 0), camera.distance);
      eye[1] = Math.max(eye[1], field.heightAt(eye[0], eye[2]) + 0.4, SEA_LEVEL + 0.5);
      return {
        eye,
        look: lookTarget(eye, target, camera.pitch),
        shadowFocus: [player.x, player.y + 0.5, player.z],
        shadowExtent: SHADOW_EXTENT,
        fogRange: [size * 0.35, size * 1.1],
        near: 0.1,
      };
    }
    const { orbit } = app;
    const target = [orbit.x, Math.max(field.heightAt(orbit.x, orbit.z), SEA_LEVEL), orbit.z];
    const eye = orbitEye(target, orbit.yaw, orbit.pitch, orbit.distance);
    eye[1] = Math.max(eye[1], field.heightAt(eye[0], eye[2]) + 1, SEA_LEVEL + 1);
    return {
      eye,
      look: target,
      shadowFocus: target,
      shadowExtent: Math.min(Math.max(orbit.distance * 0.9, SHADOW_EXTENT), size * 0.75),
      fogRange: [orbit.distance + size * 0.25, orbit.distance + size * 1.4],
      near: 1, // the camera stays well away from things here; a far near plane keeps depth precise
    };
  }

  function render() {
    const env = environmentAt(app.clock.hour);
    const view = cameraView();

    // Shadow pass: depth from the sun (or moon) around the focus.
    const lightViewProj = shadowMap.matrixFor(env.lightDir, view.shadowFocus, view.shadowExtent);
    if (env.shadowStrength > 0) {
      shadowMap.begin();
      gl.useProgram(depth.program);
      gl.uniformMatrix4fv(depth.uniforms.uViewProj, false, lightViewProj);
      drawScene(depth.uniforms);
      shadowMap.end();
    }

    resize(gl);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const projection = mat4.perspective(Math.PI / 3, canvas.width / canvas.height, view.near, FAR_PLANE);
    const viewProj = mat4.multiply(projection, mat4.lookAt(view.eye, view.look, [0, 1, 0]));

    sky.draw(viewProj, env, app.clock.elapsed);

    const u = lit.uniforms;
    gl.useProgram(lit.program);
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl.uniformMatrix4fv(u.uLightViewProj, false, lightViewProj);
    gl.uniform3fv(u.uLightDir, env.lightDir);
    gl.uniform3fv(u.uLightColor, env.lightColor);
    gl.uniform3fv(u.uAmbientSky, env.ambientSky);
    gl.uniform3fv(u.uAmbientGround, env.ambientGround);
    gl.uniform3fv(u.uCameraPos, view.eye);
    gl.uniform2fv(u.uFogRange, view.fogRange);
    gl.uniform1f(u.uShadowStrength, env.shadowStrength);
    gl.uniform1f(u.uShadowTexel, shadowMap.texelSize);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowMap.texture);
    const { paving } = app.scene;
    if (paving) {
      for (const [name, texture] of [["uPaving", paving.color], ["uPavingKind", paving.kinds], ["uPavingDetail", pavingDetail]]) {
        gl.activeTexture(gl.TEXTURE0 + PAVING_UNITS[name]);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      }
      gl.uniformMatrix2fv(u.uDetailRotation, false, paving.rotation);
      gl.activeTexture(gl.TEXTURE0);
    }
    setSkyUniforms(gl, u, env);
    const exploring = app.mode === "explore";
    gl.uniform3fv(u.uFadeFrom, view.eye);
    gl.uniform3f(u.uFadeTo, app.player.x, app.player.y + 0.6, app.player.z);
    drawScene(u, { fade: exploring ? app.settings.fadeRadius : 0, grid: app.settings.grid });
    app.scene.water.draw(viewProj, env, view.eye, app.clock.elapsed, view.fogRange);

    if (app.mode === "choosing") previews.draw(frameDt);

    const clockText = `${env.day > 0.5 ? "☀" : "☾"} ${formatClock(app.clock.hour)}`;
    if (clockLabel.textContent !== clockText) clockLabel.textContent = clockText;
  }

  let touch = { enabled: false };
  function showHelp() {
    if (!app.world) return;
    const [desktop, phone] = app.mode === "explore" ? ["helpExplore", "helpTouch"] : ["helpOverview", "helpTouchOverview"];
    hud.textContent = t(touch.enabled ? phone : desktop, { seed: app.world.options.seed });
  }
  touch = createTouchControls(canvas, input, {
    stick: document.getElementById("stick"),
    knob: document.querySelector("#stick .knob"),
    time: document.getElementById("time-button"),
    stickEnabled: () => app.mode === "explore",
  }, () => showHelp()); // switches the help text when the first touch arrives
  onLanguageChange(() => {
    showHelp();
    showStats();
  });

  // Avatar dialog: pick one to start walking, or cancel back to the overview.
  const previews = createStartScreen(gl, lit, avatarMeshes, (id) => enterExplore(id), () => setMode("overview"));

  const initial = optionsFromQuery(params);
  editor.write(initial);
  await generate(initial);

  let frameDt = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frameDt = dt;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Hook for automated checks.
  window.__game = {
    app,
    generate,
    choose: (id) => {
      setMode("choosing");
      startScreen.querySelector(`[data-id="${id}"]`).click();
    },
    exportJSON: () => worldToJSON(app.world),
    exportGlb: () => worldGlb(app.world),
  };
}

// The world as a GLB file (ArrayBuffer), with the paving painted into the roads layer's texture.
async function worldGlb(world) {
  let pavingImage = null;
  if (world.settlement.roads.length || world.settlement.squares.length || world.settlement.fields?.length) {
    const climate = CLIMATES[world.options.climate];
    const ppm = pavingResolution(world.field.size, 4096);
    const painted = paintPaving(world.settlement, climate, world.field.size, ppm, createRandom(world.options.seed));
    const png = painted.color.convertToBlob ? await painted.color.convertToBlob({ type: "image/png" })
      : await new Promise((resolve) => painted.color.toBlob(resolve, "image/png"));
    pavingImage = new Uint8Array(await png.arrayBuffer());
  }
  return buildGlb(worldLayers(world, { pavingImage }));
}

function fileName({ options }) {
  return `citymaker-${options.climate}-${options.settlement}-${options.size}-${options.seed}`;
}

function download(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Camera position orbiting `target` at `distance`, behind it along `yaw`, raised by `pitch`.
function orbitEye(target, yaw, pitch, distance) {
  const flat = Math.cos(pitch) * distance;
  return [
    target[0] - Math.sin(yaw) * flat,
    target[1] + Math.sin(pitch) * distance,
    target[2] - Math.cos(yaw) * flat,
  ];
}

// Point the camera at the player, tilted further up by however far pitch is below zero
// (so you can look up at the sky).
function lookTarget(eye, target, pitch) {
  if (pitch >= 0) return target;
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
  const across = Math.hypot(dx, dz);
  const elevation = Math.min(Math.atan2(dy, across) - pitch, 1.4);
  return [eye[0] + dx, eye[1] + Math.tan(elevation) * across, eye[2] + dz];
}

// The nearest dry, fairly level spot to (x, z) with room for a body of `radius`,
// searched in widening rings. Falls back to the map centre.
function findLandSpot(field, obstacles, x, z, radius) {
  const free = (px, pz) => field.heightAt(px, pz) > SEA_LEVEL + 0.6 && field.slopeAt(px, pz) < 0.8 &&
    obstacles.every((o) => Math.hypot(px - o.x, pz - o.z) >= o.radius + radius + 0.3);
  for (let ring = 0; ring < field.size; ring += 1) {
    const steps = Math.max(1, Math.round(ring * 2));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
      if (px > 1 && pz > 1 && px < field.size - 1 && pz < field.size - 1 && free(px, pz)) return { x: px, z: pz };
    }
  }
  return { x: field.size / 2, z: field.size / 2 };
}

// Text that is set once per language: everything marked with data-t / data-t-title.
function applyStaticText() {
  document.documentElement.lang = document.getElementById("lang").querySelector("[aria-pressed=true]")?.lang ?? "en";
  for (const el of document.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll("[data-t-title]")) {
    el.title = t(el.dataset.tTitle);
    if (el.tagName === "BUTTON") el.setAttribute("aria-label", el.title);
  }
  if (!window.__game) hud.textContent = t("loading");
}

const AVATAR_KEY = "citymaker.avatar";

function lastAvatar() {
  try {
    return localStorage.getItem(AVATAR_KEY) ?? "ball";
  } catch {
    return "ball"; // no storage
  }
}

// Builds the avatar cards with live previews; `onChoose(id)` starts exploring.
function createStartScreen(gl, lit, meshes, onChoose, onCancel) {
  const cards = startScreen.querySelector(".cards");
  const canvases = AVATAR_IDS.map((id, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.dataset.id = id;
    card.innerHTML = `<canvas></canvas><span class="name" data-t="avatar_${id}"></span><span class="key">${i + 1}</span>`;
    card.addEventListener("click", () => {
      try {
        localStorage.setItem(AVATAR_KEY, id);
      } catch {
        // Not remembered; fine.
      }
      onChoose(id);
    });
    cards.append(card);
    return { id, canvas: card.querySelector("canvas") };
  });
  startScreen.querySelector(".cancel").addEventListener("click", onCancel);
  window.addEventListener("keydown", (e) => {
    if (startScreen.hidden) return;
    if (e.key === "Escape") onCancel();
    const index = Number(e.key) - 1;
    if (AVATAR_IDS[index]) cards.children[index].click();
  });
  applyStaticText();
  return createAvatarPreviews(gl, lit, meshes, canvases);
}

function showError(err) {
  hud.textContent = t("error", { message: err.message });
  console.error(err);
}

function resize(gl) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // sharper than 2x costs a lot on phones
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
}

start().catch(showError);
