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


class Renderer {
	canvas;
	gl;
	ctx2d;
	glState;
	rainPlayerModel;
	testPlayerModel;
	backgroundGradientBuffers;
	rainSpawnHrange = 0;
	rainPlayerEntities = [];
	constructor() {
		this.worldVshSource = worldVshSource;
		this.worldFshSource = worldFshSource
		this.bgVshSource = bgVshSource;
		this.bgFshSource = bgFshSource;
	}
	initCanvas(canvas) {
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
	initScene() {
		this.glState = new GlStateManager(this.gl);
		this.glState.loadShader("world", this.worldVshSource, this.worldFshSource);
		this.glState.loadShader("background", this.bgVshSource, this.bgFshSource);
		var skinKiwi = RenderHelper.loadTextureFromUrl(this.glState, "./static/images/kiwiskin.png", [0,0,0,0]);
		var skinTemp = RenderHelper.loadTextureFromUrl(this.glState, "./static/images/templateskin.png", [0,0,0,0]);
		this.rainPlayerModel = new PlayerModel("rainplayer", true);
		this.testPlayerModel = new PlayerModel("testplayer", true);
		this.testPlayerModel.setSkin(skinKiwi);
		for(var i = 0; i < 50; i++) {
			var rpe = new RainPlayerEntity(this.rainPlayerModel, skinKiwi);
			this.spawnRainingPlayerRandomly(rpe,-10,0);
			this.rainPlayerEntities.push(rpe);
		}
		//this.backgroundGradientBuffers = RenderHelper.makeGradientBuffers(this.glState, [59/255,189/255,249/255], [90/255,213/255,251/255]);
		this.backgroundGradientBuffers = RenderHelper.makeGradientBuffers(this.glState, MathHelper.colorHSV(200,80,100),MathHelper.colorHSV(200,20,100));
	}
	resize(w, h) {
		if(!this.gl) return;
		this.canvas.width = w;
		this.canvas.height = h;
		this.gl.viewport(0, 0, w, h);
		this.rainSpawnHrange = 6 * w / h;
	}
	renderFrame(tDelta) {
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
	drawRainingPlayers(tDelta) {
		var tdm = Math.min(tDelta, 0.2);
		this.glState.translateView([0, 4, -5]);
		this.glState.backfaceCulling(false);
		for(var e in this.rainPlayerEntities) {
			var ent = this.rainPlayerEntities[e];
			ent.update(tdm);
			if(ent.dead) this.spawnRainingPlayerRandomly(ent,-10,-9);
			var renderModel = ent.getPreparedModel();
			this.glState.pushModel();
			renderModel.render(this.glState);
			this.glState.popModel();
		}
	}
	drawTestModel() {
		this.glState.translateView([0, 0, -1.5]);
		this.glState.rotateViewX(0.5, [1.0,0.0,0.0]);
		this.glState.translateView([0.0, -0.5, 0.0]);
		var swing = Math.sin(window.then*8)/3;
		this.testPlayerModel.rotation[1] = 0.5;
		this.testPlayerModel.playerParts.armL.rotation[0] = swing;
		this.testPlayerModel.playerParts.armR.rotation[0] = -swing;
		this.testPlayerModel.playerParts.legL.rotation[0] = -swing;
		this.testPlayerModel.playerParts.legR.rotation[0] = swing;
		this.testPlayerModel.render(this.glState);
	}
	spawnRainingPlayerRandomly(rp,spawnMin,spawnMax) {
		rp.position = [(Math.random()-0.5)*this.rainSpawnHrange, MathHelper.map(Math.random(),0,1,spawnMin,spawnMax), Math.random()*5-3];
		rp.dead = false;
		rp.legSpread = Math.random()*2 - 1;
		rp.cycleOffset = Math.random()*0.6-0.3;
		rp.lookAngle = Math.atan2(-rp.position[0],5-rp.position[2]);
	};
}

class RainPlayerEntity {
	rotation;
	position;
	model;
	skinTex;
	dead=false;
	legSpread;
	cycleOffset;
	lookAngle;
	constructor(model, skinTex) {
		this.model = model;
		this.skinTex = skinTex;
		this.rotation = 0;
	}
	getPreparedModel() {
		var rm = -MathHelper.wrapAngle(this.rotation+this.cycleOffset);
		var rb = rm;
		var rh = rm;
		rb *= Math.abs(rb) / Math.PI;
		rh *= Math.abs(rh*rh)/(Math.PI*Math.PI);
		var ra = -(rh+rb)/2;
		rh -= rb;
		ra += rb;
		var aoz = Math.sin(rh*2)*-1
		var slm = (Math.cos(rm)+1)/2;
		var sl = this.legSpread*0.1*slm;
		this.model.setSkin(this.skinTex);
		this.model.position = this.position;
		this.model.rotation = [0,rb+this.lookAngle,0];
		this.model.playerParts.head.rotation = [0,rh,0];
		this.model.playerParts.body.rotation = [0,0,0];
		this.model.playerParts.armL.rotation = [0,ra,1.45];
		this.model.playerParts.armR.rotation = [0,ra,-1.45];
		this.model.playerParts.legL.rotation = [0,0,sl];
		this.model.playerParts.legR.rotation = [0,0,-sl];
		this.model.playerParts.armL.offset = [0.8,0,-aoz];
		this.model.playerParts.armR.offset = [-0.8,0,aoz];
		return this.model;
	}
	update(tDelta) {
		this.rotation+=tDelta*(Math.PI*2*68/60);
		this.rotation=MathHelper.wrapAngle(this.rotation);
		this.position[1]+=tDelta/2;
		if(this.position[1] > 0) this.dead = true;
	}
}

class MathHelper {
	static checkBounds(x, y, z, lx, ly, lz, ux, uy, uz) {
		return (x >= lx && x <= ux)
			&& (y >= ly && y <= uy)
			&& (z >= lz && z <= uz);
	}
	static isPowerOf2(value) {
		return (value & (value - 1)) == 0;
	}
	static length(nvec) {
		var lsq = 0;
		for(var i = 0; i < nvec.length; i++) lsq += nvec[i]*nvec[i];
		return Math.sqrt(lsq);
	}
	static normalize(xyz) {
		var mag = this.length(xyz);
		if(!mag) return xyz;
		return [xyz[0]/mag, xyz[1]/mag, xyz[2]/mag];
	}
	static isLittleEndian() {
		return (new Uint8Array(new Uint32Array([0x12345678]).buffer)[0]) === 0x78;
	}
	static clamp(v, l, h) {
		return Math.min(Math.max(l, v), h);
	}
	static lerp(a, b, f) {
		return a + (b - a) * f;
	}
	static map(f, inMin=-1, inMax=1, outMin=-32768, outMax=32767) {
		return this.clamp((f-inMin)/(inMax-inMin),0,1)*(outMax-outMin) + outMin;
	}
	static mapVec(vec, inMin, inMax, outMin, outMax) {
		var inMinV = inMin; if(!inMin.length) inMinV = Array(vec.length).fill(inMin);
		var inMaxV = inMax; if(!inMax.length) inMaxV = Array(vec.length).fill(inMax);
		var outMinV = outMin; if(!outMin.length) outMinV = Array(vec.length).fill(outMin);
		var outMaxV = outMax; if(!outMax.length) outMaxV = Array(vec.length).fill(outMax);
		var out = [];
		for(var i = 0; i < vec.length; i++) out.push(this.map(vec[i], inMinV[i], inMaxV[i], outMinV[i], outMaxV[i]));
		return out;
	}
	static clampVec(vec, limMin, limMax) {
		var limMinV = limMin; if(!limMin.length) limMinV = Array(vec.length).fill(limMin);
		var limMaxV = limMax; if(!limMax.length) limMaxV = Array(vec.length).fill(limMax);
		var out = [];
		for(var i = 0; i < vec.length; i++) out.push(this.clamp(vec[i], limMinV[i], limMaxV[i]));
		return out;
	}
	static defaultArray(arrayIn, defaultIn, len=null) {
		var reqLen = len;
		if(len==null) reqLen = defaultIn.length;
		if(!(arrayIn && arrayIn.length && arrayIn.length==reqLen)) {
			if(len==null) return defaultIn;
			return Array(len).fill(defaultIn);
		}
		return arrayIn;
	}
	static wrapAngle(angle) {
		return ((angle + Math.PI) % (Math.PI * 2)) - Math.PI;
	}
	static colorHSV(h, s, v, ht=360, st=100, vt=100) {
		const hs=h*6/ht;
		const ss=s/st;
		const vs=v/vt;
		const hi=Math.floor(hs);
		const hf=hs-hi;
		var col = [0,0,0];
		if(hi==0) col = [1,hf,0];
		if(hi==1) col = [1-hf,1,0];
		if(hi==2) col = [0,1,hf];
		if(hi==3) col = [0,1-hf,1];
		if(hi==4) col = [hf,0,1];
		if(hi==5) col = [1,0,1-hf];
		for(var i=0; i<3; i++){
			col[i] = (1-((1-col[i])*ss))*vs;
		}
		//console.log(`CHSV(${hs},${ss},${vs}) = ${col}`);
		return col;
	}
}

class RenderHelper {
	static concatBufferData(data1, data2) {
		var outVerts = new Uint8Array(data1.vertices.length + data2.vertices.length);
		outVerts.set(data1.vertices);
		outVerts.set(data2.vertices, data1.vertices.length);
		var outInds = new Uint16Array(data1.indices.length + data2.indices.length);
		outInds.set(data1.indices);
		const offsetVertices = data1.vertices.length / Vertex.sizeBytes();
		for(var i = 0; i < data2.indices.length; i++) {
			outInds[i + data1.indices.length] = data2.indices[i] + offsetVertices;
		}
		return {vertices:outVerts,indices:outInds};
	}
	static makeCube(pos1, pos2, color, visTable, texCoords, exposure, dualSided=false) {
		pos1 = MathHelper.defaultArray(pos1, 0, 3);
		pos2 = MathHelper.defaultArray(pos2, 1, 3);
		color = MathHelper.defaultArray(color, 1, 4);
		visTable = MathHelper.defaultArray(visTable, true, 6);
		texCoords = MathHelper.defaultArray(texCoords, [[0,0], [0,1], [1,1], [1,0]], 6);
		exposure = MathHelper.defaultArray(exposure, [1,0]);
		var allVertices = [];
		var allPositions = [
			[[0,1,0], [0,0,0], [0,0,1], [0,1,1]], // -X West
			[[1,1,1], [1,0,1], [1,0,0], [1,1,0]], // +X East
			[[0,0,1], [0,0,0], [1,0,0], [1,0,1]], // -Y Down
			[[0,1,0], [0,1,1], [1,1,1], [1,1,0]], // +Y Up
			[[1,1,0], [1,0,0], [0,0,0], [0,1,0]], // -Z North
			[[0,1,1], [0,0,1], [1,0,1], [1,1,1]]  // +Z South
		];
		const allNormals = [
			[[-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]], // -X West
			[[ 1, 0, 0], [ 1, 0, 0], [ 1, 0, 0], [ 1, 0, 0]], // +X East
			[[ 0,-1, 0], [ 0,-1, 0], [ 0,-1, 0], [ 0,-1, 0]], // -Y Down
			[[ 0, 1, 0], [ 0, 1, 0], [ 0, 1, 0], [ 0, 1, 0]], // +Y Up
			[[ 0, 0,-1], [ 0, 0,-1], [ 0, 0,-1], [ 0, 0,-1]], // -Z North
			[[ 0, 0, 1], [ 0, 0, 1], [ 0, 0, 1], [ 0, 0, 1]]  // +Z South
		];
		var vert;
		var tco;
		for(var i = 0; i < 6; i++) {
			allVertices[i] = [];
			// TODO: Loopify
			var texLims = [
				Math.min(texCoords[i][0][0], texCoords[i][1][0], texCoords[i][2][0], texCoords[i][3][0]),
				Math.min(texCoords[i][0][1], texCoords[i][1][1], texCoords[i][2][1], texCoords[i][3][1]),
				Math.max(texCoords[i][0][0], texCoords[i][1][0], texCoords[i][2][0], texCoords[i][3][0]),
				Math.max(texCoords[i][0][1], texCoords[i][1][1], texCoords[i][2][1], texCoords[i][3][1])
			];
			var texRegion = [
				//[MathHelper.lerp(texLims[0],texLims[2],0.1),MathHelper.lerp(texLims[1],texLims[3],0.1)],
				//[MathHelper.lerp(texLims[0],texLims[2],0.9),MathHelper.lerp(texLims[1],texLims[3],0.9)]
				[texLims[0],texLims[1]], [texLims[2],texLims[3]]
			];
			for(var j = 0; j < 4; j++) {
				vert = new Vertex();
				vert.position =        MathHelper.mapVec(allPositions[i][j], 0, 1, pos1, pos2);
				vert.textureRegion =   texRegion;
				vert.textureCoords =   MathHelper.mapVec(texCoords[i][j], [texLims[0],texLims[1]], [texLims[2],texLims[3]], 0, 1);
				vert.normal =          allNormals[i][j];
				vert.shadeExposure =   exposure;
				vert.color =           color;
				vert.lightmapCoords =  [0,0];
				vert.backfaceVisible = dualSided;
				allVertices[i][j] =    vert;
			}
		}
		var visVertices = [];
		var visIndices = [];
		const faceIndices = [0, 1, 2, 0, 2, 3];
		const faceVerticesCount = 4;
		var indicesOffset = 0;
		for(var i = 0; i < 6; i++) {
			if(!visTable[i]) continue;
			visVertices = visVertices.concat(allVertices[i]);
			// Add indices with offset
			for(var j = 0; j < faceIndices.length; j++) {
				visIndices.push(faceIndices[j]+indicesOffset);
			}
			indicesOffset += faceVerticesCount;
		}
		const vertexData = Vertex.packData(visVertices);
		const indexData = new Uint16Array(visIndices);
		return {vertices:vertexData, indices:indexData};
	}
	static loadShader(gl, type, source) {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			alert("Shader compile error: " + gl.getShaderInfoLog(shader));
			//gl.deleteShader(shader);
			return null;
		}
		return shader;
	}
	static initShaderProgram(gl, vsSource, fsSource) {
		const vertexShader = this.loadShader(gl, gl.VERTEX_SHADER, vsSource);
		const fragmentShader = this.loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
		if((!vertexShader) || (!fragmentShader)) return null;
		const shaderProgram = gl.createProgram();
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);
		if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
			alert('Shader program link error: ' + gl.getProgramInfoLog(shaderProgram));
			return null;
		}
		return shaderProgram;
	}
	static getShaderObject(name, gl, shaderProgram) {
		if(name=="world") {
			const vtxFields = Vertex.dataFields();
			const vtxSize = Vertex.sizeBytes();
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
			const vtxFields = {
				vtxPosition: {offset:0, type:"FLOAT", count:2, norm:false},
				vtxColor:    {offset:8, type:"FLOAT", count:3, norm:false},
			}
			const vtxSize = 20;
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
	}
	static loadTextureFromUrl(glState, url, defaultColor=[0,0,0,1]) {
		const gl = glState.gl;
		var texture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		const level = 0;
		const internalFormat = gl.RGBA;
		const width = 1;
		const height = 1;
		const border = 0;
		const srcFormat = gl.RGBA;
		const srcType = gl.UNSIGNED_BYTE;
		var pixels = new Uint8Array([defaultColor[0]*255,defaultColor[1]*255,defaultColor[2]*255,defaultColor[3]*255]);
		gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, pixels);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		glState.currentTextures[0] = null;
		var image = new Image();
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
	}
	static orderedRotateModel(glState, rotationOrder, rotation) {
		var r; var i;
		for(i in rotationOrder) {
			r = rotationOrder[i];
			if(r == 0) glState.rotateModelX(rotation[0]);
			if(r == 1) glState.rotateModelY(rotation[1]);
			if(r == 2) glState.rotateModelZ(rotation[2]);
		}
	}
	static updateNormalMatrix(modelMatrix, normalMatrix) {
		mat4.transpose(normalMatrix, mat4.invert(normalMatrix, modelMatrix));
	}
	static makeCuboidUV(boxSize, uvTexOrigin, uvTexScale, textureSize=1, flipBottom=false) {
		var originX = uvTexOrigin[0] / textureSize;
		var originY = uvTexOrigin[1] / textureSize;
		var sizeScaleFactor = uvTexScale / textureSize;
		var sizeX = boxSize[0] * sizeScaleFactor;
		var sizeY = boxSize[1] * sizeScaleFactor;
		var sizeZ = boxSize[2] * sizeScaleFactor;
		// Unique UV points left to right, top to bottom
		var A = [sizeZ, 0]; // Top TL
		var B = [sizeZ + sizeX, 0]; // Top TR + Bottom TL
		var C = [sizeZ + sizeX + sizeX, 0]; // Bottom TR
		var D = [sizeZ, sizeZ]; // Top BL + Right TR + Front TL
		var E = [sizeZ + sizeX, sizeZ]; // Top BR + Bottom BL + Front TR + Left TL
		var F = [sizeZ + sizeX + sizeX, sizeZ]; // Bottom BR
		var G = [0, sizeZ]; // Right TL
		var H = [sizeZ + sizeX + sizeZ, sizeZ]; // Left TR, Back TL
		var I = [sizeZ + sizeX + sizeZ + sizeX, sizeZ]; // Back TR
		var J = [0, sizeZ + sizeY]; // Right BL
		var K = [sizeZ, sizeZ + sizeY]; // Right BR, Front BL
		var L = [sizeZ + sizeX, sizeZ + sizeY]; // Front BR, Left BL
		var M = [sizeZ + sizeX + sizeZ, sizeZ + sizeY]; // Left BR, Back BL
		var N = [sizeZ + sizeX + sizeZ + sizeX, sizeZ + sizeY]; // Back BR
		// Anticlockwise from top left
		var faces = [];
		faces[0] = [G, J, K, D]; // -X Right
		faces[1] = [E, L, M, H]; // +X Left
		faces[2] = flipBottom ? [E, B, C, F] : [B, E, F, C]; // -Y Bottom
		faces[3] = [A, D, E, B]; // +Y Top
		faces[4] = [H, M, N, I]; // -Z Back
		faces[5] = [D, K, L, E]; // +Z Front
		for(var i = 0; i < 6; i++) for(var j = 0; j < 4; j++) {
			faces[i][j] = [faces[i][j][0] + originX, faces[i][j][1] + originY];
		}
		return faces;
	}
	static makeGradientBuffers(glState, cs, ce, horizontal=false) {
		const le = MathHelper.isLittleEndian();
		var ob = new ArrayBuffer(6*20);
		var odv = new DataView(ob);
		var bOff = 0;
		var ca = horizontal ? cs : ce;
		var cb = horizontal ? ce : cs;
		odv.setFloat32(bOff, -1, le); bOff += 4;
		odv.setFloat32(bOff, 1, le); bOff += 4;
		odv.setFloat32(bOff, cs[0], le); bOff += 4;
		odv.setFloat32(bOff, cs[1], le); bOff += 4;
		odv.setFloat32(bOff, cs[2], le); bOff += 4;
		odv.setFloat32(bOff, -1, le); bOff += 4;
		odv.setFloat32(bOff, -1, le); bOff += 4;
		odv.setFloat32(bOff, ca[0], le); bOff += 4;
		odv.setFloat32(bOff, ca[1], le); bOff += 4;
		odv.setFloat32(bOff, ca[2], le); bOff += 4;
		odv.setFloat32(bOff, 1, le); bOff += 4;
		odv.setFloat32(bOff, -1, le); bOff += 4;
		odv.setFloat32(bOff, ce[0], le); bOff += 4;
		odv.setFloat32(bOff, ce[1], le); bOff += 4;
		odv.setFloat32(bOff, ce[2], le); bOff += 4;
		odv.setFloat32(bOff, 1, le); bOff += 4;
		odv.setFloat32(bOff, 1, le); bOff += 4;
		odv.setFloat32(bOff, cb[0], le); bOff += 4;
		odv.setFloat32(bOff, cb[1], le); bOff += 4;
		odv.setFloat32(bOff, cb[2], le); bOff += 4;
		var verts = new Uint8Array(ob);
		var inds = new Uint16Array([0,1,3,3,1,2]);
		var bufferPair = glState.createBufferPair();
		glState.bufferData(bufferPair, {vertices:verts, indices:inds});
		return bufferPair;
	}
	static drawGradientBuffers(glState, buffers) {
		glState.useShader("background");
		glState.drawBuffers(buffers);
	}
}

