import { mat4 } from "gl-matrix";

const worldVshSource = `
attribute vec3 aVtxPosition;
attribute vec3 aVtxNormal;
attribute vec4 aVtxColor;
attribute vec4 aVtxTextureRegion;
attribute vec2 aVtxTextureCoords;
attribute vec2 aVtxLightmapCoords;
attribute vec2 aVtxShadeExposure;
attribute float aVtxBackfaceVisible;
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uModelMatrix;
uniform mat4 uNormalMatrix;
uniform vec3 uShade0;
uniform vec3 uShade1;
uniform float uShadeAmbient;
uniform float uAlpha;
varying mediump vec4 vColorFront;
varying mediump vec4 vColorBack;
varying mediump vec4 vTextureRegion;
varying highp vec2 vTextureCoords;
void main(void) {
	aVtxLightmapCoords; // unused
	vec3 transformedNormal = normalize((uNormalMatrix * vec4(aVtxNormal, 0)).xyz);
	float shade0dot = dot(transformedNormal, uShade0);
	float shade1dot = dot(transformedNormal, uShade1);
	gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix * vec4(aVtxPosition, 1);
	float lightF = min((max(shade0dot, 0.0) + max(shade1dot, 0.0)) * aVtxShadeExposure.x + uShadeAmbient, 1.0);
	float lightB = min((min(shade0dot, 0.0) + min(shade1dot, 0.0)) * -aVtxShadeExposure.y + uShadeAmbient, 1.0);
	vColorFront = vec4(aVtxColor.rgb * lightF, aVtxColor.a * uAlpha);
	vColorBack = vec4(aVtxColor.rgb * lightB, aVtxColor.a * uAlpha * aVtxBackfaceVisible);
	vTextureRegion = aVtxTextureRegion;
	vTextureCoords = aVtxTextureCoords;
}
`;

const worldFshSource = `
precision mediump float;
varying mediump vec4 vColorFront;
varying mediump vec4 vColorBack;
varying mediump vec4 vTextureRegion;
varying highp vec2 vTextureCoords;
uniform sampler2D uTextureSampler;
uniform float uAlphaMin;
vec2 mapTexCoords(vec2 inVec, vec2 min, vec2 max);
void main(void) {
	vec4 colorFace = mix(vColorBack, vColorFront, float(gl_FrontFacing));
	vec2 texCoords = mapTexCoords(vTextureCoords, vTextureRegion.xy, vTextureRegion.zw);
	vec4 colorTex = texture2D(uTextureSampler, texCoords);
	gl_FragColor = vec4(colorFace.rgb, max(colorFace.a, uAlphaMin)) * colorTex;
	if(gl_FragColor.a == 0.0) discard;
}
vec2 mapTexCoords(vec2 inVec, vec2 min, vec2 max) {
	vec2 mapped = min + fract(inVec) * (max - min);
	return mapped;
}
`;

const bgVshSource = `
attribute vec2 aVtxPosition;
attribute vec3 aVtxColor;
varying mediump vec3 vColor;
void main(void) {
	gl_Position = vec4(aVtxPosition, 0.0, 1.0);
	vColor = aVtxColor;
}
`;

const bgFshSource = `
varying mediump vec3 vColor;
void main(void) {
	gl_FragColor = vec4(vColor, 1.0);
}
`;

function Renderer() {
	this.canvas = null;
	this.gl = null;
	this.ctx2d = null;
	this.glState = null;
	this.rainPlayerModel = null;
	this.testPlayerModel = null;
	this.backgroundGradientBuffers = null;
	this.rainSpawnHrange = 0;
	this.rainPlayerEntities = [];
	this.worldVshSource = worldVshSource;
	this.worldFshSource = worldFshSource
	this.bgVshSource = bgVshSource;
	this.bgFshSource = bgFshSource;
	this.globalTimer = 0;
	this.initCanvas = function(canvas) {
		if(!canvas) return false;
		this.canvas = canvas;
		this.gl = canvas.getContext("webgl", {
			antialias: false,
			premultipliedAlpha: false
		});
		this.canvas.addEventListener("webglcontextlost", function(event) {
			event.preventDefault();
			console.log("WebGL context lost!");
		}, false);
		if(!this.gl) return false;
		this.resize(canvas.width, canvas.height);
		return true;
	}
	this.initScene = function() {
		this.glState = new GlStateManager(this.gl);
		this.glState.loadShader("world", this.worldVshSource, this.worldFshSource);
		this.glState.loadShader("background", this.bgVshSource, this.bgFshSource);
		let skinKiwi = RenderHelper.loadTextureFromUrl(this.glState, "./static/images/kiwiskin.png", [0, 0, 0, 0]);
		let skinTemp = RenderHelper.loadTextureFromUrl(this.glState, "./static/images/templateskin.png", [0, 0, 0, 0]);
		this.rainPlayerModel = new PlayerModel("rainplayer", true);
		this.testPlayerModel = new PlayerModel("testplayer", true);
		this.testPlayerModel.setSkin(skinKiwi);
		for(let i = 0; i < 50; i++) {
			let rainPlayerEntity = new RainPlayerEntity(this.rainPlayerModel, skinKiwi);
			this.spawnRainingPlayerRandomly(rainPlayerEntity, -10, 0);
			this.rainPlayerEntities.push(rainPlayerEntity);
		}
		let bgHue = 200;
		this.backgroundGradientBuffers = RenderHelper.makeGradientBuffers(this.glState, MathHelper.colorHSV(bgHue, 80, 100), MathHelper.colorHSV(bgHue, 20, 100));
	}
	this.resize = function(w, h) {
		if(!this.gl) return;
		this.canvas.width = w;
		this.canvas.height = h;
		this.gl.viewport(0, 0, w, h);
		this.rainSpawnHrange = 6 * w / h;
	}
	this.renderFrame = function(tDelta) {
		this.globalTimer += tDelta;
		if(!this.gl) {
			console.log("Trying to render without GL context!");
			return false;
		}
		this.glState.resetDrawModes();
		this.glState.clear(null, true);
		RenderHelper.drawGradientBuffers(this.glState, this.backgroundGradientBuffers);
		this.glState.clear(null, true);
		this.glState.useShader("world");
		this.glState.degreeMode(true);
		this.glState.perspectiveWindow(90);
		//this.glState.orthoNorm(1.5,1.5,true);
		this.glState.degreeMode(false);
		this.glState.backfaceCulling(true);
		this.glState.resetView();
		this.glState.resetModel();
		this.glState.pushView();
		this.drawRainingPlayers(tDelta);
		this.glState.popView();
		this.glState.pushView();
		//this.drawTestModel();
		this.glState.popView();
		return true;
	}
	this.drawRainingPlayers = function(tDelta) {
		let tdm = Math.min(tDelta, 0.2);
		this.glState.translateView([0, 4, -5]);
		this.glState.backfaceCulling(false);
		for(let entity of this.rainPlayerEntities) {
			entity.update(tdm);
			if(entity.dead) this.spawnRainingPlayerRandomly(entity, -10, -9);
			let renderModel = entity.getPreparedModel();
			this.glState.pushModel();
			renderModel.render(this.glState);
			this.glState.popModel();
		}
	}
	this.drawTestModel = function() {
		this.glState.translateView([0, 0, -1.5]);
		this.glState.rotateViewX(0.5);
		this.glState.translateView([0, -0.5, 0]);
		let swing = Math.sin(this.globalTimer * 8) / 3;
		this.testPlayerModel.rotation[1] = 0.5;
		this.testPlayerModel.playerParts.armL.rotation[0] = swing;
		this.testPlayerModel.playerParts.armR.rotation[0] = -swing;
		this.testPlayerModel.playerParts.legL.rotation[0] = -swing;
		this.testPlayerModel.playerParts.legR.rotation[0] = swing;
		this.testPlayerModel.render(this.glState);
	}
	this.spawnRainingPlayerRandomly = function(rp, spawnMin, spawnMax) {
		rp.position = [(Math.random() - 0.5)*this.rainSpawnHrange, MathHelper.map(Math.random(), 0, 1, spawnMin, spawnMax), (Math.random() * 5) - 3];
		rp.dead = false;
		rp.legSpread = (Math.random() * 2) - 1;
		rp.cycleOffset = (Math.random() * 0.6) - 0.3;
		rp.lookAngle = Math.atan2(-rp.position[0], 5 - rp.position[2]);
	};
}

