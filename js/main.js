const listenVolume = 0.5;

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
	document.onclick = ()=>{
		var audioWarnMsg = document.getElementById("audioWarnMsg");
		if(audioWarnMsg) audioWarnMsg.parentElement.removeChild(audioWarnMsg);
		var aud = audioLoop.aud;
		if(aud.paused || !aud.played) aud.play(); else aud.pause();
	};
}

function createAudioLoop(url, len) {
	audioToLoad++;
	//console.log("Now waiting on "+audioToLoad+" audio files");
	const aud = new Audio('./static/audio/loop.wav');
	var loopObj = {aud:aud, len:len};
	loopObj.readyFunc = () => {
		audioLoaded();
		aud.removeEventListener('canplay', loopObj.readyFunc, false);
	};
	readyListener = aud.addEventListener('canplay', loopObj.readyFunc, false);
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
	audioLoop.aud.play().catch((e)=>{
		var warn = document.createElement("span");
		warn.setAttribute("id", "audioWarnMsg");
		warn.innerText = "Audio autoplay was blocked. Click page to enable audio.";
		warn.style.color = "white";
		warn.style.fontFamily = "sans-serif";
		warn.style.padding = "4px 6px";
		warn.style.background = "rgba(0,0,0,0.5)";
		warn.style.position = "absolute";
		warn.style.left = 0;
		warn.style.top = 0;
		document.body.appendChild(warn);
	});
}

function audioLoopReset(loop) {
	//console.log("Resetting audio");
	if(loop.intv) clearInterval(loop.intv);
	loop.aud.currentTime = 0;
	audioLoop.aud.volume = listenVolume;
	var loopOffset = Math.min(0.25, (loop.aud.duration - loop.len) / 2);
	setTimeout(()=>{		
		loop.intv = setInterval(()=>{
			loop.aud.currentTime -= loop.len;// minus buffer length?;
			//console.log("Looped");
		}, loop.len*1000);
	}, loopOffset*1000);
}