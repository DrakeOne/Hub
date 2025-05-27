class Game {
    constructor() {
        this.canvas = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.chunkManager = null;
        this.player = null;
        this.skyManager = null;
        this.waterManager = null;
        
        this.lastTime = 0;
        this.frameCount = 0;
        this.fpsTime = 0;
        this.isPaused = false;
        this.blockCount = 0;
        this.showDebug = false;
        this.showDebugOverlay = false; // Nuevo para F3
        this.showTerrainDebug = false; // Nuevo para P
        
        this.time = 0;
        this.fps = 60; // Inicializar FPS
        
        // Para capturar errores
        this.lastError = null;
        this.setupErrorHandling();
        
        // Debug de terreno
        this.terrainDebugElement = null;
        
        // Performance optimizer
        this.performanceOptimizer = window.performanceOptimizer || null;
        
        // Frustum culler
        this.frustumCuller = window.frustumCuller || null;
        
        // Referencias UI
        this.hud = null;
        this.menu = null;
        this.gameRenderer = null;
    }

    setupErrorHandling() {
        window.addEventListener('error', (event) => {
            this.lastError = {
                message: event.message,
                source: event.filename,
                line: event.lineno,
                col: event.colno,
                error: event.error
            };
            console.error('Game Error:', this.lastError);
            this.updateDebugError();
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.lastError = {
                message: event.reason.toString(),
                source: 'Promise',
                error: event.reason
            };
            console.error('Unhandled Promise Rejection:', this.lastError);
            this.updateDebugError();
        });
    }

    updateDebugError() {
        if (this.showDebugOverlay && this.lastError) {
            const errorDiv = document.getElementById('debug-error');
            const errorMessage = document.getElementById('debug-error-message');
            if (errorDiv && errorMessage) {
                errorDiv.style.display = 'block';
                errorMessage.textContent = this.lastError.message;
            }
        }
    }

    init() {
        // Verificar que Three.js esté cargado
        if (typeof THREE === 'undefined') {
            console.error('Three.js no se cargó correctamente');
            document.getElementById('loadingScreen').innerHTML = '<h2>Error al cargar el juego</h2><p>Por favor, recarga la página</p>';
            return false;
        }

        // Inicialización básica
        this.canvas = document.getElementById('gameCanvas');
        this.scene = new THREE.Scene();
        
        // Cámara con FOV de Minecraft (70 grados) y near plane más cercano
        this.camera = new THREE.PerspectiveCamera(
            70, // FOV de Minecraft
            window.innerWidth / window.innerHeight, 
            0.05, // Near plane más cercano para evitar clipping
            1000  // Far plane
        );
        
        // Inicializar renderer usando la clase Renderer
        this.gameRenderer = new Renderer();
        this.renderer = this.gameRenderer.initialize(this.canvas);
        
        if (!this.renderer) {
            console.error('Error al crear el renderer');
            document.getElementById('loadingScreen').innerHTML = '<h2>Error: WebGL no soportado</h2><p>Tu navegador no soporta WebGL</p>';
            return false;
        }
        
        // Fog para mejor rendimiento y atmósfera
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 300);
        
        // Inicializar sistemas
        this.skyManager = new SkyManager();
        this.waterManager = new WaterManager();
        this.chunkManager = new ChunkManager();
        this.player = new Player();
        
        // Inicializar UI
        this.hud = new HUD();
        this.menu = new Menu();
        
        // Setup eventos
        this.setupEvents();
        
        // Inicializar valores del debug overlay
        this.updateDebugOverlay();
        
        // Crear elemento de debug de terreno
        this.createTerrainDebugElement();
        
        // IMPORTANTE: Generar chunks iniciales alrededor del jugador
        console.log('[Game] Generando chunks iniciales...');
        this.chunkManager.updateChunks(this.player.position.x, this.player.position.z);
        
        return true;
    }

    createTerrainDebugElement() {
        this.terrainDebugElement = document.createElement('div');
        this.terrainDebugElement.id = 'terrainDebug';
        this.terrainDebugElement.style.cssText = `
            position: absolute;
            top: 50%;
            left: 10px;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: #0f0;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            padding: 15px;
            border-radius: 5px;
            display: none;
            max-width: 400px;
            max-height: 80vh;
            overflow-y: auto;
            z-index: 999;
            border: 1px solid #0f0;
        `;
        document.body.appendChild(this.terrainDebugElement);
    }

    updateTerrainDebug() {
        if (!this.showTerrainDebug || !this.terrainDebugElement) return;
        
        const playerChunkX = Math.floor(this.player.position.x / this.chunkManager.chunkSize);
        const playerChunkZ = Math.floor(this.player.position.z / this.chunkManager.chunkSize);
        
        let debugInfo = `<h3 style="color: #0f0; margin: 0 0 10px 0;">TERRAIN DEBUG</h3>`;
        debugInfo += `<div style="color: #ff0;">Recording... Press Ñ to stop</div><br>`;
        
        // Información del jugador
        debugInfo += `<strong>Player Info:</strong><br>`;
        debugInfo += `Position: ${this.player.position.x.toFixed(2)}, ${this.player.position.y.toFixed(2)}, ${this.player.position.z.toFixed(2)}<br>`;
        debugInfo += `Camera Y: ${this.camera.position.y.toFixed(2)}<br>`;
        debugInfo += `Current Chunk: ${playerChunkX}, ${playerChunkZ}<br>`;
        debugInfo += `Current Biome: ${this.chunkManager.getBiomeAt(
            Math.floor(this.player.position.x),
            Math.floor(this.player.position.y),
            Math.floor(this.player.position.z)
        )}<br><br>`;
        
        // Información de chunks
        debugInfo += `<strong>Chunk System:</strong><br>`;
        debugInfo += `Loaded Chunks: ${this.chunkManager.chunks.size}<br>`;
        debugInfo += `Render Distance: ${this.chunkManager.renderDistance}<br>`;
        debugInfo += `Total Blocks: ${this.blockCount.toLocaleString()}<br><br>`;
        
        // Información del UnifiedChunkPipeline
        if (window.unifiedChunkPipeline) {
            const pipelineStats = window.unifiedChunkPipeline.getStats();
            debugInfo += `<strong>Unified Pipeline:</strong><br>`;
            debugInfo += `Queue Size: ${pipelineStats.queueSize}<br>`;
            debugInfo += `Chunks Loaded: ${pipelineStats.chunksLoaded}<br>`;
            debugInfo += `Chunks Visible: ${pipelineStats.chunksVisible}<br>`;
            debugInfo += `Cache Hit Rate: ${pipelineStats.cacheHitRate}%<br><br>`;
        }
        
        // Información de chunks cercanos
        debugInfo += `<strong>Nearby Chunks:</strong><br>`;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const cx = playerChunkX + dx;
                const cz = playerChunkZ + dz;
                const key = this.chunkManager.getChunkKey(cx * this.chunkManager.chunkSize, cz * this.chunkManager.chunkSize);
                const chunk = this.chunkManager.chunks.get(key);
                
                if (chunk) {
                    const biome = this.chunkManager.getBiomeAt(
                        cx * this.chunkManager.chunkSize + 8,
                        45,
                        cz * this.chunkManager.chunkSize + 8
                    );
                    debugInfo += `[${cx},${cz}]: ${chunk.data ? chunk.data.blockCount : 0} blocks, ${biome}<br>`;
                } else {
                    debugInfo += `[${cx},${cz}]: Not loaded<br>`;
                }
            }
        }
        
        // Información de generación
        debugInfo += `<br><strong>Generation Info:</strong><br>`;
        debugInfo += `Seed: ${Math.floor(this.chunkManager.seed)}<br>`;
        debugInfo += `Biome Cache Size: ${this.chunkManager.biomeProvider.biomeCache.size}<br>`;
        
        // Información de rendimiento
        debugInfo += `<br><strong>Performance:</strong><br>`;
        debugInfo += `FPS: ${this.fps}<br>`;
        if (performance.memory) {
            debugInfo += `Memory: ${(performance.memory.usedJSHeapSize / 1048576).toFixed(2)} MB<br>`;
        }
        
        // Agregar información del optimizador si está activo
        if (this.performanceOptimizer) {
            const stats = this.performanceOptimizer.getStats();
            debugInfo += `Avg FPS: ${stats.avgFPS}<br>`;
            debugInfo += `Low Performance Mode: ${stats.lowPerformanceMode ? 'ON' : 'OFF'}<br>`;
        }
        
        // Agregar información del frustum culler si está activo
        if (this.frustumCuller) {
            const cullerStats = this.frustumCuller.getStats();
            debugInfo += `<br><strong>Frustum Culling:</strong><br>`;
            debugInfo += `Visible Chunks: ${cullerStats.visibleChunks}/${cullerStats.totalChunks}<br>`;
            debugInfo += `Culled: ${cullerStats.culledChunks} (${cullerStats.efficiency})<br>`;
            debugInfo += `Cache Hit Rate: ${cullerStats.cacheHitRate}<br>`;
        }
        
        this.terrainDebugElement.innerHTML = debugInfo;
    }

    setupEvents() {
        // Window resize - Mejorado para mantener aspecto consistente
        window.addEventListener('resize', () => {
            this.gameRenderer.handleWindowResize();
        });

        // Inventory clicks
        document.querySelectorAll('.inventory-slot').forEach((slot, index) => {
            slot.addEventListener('click', () => {
                this.player.selectedBlock = index + 1;
                this.player.updateInventoryUI();
            });
        });

        // Pause button
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.menu.togglePause();
        });

        // Controles de teclado
        document.addEventListener('keydown', (e) => {
            // ESC para pausar
            if (e.code === 'Escape') {
                this.menu.togglePause();
            }
            
            // F3 para debug overlay
            if (e.code === 'F3') {
                e.preventDefault();
                this.hud.toggleDebug();
                this.showDebugOverlay = this.hud.debugMode;
                
                // Ocultar el debug info anterior si F3 está activo
                if (this.showDebugOverlay) {
                    this.showDebug = false;
                    document.getElementById('debugInfo').classList.remove('show');
                }
                
                // Actualizar valores iniciales
                if (this.showDebugOverlay) {
                    document.getElementById('debug-seed').textContent = Math.floor(this.chunkManager.seed);
                    document.getElementById('debug-render-distance').textContent = this.chunkManager.renderDistance;
                }
            }
            
            // P para iniciar debug de terreno
            if (e.code === 'KeyP') {
                if (!this.showTerrainDebug) {
                    this.showTerrainDebug = true;
                    this.terrainDebugElement.style.display = 'block';
                    this.chunkManager.debugLogger.startLogging();
                    console.log('Terrain debug logging started');
                }
            }
            
            // Ñ para detener debug de terreno y descargar log
            if (e.code === 'Semicolon' || e.key === 'ñ' || e.key === 'Ñ') {
                if (this.showTerrainDebug) {
                    this.showTerrainDebug = false;
                    this.terrainDebugElement.style.display = 'none';
                    
                    // Obtener logs y descargar
                    const logs = this.chunkManager.debugLogger.stopLogging();
                    this.downloadDebugLog(logs);
                    console.log('Terrain debug logging stopped');
                }
            }
            
            // + y - para ajustar render distance
            if (e.code === 'NumpadAdd' || e.code === 'Equal') {
                const newDistance = this.chunkManager.renderDistance + 1;
                this.chunkManager.setRenderDistance(newDistance);
                console.log(`Render distance: ${this.chunkManager.renderDistance}`);
            }
            
            if (e.code === 'NumpadSubtract' || e.code === 'Minus') {
                const newDistance = this.chunkManager.renderDistance - 1;
                this.chunkManager.setRenderDistance(newDistance);
                console.log(`Render distance: ${this.chunkManager.renderDistance}`);
            }
        });

        // Prevenir zoom en móviles
        document.addEventListener('gesturestart', e => e.preventDefault());
        document.addEventListener('gesturechange', e => e.preventDefault());
        
        // Prevenir scroll
        document.body.addEventListener('touchmove', e => {
            if (e.target === this.canvas) {
                e.preventDefault();
            }
        }, { passive: false });
        
        // Detectar orientación en móviles
        if (this.player.isMobile) {
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    this.updateMobileControlsPosition();
                }, 100);
            });
        }
    }

    updateMobileControlsPosition() {
        // Actualizar posición de controles móviles para modo horizontal
        const isLandscape = window.innerWidth > window.innerHeight;
        const mobileControls = document.getElementById('mobileControls');
        const actionButtons = document.getElementById('actionButtons');
        
        if (mobileControls && actionButtons) {
            if (isLandscape) {
                // Modo horizontal - ajustar posiciones
                mobileControls.style.display = 'flex';
                actionButtons.style.display = 'flex';
                mobileControls.style.bottom = '20px';
                mobileControls.style.left = '20px';
                actionButtons.style.bottom = '20px';
                actionButtons.style.right = '20px';
            } else {
                // Modo vertical
                mobileControls.style.display = 'flex';
                actionButtons.style.display = 'flex';
                mobileControls.style.bottom = '100px';
                mobileControls.style.left = '20px';
                actionButtons.style.bottom = '100px';
                actionButtons.style.right = '20px';
            }
        }
    }

    downloadDebugLog(logContent) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `craftworld-debug-${timestamp}.log`;
        
        const blob = new Blob([logContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
    }

    updateDebugOverlay() {
        if (!this.showDebugOverlay) return;
        
        // Usar HUD para actualizar
        if (this.hud) {
            this.hud.update(this);
        }
    }

    animate(currentTime) {
        requestAnimationFrame((time) => this.animate(time));
        
        if (this.isPaused) return;
        
        // Usar el optimizador de rendimiento si está disponible
        if (this.performanceOptimizer && !this.performanceOptimizer.shouldRender(currentTime)) {
            return; // Saltar este frame para mantener FPS estable
        }
        
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        this.time += deltaTime;
        
        // Limitar deltaTime
        const clampedDeltaTime = Math.min(deltaTime, 0.05);
        
        // Update FPS
        this.frameCount++;
        this.fpsTime += deltaTime;
        if (this.fpsTime >= 1.0) {
            this.fps = Math.round(this.frameCount / this.fpsTime);
            document.getElementById('fps').textContent = this.fps;
            
            // Actualizar FPS en el optimizador también
            if (this.performanceOptimizer) {
                this.performanceOptimizer.fps = this.fps;
            }
            
            this.frameCount = 0;
            this.fpsTime = 0;
        }
        
        // Updates
        this.player.update(clampedDeltaTime);
        this.skyManager.update(clampedDeltaTime);
        this.waterManager.update(this.time);
        
        // Update chunks - IMPORTANTE: Esto debe ejecutarse siempre
        const chunkCount = this.chunkManager.updateChunks(this.player.position.x, this.player.position.z);
        
        // Aplicar frustum culling si está disponible
        if (this.frustumCuller && this.chunkManager.chunks.size > 0) {
            this.frustumCuller.cullChunks(
                this.chunkManager.chunks,
                this.chunkManager.chunkSize,
                this.camera
            );
        }
        
        // Update HUD
        document.getElementById('chunks').textContent = chunkCount;
        document.getElementById('blocks').textContent = this.blockCount.toLocaleString();
        document.getElementById('position').textContent = 
            `${Math.floor(this.player.position.x)}, ${Math.floor(this.player.position.y)}, ${Math.floor(this.player.position.z)}`;
        
        // Update HUD completo
        if (this.hud) {
            this.hud.update(this);
        }
        
        // Update terrain debug
        this.updateTerrainDebug();
        
        // Limpiar memoria periódicamente si el optimizador está activo
        if (this.performanceOptimizer && this.frameCount % 600 === 0) { // Cada ~10 segundos a 60 FPS
            this.performanceOptimizer.cleanupUnusedObjects();
        }
        
        // Render usando el renderer
        if (this.gameRenderer) {
            this.gameRenderer.render(this.scene, this.camera);
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    start() {
        // Loading
        let loadProgress = 0;
        const loadingSteps = [
            { progress: 20, message: 'Inicializando motor...' },
            { progress: 40, message: 'Generando terreno 3D...' },
            { progress: 60, message: 'Creando biomas volumétricos...' },
            { progress: 80, message: 'Añadiendo agua y cielo...' },
            { progress: 100, message: '¡Listo!' }
        ];
        
        let currentStep = 0;
        const loadingInterval = setInterval(() => {
            if (currentStep < loadingSteps.length) {
                const step = loadingSteps[currentStep];
                loadProgress = step.progress;
                
                if (this.menu) {
                    this.menu.updateLoadingProgress(loadProgress);
                }
                
                document.getElementById('loadingProgress').textContent = `${loadProgress}% - ${step.message}`;
                currentStep++;
                
                if (loadProgress >= 100) {
                    setTimeout(() => {
                        if (this.menu) {
                            this.menu.showLoadingScreen(false);
                        }
                        document.getElementById('loadingScreen').style.display = 'none';
                        
                        // IMPORTANTE: Forzar una actualización inicial de chunks
                        console.log('[Game] Forzando actualización inicial de chunks...');
                        this.chunkManager.updateChunks(this.player.position.x, this.player.position.z);
                        
                        // Iniciar el loop de animación
                        this.animate(0);
                        
                        // Actualizar controles móviles después de cargar
                        if (this.player.isMobile) {
                            this.updateMobileControlsPosition();
                        }
                    }, 500);
                    clearInterval(loadingInterval);
                }
            }
        }, 400);
    }
}