function RainPlayerEntity(model, skinTex) {
	this.position = null;
	this.dead = false;
	this.legSpread = 0;
	this.cycleOffset = 0;
	this.lookAngle = 0;
	this.model = model;
	this.skinTex = skinTex;
	this.rotation = 0;
	this.getPreparedModel = function() {
		let rm = -MathHelper.wrapAngle(this.rotation + this.cycleOffset);
		let rb = rm;
		let rh = rm;
		rb *= Math.abs(rb) / Math.PI;
		rh *= Math.abs(rh * rh) / (Math.PI * Math.PI);
		let ra = -(rh + rb) / 2;
		rh -= rb;
		ra += rb;
		let aoz = Math.sin(rh * 2) * -1
		let slm = (Math.cos(rm) + 1) / 2;
		let sl = this.legSpread * 0.1 * slm;
		this.model.setSkin(this.skinTex);
		this.model.position = this.position;
		this.model.rotation = [0, rb + this.lookAngle, 0];
		this.model.playerParts.head.rotation = [0, rh, 0];
		this.model.playerParts.body.rotation = [0, 0, 0];
		this.model.playerParts.armL.rotation = [0, ra, 1.45];
		this.model.playerParts.armR.rotation = [0, ra, -1.45];
		this.model.playerParts.legL.rotation = [0, 0, sl];
		this.model.playerParts.legR.rotation = [0, 0, -sl];
		this.model.playerParts.armL.offset = [0.8, 0, -aoz];
		this.model.playerParts.armR.offset = [-0.8, 0, aoz];
		return this.model;
	}
	this.update = function(tDelta) {
		this.rotation += tDelta * (Math.PI * 2 * 1.125); // music = 135bpm, rotate 67.5rpm
		this.rotation = MathHelper.wrapAngle(this.rotation);
		this.position[1] += tDelta * 0.5;
		if(this.position[1] > 0) this.dead = true;
	}
}

const MathHelper = {
	// A lot of these can probably be replaced with lodash or something...
	checkBounds: function(x, y, z, lx, ly, lz, ux, uy, uz) {
		return (x >= lx && x <= ux)
			&& (y >= ly && y <= uy)
			&& (z >= lz && z <= uz);
	},
	isPowerOf2: function(value) {
		return (value & (value - 1)) == 0;
	},
	length: function(nvec) {
		let lsq = 0;
		for(let i = 0; i < nvec.length; i++) lsq += nvec[i] ** 2;
		return Math.sqrt(lsq);
	},
	normalize: function(xyz) {
		let mag = this.length(xyz);
		if(!mag) return xyz;
		return [xyz[0] / mag, xyz[1] / mag, xyz[2] / mag];
	},
	isLittleEndian: function() {
		// This will never change during runtime, so precalculate and replace the function
		// New functions isn't just "return precalc" to free precalc afterwards
		let precalc = ((new Uint8Array(new Uint32Array([0x12345678]).buffer)[0]) === 0x78);
		if(precalc) MathHelper.isLittleEndian = function() { return true; }
		else MathHelper.isLittleEndian = function() { return false; }
		return precalc;
	},
	clamp: function(v, l, h) {
		return Math.min(Math.max(l, v), h);
	},
	lerp: function(a, b, f) {
		return a + (b - a) * f;
	},
	map: function(f, inMin=-1, inMax=1, outMin=-32768, outMax=32767) {
		return (this.clamp((f - inMin) / (inMax - inMin), 0, 1) * (outMax - outMin)) + outMin;
	},
	mapVec: function(vec, inMin, inMax, outMin, outMax) {
		// This is a weird one, could do with rewriting, or simplifying where it's used
		let inMinV = inMin; if(!inMin.length) inMinV = Array(vec.length).fill(inMin);
		let inMaxV = inMax; if(!inMax.length) inMaxV = Array(vec.length).fill(inMax);
		let outMinV = outMin; if(!outMin.length) outMinV = Array(vec.length).fill(outMin);
		let outMaxV = outMax; if(!outMax.length) outMaxV = Array(vec.length).fill(outMax);
		let out = [];
		for(let i = 0; i < vec.length; i++) out.push(this.map(vec[i], inMinV[i], inMaxV[i], outMinV[i], outMaxV[i]));
		return out;
	},
	clampVec: function(vec, limMin, limMax) {
		let limMinV = limMin; if(!limMin.length) limMinV = Array(vec.length).fill(limMin);
		let limMaxV = limMax; if(!limMax.length) limMaxV = Array(vec.length).fill(limMax);
		let out = [];
		for(let i = 0; i < vec.length; i++) out.push(this.clamp(vec[i], limMinV[i], limMaxV[i]));
		return out;
	},
	defaultArray: function(arrayIn, defaultIn, len=null) {
		// If arrayIn exists, is non empty, and matches the correct length, return it as is
		// Otherwise return defaultIn, or an array of length len filled with defaultIn
		let reqLen = (len == null) ? defaultIn.length : len;
		if(!(arrayIn && arrayIn.length && (arrayIn.length == reqLen))) {
			if(len == null) return defaultIn;
			return Array(len).fill(defaultIn);
		}
		return arrayIn;
	},
	wrapAngle: function(angle) {
		return ((angle + Math.PI) % (Math.PI * 2)) - Math.PI;
	},
	colorHSV: function(h, s, v, ht=360, st=100, vt=100) {
		let hs = h * 6 / ht; // h in range [0, 6)
		let ss = s / st; // s in range [0, 1]
		let vs = v / vt; // v in range [0, 1]
		let hi = Math.floor(hs); // Which part of the hue wheel
		let hf = hs - hi; // Default if hue invalid
		let col = [0, 0, 0];
		// First convert the pure hue to rgb
		if(hi == 0) col = [1, hf, 0];
		if(hi == 1) col = [1 - hf, 1, 0];
		if(hi == 2) col = [0, 1, hf];
		if(hi == 3) col = [0, 1 - hf, 1];
		if(hi == 4) col = [hf, 0, 1];
		if(hi == 5) col = [1, 0, 1 - hf];
		// Then remap rgb using S and V
		col[0] = (1 - ((1 - col[0]) * ss)) * vs;
		col[1] = (1 - ((1 - col[1]) * ss)) * vs;
		col[2] = (1 - ((1 - col[2]) * ss)) * vs;
		return col;
	}
};

