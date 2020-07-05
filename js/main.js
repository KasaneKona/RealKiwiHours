const listenVolume = 0.5;

var renderer;
var audioLoop;

function main() {
	var canvas = document.querySelector("#glCanvas");
	renderer = new Renderer();
	var initSuccess = renderer.initCanvas(canvas);
	if(!initSuccess) {
		alert("Failed to initialize Renderer!");
		return;
	}
	window.addEventListener('resize', resize, false);
	resize();
	audioLoop = new Howl({
		src: ["./static/audio/loop.wav"],
		loop: true,
		volume: listenVolume,
		preload: true,
		onplayerror: function() {
			showAudioWarn();
			audioLoop.once('unlock', hideAudioWarn);
		}
	});
	renderer.initScene();
	audioLoop.play();
	// Hack: onplayerror doesn't work for web audio yet, trigger it manually if audio didn't start after 500ms
	setTimeout(() => {
		if(!audioLoop.playing()) {
			if(!document.getElementById("audioWarnMsg")) {
				audioLoop._onplayerror[0].fn();
			}
		}
	}, 500);
	render(0);
}

function resize() {
	renderer.resize(window.innerWidth, window.innerHeight);
}

// Draw the scene repeatedly
var then = 0;
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

function showAudioWarn() {
	hideAudioWarn();
	var warn = document.createElement("span");
	warn.setAttribute("id", "audioWarnMsg");
	warn.innerText = "Audio may be blocked. Click page to unblock and hide this message.";
	warn.style.color = "white";
	warn.style.fontFamily = "sans-serif";
	warn.style.padding = "4px 6px";
	warn.style.background = "rgba(0,0,0,0.5)";
	warn.style.position = "absolute";
	warn.style.left = 0;
	warn.style.top = 0;
	document.body.appendChild(warn);
	document.addEventListener('click', hideAudioWarn);
}

function hideAudioWarn() {
	var audioWarnMsg = document.getElementById("audioWarnMsg");
	if(audioWarnMsg) audioWarnMsg.parentElement.removeChild(audioWarnMsg);
	document.removeEventListener('click', hideAudioWarn);
}