class Vertex {
	position;
	normal;
	color;
	textureRegion;
	textureCoords;
	lightmapCoords;
	shadeExposure;
	backfaceVisible;
	constructor() {
		this.position = [0,0,0];
		this.normal = [0,0,0];
		this.color = [0,0,0,1];
		this.textureRegion = [[0,0],[1,1]];
		this.textureCoords = [0,0];
		this.lightmapCoords = [0,0];
		this.shadeExposure = [1,0];
		this.backfaceVisible = true;
	}
	static sizeBytes() { return 48; }
	static packData(verts) {
		const le = MathHelper.isLittleEndian();
		var outBuffer = new ArrayBuffer(verts.length * this.sizeBytes());
		var odv = new DataView(outBuffer);
		var bOff = 0;
		var vert;
		for(var i = 0; i < verts.length; i++) {
			vert = verts[i];
			// vtxPosition @ 0
			odv.setFloat32(bOff, vert.position[0], le); bOff += 4; // x
			odv.setFloat32(bOff, vert.position[1], le); bOff += 4; // y
			odv.setFloat32(bOff, vert.position[2], le); bOff += 4; // z
			// vtxTextureCoords @ 12
			odv.setFloat32(bOff, vert.textureCoords[0], le); bOff += 4; // x
			odv.setFloat32(bOff, vert.textureCoords[1], le); bOff += 4; // y
			// vtxTextureRegion @ 20
			odv.setInt16(bOff, MathHelper.map(vert.textureRegion[0][0], 0, 1, 0, 65535), le); bOff += 2; // x1
			odv.setInt16(bOff, MathHelper.map(vert.textureRegion[0][1], 0, 1, 0, 65535), le); bOff += 2; // y1
			odv.setInt16(bOff, MathHelper.map(vert.textureRegion[1][0], 0, 1, 0, 65535), le); bOff += 2; // x2
			odv.setInt16(bOff, MathHelper.map(vert.textureRegion[1][1], 0, 1, 0, 65535), le); bOff += 2; // y2
			// vtxNormal @ 28
			odv.setInt16(bOff, MathHelper.map(vert.normal[0], -Math.PI, Math.PI, -32768, 32767), le); bOff += 2; // x
			odv.setInt16(bOff, MathHelper.map(vert.normal[1], -Math.PI, Math.PI, -32768, 32767), le); bOff += 2; // y
			odv.setInt16(bOff, MathHelper.map(vert.normal[2], -Math.PI, Math.PI, -32768, 32767), le); bOff += 2; // z
			// vtxShadeExposure @ 34
			odv.setUint16(bOff, MathHelper.map(vert.shadeExposure[0], 0, 1, 0, 65535), le); bOff += 2;
			odv.setUint16(bOff, MathHelper.map(vert.shadeExposure[1], 0, 1, 0, 65535), le); bOff += 2;
			// vtxColor @ 38
			odv.setUint8(bOff, MathHelper.map(vert.color[0], 0, 1, 0, 255)); bOff += 1; // r
			odv.setUint8(bOff, MathHelper.map(vert.color[1], 0, 1, 0, 255)); bOff += 1; // g
			odv.setUint8(bOff, MathHelper.map(vert.color[2], 0, 1, 0, 255)); bOff += 1; // b
			odv.setUint8(bOff, MathHelper.map(vert.color[3], 0, 1, 0, 255)); bOff += 1; // a
			// vtxLightmapCoords @ 42
			odv.setUint8(bOff, MathHelper.map(vert.lightmapCoords[0], 0, 1, 0, 255)); bOff += 1; // x
			odv.setUint8(bOff, MathHelper.map(vert.lightmapCoords[1], 0, 1, 0, 255)); bOff += 1; // y
			// vtxBackfaceVisible @ 44
			odv.setUint8(bOff, vert.backfaceVisible ? 255 : 0); bOff += 1;
			// PADVAL @ 45
			odv.setUint16(bOff, 0); bOff += 2;
			odv.setUint8(bOff, 0); bOff += 1;
			// END @ 48
		}
		return new Uint8Array(outBuffer);
	}
	static dataFields() {
		return {
			vtxPosition:        {offset:0,  type:"FLOAT",          count:3, norm:false},
			vtxTextureCoords:   {offset:12, type:"FLOAT",          count:2, norm:false},
			vtxTextureRegion:   {offset:20, type:"UNSIGNED_SHORT", count:4, norm:true },
			vtxNormal:          {offset:28, type:"SHORT",          count:3, norm:true },
			vtxShadeExposure:   {offset:34, type:"UNSIGNED_SHORT", count:2, norm:true },
			vtxColor:           {offset:38, type:"UNSIGNED_BYTE",  count:4, norm:true },
			vtxLightmapCoords:  {offset:42, type:"UNSIGNED_BYTE",  count:2, norm:true },
			vtxBackfaceVisible: {offset:44, type:"UNSIGNED_BYTE",  count:1, norm:true }
		};
	}
}