const RenderHelper = {
	concatBufferData: function(data1, data2) {
		let outVerts = new Uint8Array(data1.vertices.length + data2.vertices.length);
		outVerts.set(data1.vertices);
		outVerts.set(data2.vertices, data1.vertices.length);
		let outInds = new Uint16Array(data1.indices.length + data2.indices.length);
		outInds.set(data1.indices);
		let offsetVertices = data1.vertices.length / Vertex.sizeBytes;
		for(let i = 0; i < data2.indices.length; i++) {
			outInds[i + data1.indices.length] = data2.indices[i] + offsetVertices;
		}
		return {vertices:outVerts,indices:outInds};
	},
	makeCube: function(pos1, pos2, color, visTable, texCoords, exposure, dualSided=false) {
		pos1 = MathHelper.defaultArray(pos1, 0, 3);
		pos2 = MathHelper.defaultArray(pos2, 1, 3);
		color = MathHelper.defaultArray(color, 1, 4);
		visTable = MathHelper.defaultArray(visTable, true, 6);
		texCoords = MathHelper.defaultArray(texCoords, [[0,0], [0,1], [1,1], [1,0]], 6);
		exposure = MathHelper.defaultArray(exposure, [1,0]);
		let allVertices = [];
		let allPositions = [
			[[0,1,0], [0,0,0], [0,0,1], [0,1,1]], // -X West
			[[1,1,1], [1,0,1], [1,0,0], [1,1,0]], // +X East
			[[0,0,1], [0,0,0], [1,0,0], [1,0,1]], // -Y Down
			[[0,1,0], [0,1,1], [1,1,1], [1,1,0]], // +Y Up
			[[1,1,0], [1,0,0], [0,0,0], [0,1,0]], // -Z North
			[[0,1,1], [0,0,1], [1,0,1], [1,1,1]]  // +Z South
		];
		let allNormals = [
			[[-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]], // -X West
			[[ 1, 0, 0], [ 1, 0, 0], [ 1, 0, 0], [ 1, 0, 0]], // +X East
			[[ 0,-1, 0], [ 0,-1, 0], [ 0,-1, 0], [ 0,-1, 0]], // -Y Down
			[[ 0, 1, 0], [ 0, 1, 0], [ 0, 1, 0], [ 0, 1, 0]], // +Y Up
			[[ 0, 0,-1], [ 0, 0,-1], [ 0, 0,-1], [ 0, 0,-1]], // -Z North
			[[ 0, 0, 1], [ 0, 0, 1], [ 0, 0, 1], [ 0, 0, 1]]  // +Z South
		];
		let vert;
		let tco;
		for(let i = 0; i < 6; i++) {
			allVertices[i] = [];
			// TODO: Loopify
			let texLims = [
				Math.min(texCoords[i][0][0], texCoords[i][1][0], texCoords[i][2][0], texCoords[i][3][0]),
				Math.min(texCoords[i][0][1], texCoords[i][1][1], texCoords[i][2][1], texCoords[i][3][1]),
				Math.max(texCoords[i][0][0], texCoords[i][1][0], texCoords[i][2][0], texCoords[i][3][0]),
				Math.max(texCoords[i][0][1], texCoords[i][1][1], texCoords[i][2][1], texCoords[i][3][1])
			];
			let texRegion = [
				//[MathHelper.lerp(texLims[0],texLims[2],0.1),MathHelper.lerp(texLims[1],texLims[3],0.1)],
				//[MathHelper.lerp(texLims[0],texLims[2],0.9),MathHelper.lerp(texLims[1],texLims[3],0.9)]
				[texLims[0], texLims[1]], [texLims[2], texLims[3]]
			];
			for(let j = 0; j < 4; j++) {
				vert = new Vertex();
				vert.position =        MathHelper.mapVec(allPositions[i][j], 0, 1, pos1, pos2);
				vert.textureRegion =   texRegion;
				vert.textureCoords =   MathHelper.mapVec(texCoords[i][j], [texLims[0], texLims[1]], [texLims[2], texLims[3]], 0, 1);
				vert.normal =          allNormals[i][j];
				vert.shadeExposure =   exposure;
				vert.color =           color;
				vert.lightmapCoords =  [0, 0];
				vert.backfaceVisible = dualSided;
				allVertices[i][j] =    vert;
			}
		}
		let visVertices = [];
		let visIndices = [];
		let faceIndices = [0, 1, 2, 0, 2, 3];
		let faceVerticesCount = 4;
		let indicesOffset = 0;
		for(let i = 0; i < 6; i++) {
			if(!visTable[i]) continue;
			visVertices = visVertices.concat(allVertices[i]);
			// Add indices with offset
			for(let j = 0; j < faceIndices.length; j++) {
				visIndices.push(faceIndices[j] + indicesOffset);
			}
			indicesOffset += faceVerticesCount;
		}
		let vertexData = Vertex.packData(visVertices);
		let indexData = new Uint16Array(visIndices);
		return {vertices:vertexData, indices:indexData};
	},
	loadShader: function(gl, type, source) {
		let shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			alert("Shader compile error: " + gl.getShaderInfoLog(shader));
			//gl.deleteShader(shader);
			return null;
		}
		return shader;
	},
	initShaderProgram: function(gl, vsSource, fsSource) {
		let vertexShader = this.loadShader(gl, gl.VERTEX_SHADER, vsSource);
		let fragmentShader = this.loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
		if((!vertexShader) || (!fragmentShader)) return null;
		let shaderProgram = gl.createProgram();
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);
		if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
			alert('Shader program link error: ' + gl.getProgramInfoLog(shaderProgram));
			return null;
		}
		return shaderProgram;
	},
	getShaderObject: function(name, gl, shaderProgram) {
		if(name=="world") {
			let vtxFields = Vertex.dataFields;
			let vtxSize = Vertex.sizeBytes;
			return {
				program: shaderProgram,
				attribs: {
					vtxPosition:        {field: vtxFields.vtxPosition,        loc: gl.getAttribLocation(shaderProgram, 'aVtxPosition')},
					vtxNormal:          {field: vtxFields.vtxNormal,          loc: gl.getAttribLocation(shaderProgram, 'aVtxNormal')},
					vtxColor:           {field: vtxFields.vtxColor,           loc: gl.getAttribLocation(shaderProgram, 'aVtxColor')},
					vtxTextureRegion:   {field: vtxFields.vtxTextureRegion,   loc: gl.getAttribLocation(shaderProgram, 'aVtxTextureRegion')},
					vtxTextureCoords:   {field: vtxFields.vtxTextureCoords,   loc: gl.getAttribLocation(shaderProgram, 'aVtxTextureCoords')},
					vtxLightmapCoords:  {field: vtxFields.vtxLightmapCoords,  loc: gl.getAttribLocation(shaderProgram, 'aVtxLightmapCoords')},
					vtxShadeExposure:   {field: vtxFields.vtxShadeExposure,   loc: gl.getAttribLocation(shaderProgram, 'aVtxShadeExposure')},
					vtxBackfaceVisible: {field: vtxFields.vtxBackfaceVisible, loc: gl.getAttribLocation(shaderProgram, 'aVtxBackfaceVisible')}
				},
				vtxSize: vtxSize,
				uniforms: {
					shade0:           gl.getUniformLocation(shaderProgram, 'uShade0'),
					shade1:           gl.getUniformLocation(shaderProgram, 'uShade1'),
					shadeAmbient:     gl.getUniformLocation(shaderProgram, 'uShadeAmbient'),
					projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
					viewMatrix:       gl.getUniformLocation(shaderProgram, 'uViewMatrix'),
					modelMatrix:      gl.getUniformLocation(shaderProgram, 'uModelMatrix'),
					normalMatrix:     gl.getUniformLocation(shaderProgram, 'uNormalMatrix'),
					textureSampler:   gl.getUniformLocation(shaderProgram, 'uTextureSampler'),
					alpha:            gl.getUniformLocation(shaderProgram, 'uAlpha')
				},
			};
		}
		else if(name=="background") {
			let vtxFields = {
				vtxPosition: {offset:0, type:"FLOAT", count:2, norm:false},
				vtxColor:    {offset:8, type:"FLOAT", count:3, norm:false},
			}
			let vtxSize = 20;
			return {
				program: shaderProgram,
				attribs: {
					vtxPosition: {field: vtxFields.vtxPosition, loc: gl.getAttribLocation(shaderProgram, 'aVtxPosition')},
					vtxColor:    {field: vtxFields.vtxColor,    loc: gl.getAttribLocation(shaderProgram, 'aVtxColor')}
				},
				vtxSize: vtxSize,
				uniforms: {}
			}
		}
		else return null;
	},
	loadTextureFromUrl: function(glState, url, defaultColor=[0, 0, 0, 1]) {
		let gl = glState.gl;
		let texture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		let level = 0;
		let internalFormat = gl.RGBA;
		let width = 1;
		let height = 1;
		let border = 0;
		let srcFormat = gl.RGBA;
		let srcType = gl.UNSIGNED_BYTE;
		let pixels = new Uint8Array([defaultColor[0] * 255, defaultColor[1] * 255, defaultColor[2] * 255, defaultColor[3] * 255]);
		gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, pixels);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		glState.currentTextures[0] = null;
		let image = new Image();
		image.onload = () => {
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, image);
			if (MathHelper.isPowerOf2(image.width) && MathHelper.isPowerOf2(image.height)) {
				//gl.generateMipmap(gl.TEXTURE_2D);
			} else {
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			}
			glState.currentTextures[0] = null;
		};
		image.crossOrigin = "";
		image.src = url;
		return texture;
	},
	orderedRotateModel: function(glState, rotationOrder, rotation) {
		// Allows shorthand applying rotation in different orders (XYZ, YZX, etc)
		let r;
		for(let i in rotationOrder) {
			r = rotationOrder[i];
			if(r == 0) glState.rotateModelX(rotation[0]);
			if(r == 1) glState.rotateModelY(rotation[1]);
			if(r == 2) glState.rotateModelZ(rotation[2]);
		}
	},
	updateNormalMatrix: function(modelMatrix, normalMatrix) {
		mat4.transpose(normalMatrix, mat4.invert(normalMatrix, modelMatrix));
	},
	makeCuboidUV: function(boxSize, uvTexOrigin, uvTexScale, textureSize=1, flipBottom=false) {
		let originX = uvTexOrigin[0] / textureSize;
		let originY = uvTexOrigin[1] / textureSize;
		let sizeScaleFactor = uvTexScale / textureSize;
		let sizeX = boxSize[0] * sizeScaleFactor;
		let sizeY = boxSize[1] * sizeScaleFactor;
		let sizeZ = boxSize[2] * sizeScaleFactor;
		// Unique UV points left to right, top to bottom
		let A = [sizeZ, 0]; // Top TL
		let B = [sizeZ + sizeX, 0]; // Top TR + Bottom TL
		let C = [sizeZ + sizeX + sizeX, 0]; // Bottom TR
		let D = [sizeZ, sizeZ]; // Top BL + Right TR + Front TL
		let E = [sizeZ + sizeX, sizeZ]; // Top BR + Bottom BL + Front TR + Left TL
		let F = [sizeZ + sizeX + sizeX, sizeZ]; // Bottom BR
		let G = [0, sizeZ]; // Right TL
		let H = [sizeZ + sizeX + sizeZ, sizeZ]; // Left TR, Back TL
		let I = [sizeZ + sizeX + sizeZ + sizeX, sizeZ]; // Back TR
		let J = [0, sizeZ + sizeY]; // Right BL
		let K = [sizeZ, sizeZ + sizeY]; // Right BR, Front BL
		let L = [sizeZ + sizeX, sizeZ + sizeY]; // Front BR, Left BL
		let M = [sizeZ + sizeX + sizeZ, sizeZ + sizeY]; // Left BR, Back BL
		let N = [sizeZ + sizeX + sizeZ + sizeX, sizeZ + sizeY]; // Back BR
		// Anticlockwise from top left
		let faces = [];
		faces[0] = [G, J, K, D]; // -X Right
		faces[1] = [E, L, M, H]; // +X Left
		faces[2] = flipBottom ? [E, B, C, F] : [B, E, F, C]; // -Y Bottom
		faces[3] = [A, D, E, B]; // +Y Top
		faces[4] = [H, M, N, I]; // -Z Back
		faces[5] = [D, K, L, E]; // +Z Front
		for(let i = 0; i < 6; i++) for(let j = 0; j < 4; j++) {
			faces[i][j] = [faces[i][j][0] + originX, faces[i][j][1] + originY];
		}
		return faces;
	},
	makeGradientBuffers: function(glState, colorStart, colorEnd, horizontal=false) {
		let littleEndian = MathHelper.isLittleEndian();
		let outBuffer = new ArrayBuffer(4 * 20);
		let outDataView = new DataView(outBuffer);
		let bufferOffset = 0;
		let colorA = horizontal ? colorStart : colorEnd; // Bottom left?
		let colorB = horizontal ? colorEnd : colorStart; // Top right?
		outDataView.setFloat32(bufferOffset, -1, littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, 1, littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorStart[0], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorStart[1], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorStart[2], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, -1, littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, -1, littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorA[0], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorA[1], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorA[2], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, 1, littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, -1, littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorEnd[0], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorEnd[1], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorEnd[2], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, 1, littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, 1, littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorB[0], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorB[1], littleEndian); bufferOffset += 4;
		outDataView.setFloat32(bufferOffset, colorB[2], littleEndian); bufferOffset += 4;
		let verts = new Uint8Array(outBuffer);
		let inds = new Uint16Array([0, 1, 3, 3, 1, 2]);
		let bufferPair = glState.createBufferPair();
		glState.bufferData(bufferPair, {vertices:verts, indices:inds});
		return bufferPair;
	},
	drawGradientBuffers: function(glState, buffers) {
		glState.useShader("background");
		glState.drawBuffers(buffers);
	}
};

