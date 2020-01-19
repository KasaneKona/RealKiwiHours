var renderer;
var audioLoop;

function main() {
	var canvas = document.querySelector("#glCanvas");
	renderer = new Renderer();
	var initSuccess = renderer.initCanvas(canvas, aa=false);
	if(!initSuccess) {
		alert("Failed to initialize Renderer!");
		return;
	}
	window.addEventListener('resize', resize, false);
	resize();
	renderer.initScene();
	audioLoop = createAudioLoop("/static/audio/loop.wav", 627200/44100);
}

function resize() {
	renderer.resize(window.innerWidth, window.innerHeight);
}

var then = 0;

// Draw the scene repeatedly
function render(now) {
	now *= 0.001;  // convert to seconds
	const deltaTime = now - then;
	then = now;
	
	if(renderer.renderFrame(deltaTime)) {
		requestAnimationFrame(render);
	} else main(); // Attempt to reload
}

// Run
window.onload = () => {
	main();
}

function createAudioLoop(url, len) {
	audioToLoad++;
	//console.log("Now waiting on "+audioToLoad+" audio files");
	const aud = new Audio('/static/audio/loop.wav');
	var loopObj = {aud:aud, len:len};
	loopObj.readyFunc = () => {
		audioLoaded();
		aud.removeEventListener('canplaythrough', loopObj.readyFunc, false);
	};
	readyListener = aud.addEventListener('canplaythrough', loopObj.readyFunc, false);
	return loopObj;
}

var audioToLoad = 0;
function audioLoaded() {
	audioToLoad--;
	//console.log(audioToLoad+" audio files left to load");
	if(audioToLoad==0) audioReady();
}

function audioReady() {
	console.log("Audio ready");
	requestAnimationFrame(render);
	audioLoop.aud.addEventListener('play', ()=>audioLoopReset(audioLoop), false);
	//audioLoopReset(audioLoop);
	audioLoop.aud.play();
}

function audioLoopReset(loop) {
	//console.log("Resetting audio");
	if(loop.intv) clearInterval(loop.intv);
	loop.aud.currentTime = 0;
	loop.intv = setInterval(()=>{loop.aud.currentTime -= loop.len}, loop.len*1000);
}