import * as howler from "howler";
import { Renderer } from "./blocky/renderer";

const listenVolume = 0.5;

let rendererInstance;
let audioLoop;

let urlParams = new URLSearchParams(window.location.search);
let shutup = urlParams.has("stfu");

function main() {
	let canvas = document.querySelector("#glCanvas");
	rendererInstance = new Renderer();
	let initSuccess = rendererInstance.initCanvas(canvas);
	if(!initSuccess) {
		alert("Failed to initialize Renderer!");
		return;
	}
	window.addEventListener('resize', resize, false);
	resize();
	if(!shutup) audioLoop = new howler.Howl({
		src: ["./static/audio/loop.wav"],
		loop: true,
		volume: 0,
		// Hack: onplayerror doesn't work for web audio yet, trigger if audio didn't start 200ms after load
		onload: function() {
			console.log("Audio loaded");
			setTimeout(() => {
				console.log("Audio block check...");
				if(!audioLoop.playing()) {
					showAudioWarn();
					audioLoop.once('unlock', hideAudioWarn);
				}
			}, 200);
		},
		onplayerror: function() {
			showAudioWarn();
			audioLoop.once('unlock', hideAudioWarn);
		}
	});
	rendererInstance.initScene();
	if(!shutup) {
		audioLoop.play();
		audioLoop.fade(0, listenVolume, 1000);
	}
	window.audioLoop = audioLoop;
	render();
}

function resize() {
	rendererInstance.resize(window.innerWidth, window.innerHeight);
}

// Draw the scene repeatedly
let then = 0;
function render(now=0) {
	now *= 0.001;  // convert to seconds
	let deltaTime = now - then;
	if(deltaTime < 0) deltaTime = 0;
	then = now;
	if(rendererInstance.renderFrame(deltaTime)) {
		requestAnimationFrame(render);
	} else main(); // Attempt to restart
}

// Run
window.onload = () => {
	main();
}

function showAudioWarn() {
	hideAudioWarn();
	let warn = document.createElement("span");
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
	let audioWarnMsg = document.getElementById("audioWarnMsg");
	if(audioWarnMsg) audioWarnMsg.parentElement.removeChild(audioWarnMsg);
	document.removeEventListener('click', hideAudioWarn);
}

window.stfu = function() { window.location.search = "stfu" };