function Vertex() {
	this.position = [0, 0, 0];
	this.normal = [0, 0, 0];
	this.color = [0, 0, 0, 1];
	this.textureRegion = [[0, 0], [1, 1]];
	this.textureCoords = [0, 0];
	this.lightmapCoords = [0, 0];
	this.shadeExposure = [1, 0];
	this.backfaceVisible = true;
}
// Apply to Vertex itself, not instances of it (not prototype!)
Vertex.sizeBytes = 48; // TODO: reduce this!
Vertex.packData = function(verts) {
	let littleEndian = MathHelper.isLittleEndian();
	let outBuffer = new ArrayBuffer(verts.length * Vertex.sizeBytes);
	let outDataView = new DataView(outBuffer);
	let bufferOffset = 0;
	for(let vert of verts) {
		// == 4-byte values ==
		// vtxPosition @ 0
		outDataView.setFloat32(bufferOffset, vert.position[0], littleEndian); bufferOffset += 4; // x
		outDataView.setFloat32(bufferOffset, vert.position[1], littleEndian); bufferOffset += 4; // y
		outDataView.setFloat32(bufferOffset, vert.position[2], littleEndian); bufferOffset += 4; // z
		// vtxTextureCoords @ 12
		outDataView.setFloat32(bufferOffset, vert.textureCoords[0], littleEndian); bufferOffset += 4; // x
		outDataView.setFloat32(bufferOffset, vert.textureCoords[1], littleEndian); bufferOffset += 4; // y
		// == 2-byte values ==
		// vtxTextureRegion @ 20
		outDataView.setInt16(bufferOffset, MathHelper.map(vert.textureRegion[0][0], 0, 1, 0, 65535), littleEndian); bufferOffset += 2; // x1
		outDataView.setInt16(bufferOffset, MathHelper.map(vert.textureRegion[0][1], 0, 1, 0, 65535), littleEndian); bufferOffset += 2; // y1
		outDataView.setInt16(bufferOffset, MathHelper.map(vert.textureRegion[1][0], 0, 1, 0, 65535), littleEndian); bufferOffset += 2; // x2
		outDataView.setInt16(bufferOffset, MathHelper.map(vert.textureRegion[1][1], 0, 1, 0, 65535), littleEndian); bufferOffset += 2; // y2
		// vtxNormal @ 28
		outDataView.setInt16(bufferOffset, MathHelper.map(vert.normal[0], -Math.PI, Math.PI, -32768, 32767), littleEndian); bufferOffset += 2; // x
		outDataView.setInt16(bufferOffset, MathHelper.map(vert.normal[1], -Math.PI, Math.PI, -32768, 32767), littleEndian); bufferOffset += 2; // y
		outDataView.setInt16(bufferOffset, MathHelper.map(vert.normal[2], -Math.PI, Math.PI, -32768, 32767), littleEndian); bufferOffset += 2; // z
		// vtxShadeExposure @ 34
		outDataView.setUint16(bufferOffset, MathHelper.map(vert.shadeExposure[0], 0, 1, 0, 65535), littleEndian); bufferOffset += 2;
		outDataView.setUint16(bufferOffset, MathHelper.map(vert.shadeExposure[1], 0, 1, 0, 65535), littleEndian); bufferOffset += 2;
		// vtxColor @ 38
		// == 1-byte values ==
		outDataView.setUint8(bufferOffset, MathHelper.map(vert.color[0], 0, 1, 0, 255)); bufferOffset += 1; // r
		outDataView.setUint8(bufferOffset, MathHelper.map(vert.color[1], 0, 1, 0, 255)); bufferOffset += 1; // g
		outDataView.setUint8(bufferOffset, MathHelper.map(vert.color[2], 0, 1, 0, 255)); bufferOffset += 1; // b
		outDataView.setUint8(bufferOffset, MathHelper.map(vert.color[3], 0, 1, 0, 255)); bufferOffset += 1; // a
		// vtxLightmapCoords @ 42
		outDataView.setUint8(bufferOffset, MathHelper.map(vert.lightmapCoords[0], 0, 1, 0, 255)); bufferOffset += 1; // x
		outDataView.setUint8(bufferOffset, MathHelper.map(vert.lightmapCoords[1], 0, 1, 0, 255)); bufferOffset += 1; // y
		// vtxBackfaceVisible @ 44
		outDataView.setUint8(bufferOffset, vert.backfaceVisible ? 255 : 0); bufferOffset += 1;
		// == Data end ==
		// PAD @ 45
		outDataView.setUint16(bufferOffset, 0); bufferOffset += 2;
		outDataView.setUint8(bufferOffset, 0); bufferOffset += 1;
		// END @ 48
	}
	return new Uint8Array(outBuffer);
};
Vertex.dataFields = {
	vtxPosition:        {offset: 0,  type: "FLOAT",          count: 3, norm: false},
	vtxTextureCoords:   {offset: 12, type: "FLOAT",          count: 2, norm: false},
	vtxTextureRegion:   {offset: 20, type: "UNSIGNED_SHORT", count: 4, norm: true },
	vtxNormal:          {offset: 28, type: "SHORT",          count: 3, norm: true },
	vtxShadeExposure:   {offset: 34, type: "UNSIGNED_SHORT", count: 2, norm: true },
	vtxColor:           {offset: 38, type: "UNSIGNED_BYTE",  count: 4, norm: true },
	vtxLightmapCoords:  {offset: 42, type: "UNSIGNED_BYTE",  count: 2, norm: true },
	vtxBackfaceVisible: {offset: 44, type: "UNSIGNED_BYTE",  count: 1, norm: true }
};