class GlStateManager {
	gl;
	projectionMatrix;
	viewMatrix;
	modelMatrix;
	normalMatrix;
	viewMatrixStack;
	modelMatrixStack;
	currentShaderName;
	lightingModelWorld;
	lightingModelNone;
	currentLighting;
	currentTextures;
	fovy;
	aspectRatio;
	zNear;
	zFar;
	clearDepth;
	angleScale=1;
	backfaceCullingState=false;
	lightingState=false;
	shaders={};
	constructor(gl) {
		this.viewMatrixStack = [];
		this.modelMatrixStack = [];
		this.projectionMatrix = mat4.create();
		this.viewMatrix = mat4.create();
		this.modelMatrix = mat4.create();
		this.normalMatrix = mat4.create();
		// Vanilla block shading with highlight similar to entities
		this.lightingModelWorld = new LightingModel(0.5, MathHelper.length([0.1,0.4,0.3]),
			[0.1,0.4,-0.3],
			[-0.1,0.4,0.3]
		);
		this.lightingModelNone = new LightingModel(1, 0, [0,0,0], [0,0,0]);
		this.gl = gl;
		this.currentTextures = [null,null,null,null];
	}
	resetDrawModes() {
		this.gl.cullFace(this.gl.BACK);
		this.gl.enable(this.gl.DEPTH_TEST);
		this.gl.depthFunc(this.gl.LESS);
		this.gl.enable(this.gl.BLEND);
		this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
		this.gl.sampleCoverage(0.0005, false);
		this.currentTextures = [null,null,null,null];
	}
	perspective(fovy, aspectRatio, zNear, zFar) {
		this.fovy = fovy * this.angleScale;
		this.aspectRatio = aspectRatio;
		this.zNear = zNear;
		this.zFar = zFar;
		this.clearDepth = zFar;
		mat4.perspective(this.projectionMatrix, this.fovy/2, aspectRatio, zNear, zFar);
		this.setProjectionUniform();
	}
	perspectiveWindow(fovy, zNear=0.1, zFar=1000) {
		this.perspective(fovy, this.getWindowSize()[2], zNear, zFar);
	}
	ortho(r=1, t=1) {
		const l=-r;
		const b=-t;
		// TODO: Set some ortho flag?
		mat4.ortho(this.projectionMatrix, l, r, b, t, -100, 100);
		this.clearDepth = 100;
		this.setProjectionUniform();
	}
	orthoWindow(yIsDown=false) {
		const ws = this.getWindowSize();
		this.ortho(ws[0]/2, ws[1]/(yIsDown?-2:2));
	}
	orthoNorm(r=1, t=1, shrink=false) {
		const aspect = this.getWindowSize()[2];
		var rn = r;
		var tn = t;
		if((aspect > 1) == !!shrink) tn /= aspect;
		else rn *= aspect;
		this.ortho(rn, tn);
	}
	getWindowSize() {
		const w = this.gl.canvas.width;
		const h = this.gl.canvas.height;
		return [w, h, w/h];
	}
	degreeMode(on) {
		this.angleScale = on ? (Math.PI / 180) : 1;
	}
	pushView() { this.viewMatrixStack.push(mat4.clone(this.viewMatrix)); }
	popView() { if(this.viewMatrixStack.length) this.viewMatrix = this.viewMatrixStack.pop(); this.setViewUniform(); }
	resetView() { mat4.identity(this.viewMatrix); this.setViewUniform(); }
	translateView(xyz) { mat4.translate(this.viewMatrix, this.viewMatrix, xyz); this.setViewUniform(); }
	rotateViewX(a) { mat4.rotateX(this.viewMatrix, this.viewMatrix, a*this.angleScale); this.setViewUniform(); }
	rotateViewY(a) { mat4.rotateY(this.viewMatrix, this.viewMatrix, a*this.angleScale); this.setViewUniform(); }
	rotateViewZ(a) { mat4.rotateZ(this.viewMatrix, this.viewMatrix, a*this.angleScale); this.setViewUniform(); }
	pushModel() { this.modelMatrixStack.push(mat4.clone(this.modelMatrix)); }
	popModel() { if(this.modelMatrixStack.length) this.modelMatrix = this.modelMatrixStack.pop(); this.setModelUniform(); }
	resetModel() { mat4.identity(this.modelMatrix); this.setModelUniform(); }
	translateModel(xyz) { mat4.translate(this.modelMatrix, this.modelMatrix, xyz); this.setModelUniform(); }
	rotateModelX(a) { mat4.rotateX(this.modelMatrix, this.modelMatrix, a*this.angleScale); this.setModelUniform(); }
	rotateModelY(a) { mat4.rotateY(this.modelMatrix, this.modelMatrix, a*this.angleScale); this.setModelUniform(); }
	rotateModelZ(a) { mat4.rotateZ(this.modelMatrix, this.modelMatrix, a*this.angleScale); this.setModelUniform(); }
	scaleModel(xyz) { mat4.scale(this.modelMatrix, this.modelMatrix, xyz); this.setModelUniform(); }
	loadShader(name, vsh, fsh) {
		var program = RenderHelper.initShaderProgram(this.gl, vsh, fsh);
		if(!program) return false;
		this.shaders[name] = RenderHelper.getShaderObject(name, this.gl, program);
		return true;
	}
	useShader(name) {
		if(!this.shaders[name]) return false;
		this.currentShaderName = name;
		this.gl.useProgram(this.shaders[name].program);
		this.currentTextures = [null,null,null,null];
		if(name=="world") {
			this.useLighting(true);
			this.setLightingUniforms();
			this.setAlphaUniform();
			this.setProjectionUniform();
			this.setViewUniform();
			this.setModelUniform();
			this.setModelAlpha();
		}
		else if(name=="background") {
			// Anything to do?
		}
		return true;
	}
	useLighting(use) {
		if(this.lightingState != use) {
			this.currentLighting = use ? this.lightingModelWorld : this.lightingModelNone;
			this.setLightingUniforms();
			this.lightingState = use;
		}
	}
	setLightingUniforms() {
		const shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniform3fv(shad.uniforms.shade0, this.currentLighting.precalcDiffuse0);
			this.gl.uniform3fv(shad.uniforms.shade1, this.currentLighting.precalcDiffuse1);
			this.gl.uniform1f(shad.uniforms.shadeAmbient, this.currentLighting.ambient);
		}
	}
	setAlphaUniform() {
		const shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniform1f(shad.uniforms.alpha, this.modelAlpha);
		}
	}
	setProjectionUniform() {
		const shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniformMatrix4fv(shad.uniforms.projectionMatrix, false, this.projectionMatrix);
		}
	}
	setViewUniform() {
		const shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniformMatrix4fv(shad.uniforms.viewMatrix, false, this.viewMatrix);
		}
	}
	setModelUniform() {
		RenderHelper.updateNormalMatrix(this.modelMatrix, this.normalMatrix);
		const shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniformMatrix4fv(shad.uniforms.modelMatrix, false, this.modelMatrix);
			this.gl.uniformMatrix4fv(shad.uniforms.normalMatrix, false, this.normalMatrix);
		}
	}
	setShaderAttribs() {
		const shad = this.shaders[this.currentShaderName];
		const attribs = shad.attribs;
		const vsb = shad.vtxSize;
		var attr, field;
		for(var attrInd in attribs) {
			const attr = attribs[attrInd];
			var field = attr.field;
			this.gl.vertexAttribPointer(attr.loc, field.count, this.gl[field.type], field.norm, vsb, field.offset);
			this.gl.enableVertexAttribArray(attr.loc);
		}
	}
	backfaceCulling(use) {
		if(this.backfaceCullingState != use) {
			if(use) this.gl.enable(this.gl.CULL_FACE);
			else this.gl.disable(this.gl.CULL_FACE);
			this.backfaceCullingState = use;
		}
	}
	drawBuffers(buffers) {
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffers.vertices);
		if(buffers.indices) this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
		this.setShaderAttribs();
		this.gl.drawElements(this.gl.TRIANGLES, buffers.size, this.gl.UNSIGNED_SHORT, 0);
	}
	clear(color, doDepth) {
		var clearBits = 0;
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
	}
	bindTexture(unit, texture) {
		if(unit < 0 || unit > 3) return;
		if(this.currentTextures[unit] == texture) return;
		this.gl.activeTexture(this.gl.TEXTURE0+unit);
		this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
		const shad = this.shaders[this.currentShaderName];
		if(this.currentShaderName == "world") {
			this.gl.uniform1i(shad.uniforms.textureSampler, 0);
		}
		this.currentTextures[unit] = texture;
	}
	setModelAlpha(alpha=1) {
		this.modelAlpha = alpha;
	}
	createBufferPair() {
		var vertices = this.gl.createBuffer();
		var indices = this.gl.createBuffer();
		return {vertices:vertices, indices:indices, size:0};
	}
	deleteBufferPair(buffers) {
		this.gl.deleteBuffer(buffers.vertices);
		this.gl.deleteBuffer(buffers.indices);
	}
	bufferData(buffers, data) {
		this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffers.vertices);
		this.gl.bufferData(this.gl.ARRAY_BUFFER, data.vertices, this.gl.STATIC_DRAW);
		this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
		this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, data.indices, this.gl.STATIC_DRAW);
		buffers.size = data.indices.length;
	}
}

