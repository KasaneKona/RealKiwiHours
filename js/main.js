var renderer;

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
	requestAnimationFrame(render);
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
		this.animateRequest = requestAnimationFrame(render);
	} else main(); // Attempt to reload
}

// Run
window.onload = () => {
	main();
}