function GlStateManager(gl) {
	this.currentShaderName = null;
	this.currentLighting = null;
	this.fovy = 90;
	this.aspectRatio = 1;
	this.zNear = 0.1;
	this.zFar = 1000;
	this.clearDepth;
	this.angleScale=1;
	this.backfaceCullingState=false;
	this.lightingState=false;
	this.shaders={};
	this.viewMatrixStack = [];
	this.modelMatrixStack = [];
	this.projectionMatrix = mat4.create();
	this.viewMatrix = mat4.create();
	this.modelMatrix = mat4.create();
	this.normalMatrix = mat4.create();
	// Vanilla Minecraft block shading with highlight similar to entities
	this.lightingModelWorld = new LightingModel(0.5, MathHelper.length([0.1, 0.4, 0.3]),
		[0.1, 0.4, -0.3],
		[-0.1, 0.4, 0.3]
	);
	this.lightingModelNone = new LightingModel(1, 0, [0,0,0], [0,0,0]);
	this.gl = gl;
	this.currentTextures = [null,null,null,null];
	this.resetDrawModes = function() {
		this.gl.cullFace(this.gl.BACK);
		this.gl.enable(this.gl.DEPTH_TEST);
		this.gl.depthFunc(this.gl.LESS);
		this.gl.enable(this.gl.BLEND);
		this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
		this.gl.sampleCoverage(0.0005, false);
		this.currentTextures = [null,null,null,null];
	};
	this.perspective = function(fovy, aspectRatio, zNear, zFar) {
		this.fovy = fovy * this.angleScale;
		this.aspectRatio = aspectRatio;
		this.zNear = zNear;
		this.zFar = zFar;
		this.clearDepth = zFar;
		mat4.perspective(this.projectionMatrix, this.fovy/2, aspectRatio, zNear, zFar);
		this.setProjectionUniform();
	};
	this.perspectiveWindow = function(fovy, zNear=0.1, zFar=1000) {
		this.perspective(fovy, this.getWindowSize()[2], zNear, zFar);
	};
	this.ortho = function(r=1, t=1) {
		// TODO: Set some ortho flag?
		mat4.ortho(this.projectionMatrix, -r, r, -t, t, -100, 100);
		this.clearDepth = 100;
		this.setProjectionUniform();
	};
	this.orthoWindow = function(yIsDown=false) {
		let ws = this.getWindowSize();
		this.ortho(ws[0] / 2, ws[1] / (yIsDown ? -2 : 2));
	};
	this.orthoNorm = function(r=1, t=1, shrink=false) {
		let aspect = this.getWindowSize()[2];
		let rn = r;
		let tn = t;
		if((aspect > 1) == !!shrink) tn /= aspect;
		else rn *= aspect;
		this.ortho(rn, tn);
	};
	this.getWindowSize = function() {
		let w = this.gl.canvas.width;
		let h = this.gl.canvas.height;
		return [w, h, w / h];
	};
	this.degreeMode = function(on) {
		this.angleScale = on ? (Math.PI / 180) : 1;
	};
	this.pushView = function() { this.viewMatrixStack.push(mat4.clone(this.viewMatrix)); };
	this.popView = function() { if(this.viewMatrixStack.length) this.viewMatrix = this.viewMatrixStack.pop(); this.setViewUniform(); };
	this.resetView = function() { mat4.identity(this.viewMatrix); this.setViewUniform(); };
	this.translateView = function(xyz) { mat4.translate(this.viewMatrix, this.viewMatrix, xyz); this.setViewUniform(); };
	this.rotateViewX = function(a) { mat4.rotateX(this.viewMatrix, this.viewMatrix, a * this.angleScale); this.setViewUniform(); };
	this.rotateViewY = function(a) { mat4.rotateY(this.viewMatrix, this.viewMatrix, a * this.angleScale); this.setViewUniform(); };
	this.rotateViewZ = function(a) { mat4.rotateZ(this.viewMatrix, this.viewMatrix, a * this.angleScale); this.setViewUniform(); };
	this.pushModel = function() { this.modelMatrixStack.push(mat4.clone(this.modelMatrix)); };
	this.popModel = function() { if(this.modelMatrixStack.length) this.modelMatrix = this.modelMatrixStack.pop(); this.setModelUniform(); };
	this.resetModel = function() { mat4.identity(this.modelMatrix); this.setModelUniform(); };
	this.translateModel = function(xyz) { mat4.translate(this.modelMatrix, this.modelMatrix, xyz); this.setModelUniform(); };
	this.rotateModelX = function(a) { mat4.rotateX(this.modelMatrix, this.modelMatrix, a * this.angleScale); this.setModelUniform(); };
	this.rotateModelY = function(a) { mat4.rotateY(this.modelMatrix, this.modelMatrix, a * this.angleScale); this.setModelUniform(); };
	this.rotateModelZ = function(a) { mat4.rotateZ(this.modelMatrix, this.modelMatrix, a * this.angleScale); this.setModelUniform(); };
	this.scaleModel = function(xyz) { mat4.scale(this.modelMatrix, this.modelMatrix, xyz); this.setModelUniform(); };
	this.loadShader = function(name, vsh, fsh) {
		let program = RenderHelper.initShaderProgram(this.gl, vsh, fsh);
		if(!program) return false;
		this.shaders[name] = RenderHelper.getShaderObject(name, this.gl, program);
		return true;
	};
	this.useShader = function(name) {
		if(!this.shaders[name]) return false;
		this.currentShaderName = name;
		this.gl.useProgram(this.shaders[name].program);
		this.currentTextures = [null, null, null, null];
		if(name == "world") {
			this.useLighting(true);
			this.setLightingUniforms();
			this.setAlphaUniform();
			this.setProjectionUniform();
			this.setViewUniform();
			this.setModelUniform();
			this.setModelAlpha();
		} else if(name == "background") {
			// Anything to do?
		}
		return true;
	};
	this.useLighting = function(use) {
		if(this.lightingState != use) {
			this.currentLighting = use ? this.lightingModelWorld : this.lightingModelNone;
			this.setLightingUniforms();
			this.lightingState = use;
		}
	};
	this.setLightingUniforms = function() {
		let shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniform3fv(shad.uniforms.shade0, this.currentLighting.precalcDiffuse0);
			this.gl.uniform3fv(shad.uniforms.shade1, this.currentLighting.precalcDiffuse1);
			this.gl.uniform1f(shad.uniforms.shadeAmbient, this.currentLighting.ambient);
		}
	};
	this.setAlphaUniform = function() {
		let shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniform1f(shad.uniforms.alpha, this.modelAlpha);
		}
	};
	this.setProjectionUniform = function() {
		let shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniformMatrix4fv(shad.uniforms.projectionMatrix, false, this.projectionMatrix);
		}
	};
	this.setViewUniform = function() {
		let shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniformMatrix4fv(shad.uniforms.viewMatrix, false, this.viewMatrix);
		}
	};
	this.setModelUniform = function() {
		RenderHelper.updateNormalMatrix(this.modelMatrix, this.normalMatrix);
		let shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniformMatrix4fv(shad.uniforms.modelMatrix, false, this.modelMatrix);
			this.gl.uniformMatrix4fv(shad.uniforms.normalMatrix, false, this.normalMatrix);
		}
	};
	this.setShaderAttribs = function() {
		let shad = this.shaders[this.currentShaderName];
		let attribs = shad.attribs;
		let vsb = shad.vtxSize;
		let attr, field;
		for(let attrInd in attribs) {
			let attr = attribs[attrInd];
			let field = attr.field;
			this.gl.vertexAttribPointer(attr.loc, field.count, this.gl[field.type], field.norm, vsb, field.offset);
			this.gl.enableVertexAttribArray(attr.loc);
		}
	};
	this.backfaceCulling = function(use) {
		if(this.backfaceCullingState != use) {
			if(use) this.gl.enable(this.gl.CULL_FACE);
			else this.gl.disable(this.gl.CULL_FACE);
			this.backfaceCullingState = use;
		}
	};
	this.drawBuffers = function(buffers) {
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffers.vertices);
		if(buffers.indices) this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
		this.setShaderAttribs();
		this.gl.drawElements(this.gl.TRIANGLES, buffers.size, this.gl.UNSIGNED_SHORT, 0);
	};
	this.clear = function(color, doDepth) {
		let clearBits = 0;
		if(color) {
			if(color.length) {
				if(color.length >= 3) this.gl.clearColor(color[0], color[1], color[2], 1.0);
				else this.gl.clearColor(color[0], color[0], color[0], 1.0);
			}
			else this.gl.clearColor(color, color, color, 1.0);
			clearBits |= this.gl.COLOR_BUFFER_BIT;
		}
		if(doDepth) {
			this.gl.clearDepth(this.clearDepth);
			clearBits |= this.gl.DEPTH_BUFFER_BIT
		}
		this.gl.clear(clearBits);
	};
	this.bindTexture = function(unit, texture) {
		if(unit < 0 || unit > 3) return;
		if(this.currentTextures[unit] == texture) return;
		// Texture unit constants are defined to be consecutive
		// So TEXTURE0 + n is safe
		this.gl.activeTexture(this.gl.TEXTURE0 + unit);
		this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
		let shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniform1i(shad.uniforms.textureSampler, 0);
		}
		this.currentTextures[unit] = texture;
	};
	this.setModelAlpha = function(alpha=1) {
		this.modelAlpha = alpha;
	};
	this.createBufferPair = function() {
		let vertices = this.gl.createBuffer();
		let indices = this.gl.createBuffer();
		return {vertices: vertices, indices: indices, size: 0};
	};
	this.deleteBufferPair = function(buffers) {
		this.gl.deleteBuffer(buffers.vertices);
		this.gl.deleteBuffer(buffers.indices);
	};
	this.bufferData = function(buffers, data) {
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffers.vertices);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, data.vertices, this.gl.STATIC_DRAW);
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
		this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, data.indices, this.gl.STATIC_DRAW);
		buffers.size = data.indices.length;
	};
}