class LightingModel {
	ambient;
	diffuse;
	pos0;
	pos1;
	precalcDiffuse0;
	precalcDiffuse1;
	constructor(ambient, diffuse, pos0, pos1) {
		this.ambient = ambient;
		this.diffuse = diffuse;
		this.pos0 = MathHelper.normalize(pos0);
		this.pos1 = MathHelper.normalize(pos1);
		// Precalculate as much information as possible
		this.precalcDiffuse0 = [this.pos0[0]*this.diffuse,this.pos0[1]*this.diffuse,this.pos0[2]*this.diffuse];
		this.precalcDiffuse1 = [this.pos1[0]*this.diffuse,this.pos1[1]*this.diffuse,this.pos1[2]*this.diffuse];
	}
}

class EntityModel {
	position = [0,0,0];
	rotation = [0,0,0];
	scale = [1,1,1];
	rotationOrder = [1,0,2]; // Yaw-pitch-roll
	parts = {};
	textures = [];
	name = "";
	constructor(name="entity") {
		this.name = name;
	}
	addPart(part) {
		this.parts[part.name] = part;
	}
	removePart(part) {
		delete this.parts[part.name];
	}
	render(glState) {
		glState.pushModel();
		glState.translateModel(this.position);
		RenderHelper.orderedRotateModel(glState, this.rotationOrder, this.rotation);
		glState.scaleModel(this.scale); // ??????
		for(var p in this.parts) {
			var part = this.parts[p];
			part.render(glState, this.textures);
		}
		glState.popModel();
	}
	texture(index, tex) {
		this.textures[index] = tex;
	}
	destroy() {
		for(var p in this.parts) {
			this.parts[p].destroy();
			this.parts[p] = null;
		}
	}
}
class PlayerModel extends EntityModel {
	playerParts = {};
	constructor(name="player", thinArms=false) {
		super(name);
		this.scale = [1/32,1/32,1/32];
		var armWidth = thinArms ? 3 : 4;
		var armOffset = thinArms ? 0.5 : 0;
		var partHead = new EntityModelPart("head", this, [0,24,0]); this.playerParts.head = partHead;
		var partBody = new EntityModelPart("body", this, [0,24,0]); this.playerParts.body = partBody;
		var partLegL = new EntityModelPart("legL", this, [2,12,0]); this.playerParts.legL = partLegL;
		var partLegR = new EntityModelPart("legR", this, [-2,12,0]); this.playerParts.legR = partLegR;
		var partArmL = new EntityModelPart("armL", this, [5,22-armOffset,0]); this.playerParts.armL = partArmL;
		var partArmR = new EntityModelPart("armR", this, [-5,22-armOffset,0]); this.playerParts.armR = partArmR;
		var boxHead = new EntityModelBox("main", partHead, [8,8,8], [4,0,4], [0,0,0]);
		var boxBody = new EntityModelBox("main", partBody, [8,12,4], [4,12,2], [0,0,0]);
		var boxLegL = new EntityModelBox("main", partLegL, [4,12,4], [2,12,2], [0,0,0]);
		var boxLegR = new EntityModelBox("main", partLegR, [4,12,4], [2,12,2], [0,0,0]);
		var boxArmL = new EntityModelBox("main", partArmL, [armWidth,12,4], [1,10,2], [0,0,0]);
		var boxArmR = new EntityModelBox("main", partArmR, [armWidth,12,4], [armWidth-1,10,2], [0,0,0]);
		var boxHead2 = boxHead.clone("over", 0.5);
		var boxBody2 = boxBody.clone("over", 0.25);
		var boxLegL2 = boxLegL.clone("over", 0.25);
		var boxLegR2 = boxLegR.clone("over", 0.25);
		var boxArmL2 = boxArmL.clone("over", 0.25);
		var boxArmR2 = boxArmR.clone("over", 0.25);
		boxHead.setTexCoords(RenderHelper.makeCuboidUV([8,8,8], [0,0], 1, 64, true));
		boxBody.setTexCoords(RenderHelper.makeCuboidUV([8,12,4], [16,16], 1, 64, true));
		boxLegL.setTexCoords(RenderHelper.makeCuboidUV([4,12,4], [16,48], 1, 64, true));
		boxLegR.setTexCoords(RenderHelper.makeCuboidUV([4,12,4], [0,16], 1, 64, true));
		boxArmL.setTexCoords(RenderHelper.makeCuboidUV([armWidth,12,4], [32,48], 1, 64, true));
		boxArmR.setTexCoords(RenderHelper.makeCuboidUV([armWidth,12,4], [40,16], 1, 64, true));
		boxHead2.setTexCoords(RenderHelper.makeCuboidUV([8,8,8], [32,0], 1, 64, true));
		boxBody2.setTexCoords(RenderHelper.makeCuboidUV([8,12,4], [16,32], 1, 64, true));
		boxLegL2.setTexCoords(RenderHelper.makeCuboidUV([4,12,4], [0,48], 1, 64, true));
		boxLegR2.setTexCoords(RenderHelper.makeCuboidUV([4,12,4], [0,32], 1, 64, true));
		boxArmL2.setTexCoords(RenderHelper.makeCuboidUV([armWidth,12,4], [48,48], 1, 64, true));
		boxArmR2.setTexCoords(RenderHelper.makeCuboidUV([armWidth,12,4], [40,32], 1, 64, true));
		boxHead2.dualSided = true; boxHead2.innerExposure = 0.5;
		boxBody2.dualSided = true; boxBody2.innerExposure = 0.5;
		boxLegL2.dualSided = true; boxLegL2.innerExposure = 0.5;
		boxLegR2.dualSided = true; boxLegR2.innerExposure = 0.5;
		boxArmL2.dualSided = true; boxArmL2.innerExposure = 0.5;
		boxArmR2.dualSided = true; boxArmR2.innerExposure = 0.5;
	}
	setSkin(skin) {
		this.texture(0, skin);
	}
	render(glState) {
		super.render(glState);
	}
}

