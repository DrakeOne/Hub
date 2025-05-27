// Renderer.js - WebGL renderer management and optimization
class Renderer {
    constructor() {
        this.renderer = null;
        this.canvas = null;
        this.stats = {
            drawCalls: 0,
            triangles: 0,
            fps: 0,
            frameTime: 0
        };
        
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fpsUpdateInterval = 500; // Update FPS every 500ms
        this.lastFpsUpdate = 0;
    }
    
    initialize(canvas) {
        this.canvas = canvas;
        
        // Create Three.js WebGL renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: false, // Disable for better performance
            alpha: false,
            powerPreference: "high-performance",
            stencil: false,
            depth: true
        });
        
        // Configure renderer
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = false; // Shadows disabled for performance
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Set clear color (sky blue)
        this.renderer.setClearColor(0x87CEEB, 1);
        
        // Enable logarithmic depth buffer for better z-fighting prevention
        this.renderer.logarithmicDepthBuffer = true;
        
        // Optimize for mobile
        if (this.isMobile()) {
            this.renderer.setPixelRatio(1);
        }
        
        console.log('[Renderer] Initialized successfully');
        
        return this.renderer;
    }
    
    render(scene, camera) {
        if (!this.renderer || !scene || !camera) return;
        
        // Update stats
        this.updateStats();
        
        // Render the scene
        this.renderer.render(scene, camera);
        
        // Get render info
        const info = this.renderer.info;
        this.stats.drawCalls = info.render.calls;
        this.stats.triangles = info.render.triangles;
    }
    
    updateStats() {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.frameCount++;
        this.stats.frameTime = deltaTime;
        
        // Update FPS counter
        if (currentTime - this.lastFpsUpdate > this.fpsUpdateInterval) {
            this.stats.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
            
            // Update FPS display
            if (window.game) {
                window.game.fps = this.stats.fps;
            }
        }
    }
    
    resize(width, height) {
        if (!this.renderer) return;
        
        this.renderer.setSize(width, height);
        
        // Update camera aspect ratio if game exists
        if (window.game && window.game.camera) {
            window.game.camera.aspect = width / height;
            window.game.camera.updateProjectionMatrix();
        }
    }
    
    handleWindowResize() {
        this.resize(window.innerWidth, window.innerHeight);
    }
    
    setQuality(quality) {
        if (!this.renderer) return;
        
        switch(quality) {
            case 'low':
                this.renderer.setPixelRatio(1);
                break;
            case 'medium':
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
                break;
            case 'high':
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                break;
        }
    }
    
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    getStats() {
        return this.stats;
    }
    
    dispose() {
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = null;
        }
    }
}

// Export for use
window.Renderer = Renderer;