function LightingModel(ambient, diffuse, pos0, pos1) {
	this.ambient = ambient;
	this.diffuse = diffuse;
	this.pos0 = MathHelper.normalize(pos0);
	this.pos1 = MathHelper.normalize(pos1);
	// Precalculate as much information as possible
	this.precalcDiffuse0 = [this.pos0[0] * this.diffuse, this.pos0[1] * this.diffuse, this.pos0[2] * this.diffuse];
	this.precalcDiffuse1 = [this.pos1[0] * this.diffuse, this.pos1[1] * this.diffuse, this.pos1[2] * this.diffuse];
}

function EntityModel(name="entity") {
	this.position = [0, 0, 0];
	this.rotation = [0, 0, 0];
	this.scale = [1, 1, 1];
	this.rotationOrder = [1, 0, 2]; // Yaw-pitch-roll
	this.parts = {};
	this.textures = [];
	this.name = name;
	this.addPart = function(part) {
		this.parts[part.name] = part;
	}
	this.removePart = function(part) {
		delete this.parts[part.name];
	};
	this.render = function(glState) {
		glState.pushModel();
		glState.translateModel(this.position);
		RenderHelper.orderedRotateModel(glState, this.rotationOrder, this.rotation);
		glState.scaleModel(this.scale); // ??????
		for(let part of Object.values(this.parts)) {
			part.render(glState, this.textures);
		}
		glState.popModel();
	};
	this.texture = function(index, tex) {
		this.textures[index] = tex;
	};
	this.destroy = function() {
		for(let p in this.parts) {
			this.parts[p].destroy();
			this.parts[p] = null;
		}
	};
}
function PlayerModel(name="player", thinArms=false) {
	EntityModel.call(this, name);
	this.playerParts = {};
	this.scale = [1 / 32, 1 / 32, 1 / 32];
	let armWidth = thinArms ? 3 : 4;
	let armOffset = thinArms ? 0.5 : 0;
	let partHead = new EntityModelPart("head", this, [0, 24, 0]); this.playerParts.head = partHead;
	let partBody = new EntityModelPart("body", this, [0, 24, 0]); this.playerParts.body = partBody;
	let partLegL = new EntityModelPart("legL", this, [2, 12, 0]); this.playerParts.legL = partLegL;
	let partLegR = new EntityModelPart("legR", this, [-2, 12, 0]); this.playerParts.legR = partLegR;
	let partArmL = new EntityModelPart("armL", this, [5, 22 - armOffset, 0]); this.playerParts.armL = partArmL;
	let partArmR = new EntityModelPart("armR", this, [-5, 22 - armOffset, 0]); this.playerParts.armR = partArmR;
	let boxHead = new EntityModelBox("main", partHead, [8, 8, 8], [4, 0, 4], [0, 0, 0]);
	let boxBody = new EntityModelBox("main", partBody, [8, 12, 4], [4, 12, 2], [0, 0, 0]);
	let boxLegL = new EntityModelBox("main", partLegL, [4, 12, 4], [2, 12, 2], [0, 0, 0]);
	let boxLegR = new EntityModelBox("main", partLegR, [4, 12, 4], [2, 12, 2], [0, 0, 0]);
	let boxArmL = new EntityModelBox("main", partArmL, [armWidth, 12, 4], [1, 10, 2], [0, 0, 0]);
	let boxArmR = new EntityModelBox("main", partArmR, [armWidth, 12, 4], [armWidth - 1, 10, 2], [0, 0, 0]);
	let boxHead2 = boxHead.clone("over", 0.5);
	let boxBody2 = boxBody.clone("over", 0.25);
	let boxLegL2 = boxLegL.clone("over", 0.25);
	let boxLegR2 = boxLegR.clone("over", 0.25);
	let boxArmL2 = boxArmL.clone("over", 0.25);
	let boxArmR2 = boxArmR.clone("over", 0.25);
	boxHead.setTexCoords(RenderHelper.makeCuboidUV([8, 8, 8], [0, 0], 1, 64, true));
	boxBody.setTexCoords(RenderHelper.makeCuboidUV([8, 12, 4], [16, 16], 1, 64, true));
	boxLegL.setTexCoords(RenderHelper.makeCuboidUV([4, 12, 4], [16, 48], 1, 64, true));
	boxLegR.setTexCoords(RenderHelper.makeCuboidUV([4, 12, 4], [0, 16], 1, 64, true));
	boxArmL.setTexCoords(RenderHelper.makeCuboidUV([armWidth, 12, 4], [32, 48], 1, 64, true));
	boxArmR.setTexCoords(RenderHelper.makeCuboidUV([armWidth, 12, 4], [40, 16], 1, 64, true));
	boxHead2.setTexCoords(RenderHelper.makeCuboidUV([8, 8, 8], [32, 0], 1, 64, true));
	boxBody2.setTexCoords(RenderHelper.makeCuboidUV([8, 12, 4], [16, 32], 1, 64, true));
	boxLegL2.setTexCoords(RenderHelper.makeCuboidUV([4, 12, 4], [0, 48], 1, 64, true));
	boxLegR2.setTexCoords(RenderHelper.makeCuboidUV([4, 12, 4], [0, 32], 1, 64, true));
	boxArmL2.setTexCoords(RenderHelper.makeCuboidUV([armWidth, 12, 4], [48, 48], 1, 64, true));
	boxArmR2.setTexCoords(RenderHelper.makeCuboidUV([armWidth, 12, 4], [40, 32], 1, 64, true));
	boxHead2.dualSided = true; boxHead2.innerExposure = 0.5;
	boxBody2.dualSided = true; boxBody2.innerExposure = 0.5;
	boxLegL2.dualSided = true; boxLegL2.innerExposure = 0.5;
	boxLegR2.dualSided = true; boxLegR2.innerExposure = 0.5;
	boxArmL2.dualSided = true; boxArmL2.innerExposure = 0.5;
	boxArmR2.dualSided = true; boxArmR2.innerExposure = 0.5;
	this.setSkin = function(skin) {
		this.texture(0, skin);
	};
	this._super_render = this.render;
	this.render = function(glState) {
		this._super_render(glState);
	};
}

