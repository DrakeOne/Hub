// HUD.js - Heads Up Display management
class HUD {
    constructor() {
        this.elements = {};
        this.debugMode = false;
        this.initializeElements();
    }
    
    initializeElements() {
        // Get all HUD elements
        this.elements = {
            fps: document.getElementById('fps'),
            chunks: document.getElementById('chunks'),
            blocks: document.getElementById('blocks'),
            position: document.getElementById('position'),
            biome: document.getElementById('biome'),
            velocity: document.getElementById('velocity'),
            grounded: document.getElementById('grounded'),
            input: document.getElementById('input'),
            
            // Debug overlay elements
            debugOverlay: document.getElementById('debugOverlay'),
            debugFps: document.getElementById('debug-fps'),
            debugPosition: document.getElementById('debug-position'),
            debugRotation: document.getElementById('debug-rotation'),
            debugChunk: document.getElementById('debug-chunk'),
            debugChunks: document.getElementById('debug-chunks'),
            debugBlocks: document.getElementById('debug-blocks'),
            debugBiome: document.getElementById('debug-biome'),
            debugFlying: document.getElementById('debug-flying'),
            debugSeed: document.getElementById('debug-seed'),
            debugRenderDistance: document.getElementById('debug-render-distance'),
            debugMemory: document.getElementById('debug-memory'),
            debugError: document.getElementById('debug-error'),
            debugErrorMessage: document.getElementById('debug-error-message')
        };
    }
    
    update(game) {
        if (!game || !game.player) return;
        
        // Update basic HUD
        if (this.elements.fps) {
            this.elements.fps.textContent = game.fps || 0;
        }
        
        if (this.elements.chunks) {
            this.elements.chunks.textContent = game.chunkManager.chunks.size;
        }
        
        if (this.elements.blocks) {
            this.elements.blocks.textContent = game.blockCount || 0;
        }
        
        if (this.elements.position) {
            const pos = game.player.position;
            this.elements.position.textContent = `${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`;
        }
        
        // Update debug overlay if active
        if (this.debugMode) {
            this.updateDebugOverlay(game);
        }
    }
    
    updateDebugOverlay(game) {
        const player = game.player;
        const chunkManager = game.chunkManager;
        
        // FPS
        if (this.elements.debugFps) {
            this.elements.debugFps.textContent = game.fps || 0;
        }
        
        // Position
        if (this.elements.debugPosition) {
            const pos = player.position;
            this.elements.debugPosition.textContent = 
                `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`;
        }
        
        // Rotation
        if (this.elements.debugRotation) {
            const rot = player.rotation;
            const yaw = (rot.y * 180 / Math.PI) % 360;
            const pitch = rot.x * 180 / Math.PI;
            this.elements.debugRotation.textContent = 
                `${yaw.toFixed(1)}°, ${pitch.toFixed(1)}°`;
        }
        
        // Current chunk
        if (this.elements.debugChunk) {
            const chunkX = Math.floor(player.position.x / CONSTANTS.CHUNK_SIZE);
            const chunkZ = Math.floor(player.position.z / CONSTANTS.CHUNK_SIZE);
            this.elements.debugChunk.textContent = `${chunkX}, ${chunkZ}`;
        }
        
        // Loaded chunks
        if (this.elements.debugChunks) {
            this.elements.debugChunks.textContent = chunkManager.chunks.size;
        }
        
        // Total blocks
        if (this.elements.debugBlocks) {
            this.elements.debugBlocks.textContent = game.blockCount || 0;
        }
        
        // Biome
        if (this.elements.debugBiome) {
            const biome = chunkManager.getBiomeAt(
                Math.floor(player.position.x),
                Math.floor(player.position.y),
                Math.floor(player.position.z)
            );
            const biomeData = CONSTANTS.BIOME_3D.BIOMES[biome];
            this.elements.debugBiome.textContent = biomeData?.name || 'Unknown';
        }
        
        // Flying status
        if (this.elements.debugFlying) {
            this.elements.debugFlying.textContent = player.isFlying ? 'Yes' : 'No';
        }
        
        // Seed
        if (this.elements.debugSeed) {
            this.elements.debugSeed.textContent = Math.floor(chunkManager.seed);
        }
        
        // Render distance
        if (this.elements.debugRenderDistance) {
            this.elements.debugRenderDistance.textContent = chunkManager.renderDistance;
        }
        
        // Memory usage
        if (this.elements.debugMemory && performance.memory) {
            const mb = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
            this.elements.debugMemory.textContent = mb;
        }
        
        // Collision system stats
        if (window.collisionSystem) {
            const stats = window.collisionSystem.getStats();
            // Could add more collision stats to debug overlay
        }
    }
    
    toggleDebug() {
        this.debugMode = !this.debugMode;
        if (this.elements.debugOverlay) {
            this.elements.debugOverlay.style.display = this.debugMode ? 'block' : 'none';
        }
    }
    
    showError(error) {
        if (this.elements.debugError && this.elements.debugErrorMessage) {
            this.elements.debugError.style.display = 'block';
            this.elements.debugErrorMessage.textContent = error.message || error;
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                this.elements.debugError.style.display = 'none';
            }, 5000);
        }
    }
}

// Export for use
window.HUD = HUD;