class EntityModelPart {
	position;
	offset;
	parentModel;
	glState;
	meshBuffers;
	rotation = [0,0,0];
	rotationOrder = [1,0,2]; // Yaw-pitch-roll
	boxes = {};
	textureNum = 0;
	meshEmpty = true;
	meshDirty = true;
	hasDualSided = false;
	name = "";
	constructor(name="p", parentModel, position=[0,0,0]) {
		this.name = name;
		this.position = position;
		this.offset = [0,0,0];
		this.boxes = [];
		this.parentModel = parentModel;
		if(parentModel) parentModel.addPart(this);
	}
	addBox(box) {
		this.boxes[box.name] = box;
		this.meshDirty = true;
	}
	removeBox(box) {
		delete this.boxes[box.name];
		this.meshDirty = true;
	}
	updateMesh(gl) {
		var meshData=null;
		this.hasDualSided = false;
		for(var b in this.boxes) {
			var box = this.boxes[b];
			if(box.dualSided) this.hasDualSided = true;
			var p1 = [0,0,0];
			var p2 = box.size.slice();
			for(var i = 0; i < 3; i++) {
				p1[i] += /*box.position[i]*/ - box.origin[i];
				p2[i] += /*box.position[i]*/ - box.origin[i];
			}
			var boxMeshData = RenderHelper.makeCube(p1, p2, [1,1,1,1], null, box.texCoords, [box.outerExposure, box.innerExposure], box.dualSided);
			if(meshData) meshData = RenderHelper.concatBufferData(meshData, boxMeshData);
			else meshData = boxMeshData;
		}
		this.meshEmpty = !meshData.indices.length;
		if(!this.meshEmpty) this.glState.bufferData(this.meshBuffers, meshData);
		this.meshDirty = false;
	}
	render(glState, textures) {
		if(glState != this.glState) {
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
	}
	destroy() {
		if(this.glState) this.glState.deleteBufferPair(this.meshBuffers);
		for(var b in this.boxes) this.boxes[b] = null;
	}
}

class EntityModelBox {
	// TODO Add box transforms (rotation, scale) ?
	size;
	origin;
	//position;
	parentPart;
	texCoords = [];
	dualSided = false;
	outerExposure = 1;
	innerExposure = 0;
	name = "";
	constructor(name="b", parentPart, size, origin/*, position*/) {
		this.name = name;
		this.size = size;
		this.origin = origin;
		//this.position = position;
		this.parentPart = parentPart;
		for(var f = 0; f < 6; f++) this.texCoords[f] = [[0,0], [0,1], [1,1], [1,0]];
		if(parentPart) parentPart.addBox(this);
	}
	setTexCoord(face, coords, copyData=false) {
		if(face < 0 || face > 5) return;
		var nc;
		for(var i = 0; i < 4; i++) {
			nc = coords[i];
			if(copyData) nc = nc.slice();
			this.texCoords[face][i] = nc;
		}
		this.parentPart.meshDirty = true;
	}
	setTexCoords(coords, copyData=false) {
		for(var f = 0; f < 6; f++) if(coords[f]) this.setTexCoord(f, coords[f], copyData);
	}
	clone(newName=this.name+"c", sizeDelta=0) {
		var cloneBox = new EntityModelBox(newName, this.parentPart, this.size.slice(), this.origin.slice()/*, this.position*/);
		cloneBox.setTexCoords(this.texCoords, true);
		cloneBox.dualSided = this.dualSided;
		cloneBox.outerExposure = this.outerExposure;
		cloneBox.innerExposure = this.innerExposure;
		cloneBox.size[0] += sizeDelta*2;
		cloneBox.size[1] += sizeDelta*2;
		cloneBox.size[2] += sizeDelta*2;
		cloneBox.origin[0] += sizeDelta;
		cloneBox.origin[1] += sizeDelta;
		cloneBox.origin[2] += sizeDelta;
		return cloneBox;
	}
}