function EntityModelPart(name="p", parentModel, position=[0, 0, 0]) {
	this.glState = null;
	this.meshBuffers = null;
	this.rotation = [0, 0, 0];
	this.rotationOrder = [1, 0, 2]; // YXZ, Yaw-pitch-roll
	this.textureNum = 0;
	this.meshEmpty = true;
	this.meshDirty = true;
	this.hasDualSided = false;
	this.name = name;
	this.position = position;
	this.offset = [0, 0, 0];
	this.boxes = {};
	this.parentModel = parentModel;
	if(parentModel) parentModel.addPart(this);
	this.addBox = function(box) {
		this.boxes[box.name] = box;
		this.meshDirty = true;
	};
	this.removeBox = function(box) {
		delete this.boxes[box.name];
		this.meshDirty = true;
	};
	this.updateMesh = function(gl) {
		let meshData = null;
		this.hasDualSided = false;
		for(let box of Object.values(this.boxes)) {
			if(box.dualSided) this.hasDualSided = true;
			let p1 = [0, 0, 0];
			let p2 = box.size.slice();
			for(let i = 0; i < 3; i++) {
				p1[i] += /*box.position[i]*/ - box.origin[i];
				p2[i] += /*box.position[i]*/ - box.origin[i];
			}
			let boxMeshData = RenderHelper.makeCube(p1, p2, [1, 1, 1, 1], null, box.texCoords, [box.outerExposure, box.innerExposure], box.dualSided);
			if(meshData) meshData = RenderHelper.concatBufferData(meshData, boxMeshData);
			else meshData = boxMeshData;
		}
		this.meshEmpty = !meshData.indices.length;
		if(!this.meshEmpty) this.glState.bufferData(this.meshBuffers, meshData);
		this.meshDirty = false;
	};
	this.render = function(glState, textures) {
		if(glState != this.glState) {
			// Mesh buffers existing implies this.glState exists too
			if(this.meshBuffers) this.glState.deleteBufferPair(this.meshBuffers);
			this.meshBuffers = null;
			this.glState = glState;
		}
		if(!this.meshBuffers) {
			this.meshBuffers = glState.createBufferPair();
			this.meshDirty = true;
		}
		if(this.meshDirty) this.updateMesh(glState.gl);
		if(this.meshEmpty) return;
		glState.pushModel();
		glState.bindTexture(0, textures[this.textureNum]);
		glState.translateModel(this.position);
		glState.translateModel(this.offset);
		RenderHelper.orderedRotateModel(glState, this.rotationOrder, this.rotation);
		glState.backfaceCulling(!this.hasDualSided);
		glState.drawBuffers(this.meshBuffers);
		glState.popModel();
	};
	this.destroy = function() {
		if(this.glState) this.glState.deleteBufferPair(this.meshBuffers);
		for(let b in this.boxes) this.boxes[b] = null;
	};
}

function EntityModelBox(name="b", parentPart, size, origin) {
	// TODO Add box transforms (rotation, scale) ?
	this.dualSided = false;
	this.outerExposure = 1;
	this.innerExposure = 0;
	this.name = name;
	this.size = size;
	this.origin = origin;
	this.texCoords = [];
	for(let f = 0; f < 6; f++) this.texCoords[f] = [[0, 0], [0, 1], [1, 1], [1, 0]];
	this.parentPart = parentPart;
	if(parentPart) parentPart.addBox(this);
	this.setTexCoord = function(face, coords, copyData=false) {
		if(face < 0 || face > 5) return;
		let nc;
		for(let i = 0; i < 4; i++) {
			nc = coords[i];
			if(copyData) nc = nc.slice();
			this.texCoords[face][i] = nc;
		}
		this.parentPart.meshDirty = true;
	};
	this.setTexCoords = function(coords, copyData=false) {
		for(let f = 0; f < 6; f++) if(coords[f]) this.setTexCoord(f, coords[f], copyData);
	};
	this.clone = function(newName=this.name + "c", sizeDelta = 0) {
		let cloneBox = new EntityModelBox(newName, this.parentPart, this.size.slice(), this.origin.slice());
		cloneBox.setTexCoords(this.texCoords, true);
		cloneBox.dualSided = this.dualSided;
		cloneBox.outerExposure = this.outerExposure;
		cloneBox.innerExposure = this.innerExposure;
		cloneBox.size[0] += sizeDelta * 2;
		cloneBox.size[1] += sizeDelta * 2;
		cloneBox.size[2] += sizeDelta * 2;
		cloneBox.origin[0] += sizeDelta;
		cloneBox.origin[1] += sizeDelta;
		cloneBox.origin[2] += sizeDelta;
		return cloneBox;
	};
}

export { Renderer };