class ChunkManager {
    constructor() {
        this.chunks = new Map();
        this.chunkSize = CONSTANTS.CHUNK_SIZE;
        this.chunkHeight = CONSTANTS.CHUNK_HEIGHT;
        this.renderDistance = CONSTANTS.RENDER_DISTANCE;
        this.seed = Math.random() * 10000;
        
        // Initialize SimplexNoise
        this.noise = new SimplexNoise(this.seed);
        
        // Initialize 3D biome provider
        this.biomeProvider = new BiomeProvider3D(this.seed);
        
        this.blockTypes = CONSTANTS.BLOCK_TYPES;
        
        // Use object pool if available, otherwise create normally
        this.blockGeometry = window.objectPool ? 
            window.objectPool.getBoxGeometry(1, 1, 1) : 
            new THREE.BoxGeometry(1, 1, 1);
            
        this.materials = {};
        
        // Pre-create materials using pool if available
        for (let type in this.blockTypes) {
            if (this.blockTypes[type]) {
                this.materials[type] = window.objectPool ?
                    window.objectPool.getMaterial('lambert', this.blockTypes[type].color) :
                    new THREE.MeshLambertMaterial({ color: this.blockTypes[type].color });
            }
        }

        // 3D generation parameters
        this.generationParams = CONSTANTS.GENERATION_3D;
        
        // Debug logging system
        this.debugLogger = new ChunkDebugLogger();
        
        // Rendering optimization
        this.frustum = new THREE.Frustum();
        this.cameraMatrix = new THREE.Matrix4();
        
        // Reference to object pool
        this.objectPool = window.objectPool || null;
        
        // Reference to persistence system
        this.blockPersistence = window.blockPersistence || null;
        
        // NUEVO: Sistema de colisiones separado
        this.collisionManager = window.collisionChunkManager || null;
        if (this.collisionManager) {
            this.collisionManager.initialize(this);
            console.log('[ChunkManager] CollisionChunkManager integrado');
        }
        
        // Reference to chunk loader
        this.chunkLoader = window.chunkLoader || null;
        if (this.chunkLoader) {
            this.chunkLoader.onChunkReady = (chunk) => this.onChunkGenerated(chunk);
            console.log('[ChunkManager] ChunkLoader integrado');
        }
        
        // Player velocity tracking for prediction
        this.playerVelocity = { x: 0, z: 0 };
        this.lastPlayerPos = { x: 0, z: 0 };
        this.lastUpdateTime = performance.now();
    }

    getChunkKey(x, z) {
        return `${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`;
    }

    // Calculate 3D density with 3D biomes
    calculateDensity(worldX, worldY, worldZ) {
        // Get 3D biome
        const biomeId = this.biomeProvider.getBiome3D(worldX, worldY, worldZ);
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[biomeId];
        
        // Base density with biome height
        let density = biomeData.baseHeight - worldY;
        
        // Apply biome modifier
        density *= biomeData.densityModifier;
        
        // Primary 3D noise (large forms)
        const primaryNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.primary,
            worldY * this.generationParams.NOISE_SCALES.primary * 0.5,
            worldZ * this.generationParams.NOISE_SCALES.primary
        );
        
        // Secondary 3D noise (medium variations)
        const secondaryNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.secondary + 100,
            worldY * this.generationParams.NOISE_SCALES.secondary * 0.5 + 100,
            worldZ * this.generationParams.NOISE_SCALES.secondary + 100
        );
        
        // Detail 3D noise (small variations)
        const detailNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.detail + 200,
            worldY * this.generationParams.NOISE_SCALES.detail * 0.5 + 200,
            worldZ * this.generationParams.NOISE_SCALES.detail + 200
        );
        
        // Apply noise with amplitudes based on biome height variation
        const heightVar = biomeData.heightVariation;
        density += primaryNoise * this.generationParams.NOISE_AMPLITUDES.primary * heightVar;
        density += secondaryNoise * this.generationParams.NOISE_AMPLITUDES.secondary * heightVar * 0.5;
        density += detailNoise * this.generationParams.NOISE_AMPLITUDES.detail * heightVar * 0.25;
        
        // 3D caves only underground
        if (worldY < biomeData.baseHeight - 5) {
            const caveNoise = this.noise.noise3D(
                worldX * this.generationParams.NOISE_SCALES.cave,
                worldY * this.generationParams.NOISE_SCALES.cave,
                worldZ * this.generationParams.NOISE_SCALES.cave
            );
            
            const caveNoise2 = this.noise.noise3D(
                worldX * this.generationParams.NOISE_SCALES.cave * 2 + 1000,
                worldY * this.generationParams.NOISE_SCALES.cave * 2 + 1000,
                worldZ * this.generationParams.NOISE_SCALES.cave * 2 + 1000
            );
            
            // Swiss cheese cave system
            if (Math.abs(caveNoise) > biomeData.caveThreshold || 
                Math.abs(caveNoise2) > biomeData.caveThreshold * 0.8) {
                density -= 50;
            }
            
            // Spaghetti caves
            const spaghettiCave = Math.abs(caveNoise * caveNoise2);
            if (spaghettiCave > 0.3 && worldY < biomeData.baseHeight - 10) {
                density -= 30;
            }
        }
        
        // Avoid generation below Y=0
        if (worldY < 0) {
            density += Math.abs(worldY) * 2;
        }
        
        return density;
    }

    applySurfaceAndOres(chunk, x, z, worldX, worldZ, columnDensities) {
        let surfaceY = -1;
        
        // Find surface
        for (let y = this.chunkHeight - 1; y >= 0; y--) {
            if (chunk.data.getBlock(x, y, z) !== 0) {
                surfaceY = y;
                break;
            }
        }
        
        if (surfaceY === -1) return;
        
        // Get surface biome
        const surfaceBiome = this.biomeProvider.getBiome3D(worldX, surfaceY, worldZ);
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[surfaceBiome];
        
        // Apply surface blocks
        for (let y = surfaceY; y >= Math.max(0, surfaceY - 5); y--) {
            if (chunk.data.getBlock(x, y, z) === 0) continue;
            
            const depth = surfaceY - y;
            
            if (depth === 0) {
                // Surface
                chunk.data.setBlock(x, y, z, biomeData.surfaceBlock);
            } else if (depth <= 3) {
                // Subsurface
                chunk.data.setBlock(x, y, z, biomeData.subsurfaceBlock);
            }
        }
        
        // Generate ores
        this.generateOres(chunk, x, z, worldX, worldZ);
    }

    generateOres(chunk, x, z, worldX, worldZ) {
        const oreTypes = [
            { type: 5, config: this.generationParams.ORE_DISTRIBUTION.diamond },
            { type: 9, config: this.generationParams.ORE_DISTRIBUTION.emerald },
            { type: 10, config: this.generationParams.ORE_DISTRIBUTION.redstone },
            { type: 11, config: this.generationParams.ORE_DISTRIBUTION.lapis },
            { type: 12, config: this.generationParams.ORE_DISTRIBUTION.gold },
            { type: 13, config: this.generationParams.ORE_DISTRIBUTION.iron }
        ];
        
        for (let { type, config } of oreTypes) {
            for (let y = config.minY; y <= config.maxY && y < this.chunkHeight; y++) {
                if (chunk.data.getBlock(x, y, z) === 0) continue;
                
                // Use noise for ore distribution
                const oreNoise = this.noise.noise3D(
                    worldX * this.generationParams.NOISE_SCALES.ore + type * 1000,
                    y * this.generationParams.NOISE_SCALES.ore,
                    worldZ * this.generationParams.NOISE_SCALES.ore + type * 1000
                );
                
                if (oreNoise > 1 - config.chance * 10) {
                    // Generate ore vein
                    this.generateOreVein(chunk, x, y, z, type, config.veinSize);
                }
            }
        }
    }

    generateOreVein(chunk, startX, startY, startZ, oreType, veinSize) {
        const positions = [[startX, startY, startZ]];
        const placed = new Set([`${startX},${startY},${startZ}`]);
        
        while (positions.length > 0 && placed.size < veinSize) {
            const [x, y, z] = positions.shift();
            
            // Place ore if there's stone
            if (chunk.data.getBlock(x, y, z) === 3) {
                chunk.data.setBlock(x, y, z, oreType);
            }
            
            // Expand to adjacent blocks
            const directions = [
                [1, 0, 0], [-1, 0, 0],
                [0, 1, 0], [0, -1, 0],
                [0, 0, 1], [0, 0, -1]
            ];
            
            for (let [dx, dy, dz] of directions) {
                const nx = x + dx;
                const ny = y + dy;
                const nz = z + dz;
                const nKey = `${nx},${ny},${nz}`;
                
                if (nx >= 0 && nx < this.chunkSize &&
                    ny >= 0 && ny < this.chunkHeight &&
                    nz >= 0 && nz < this.chunkSize &&
                    !placed.has(nKey) &&
                    Math.random() < 0.6) {
                    
                    positions.push([nx, ny, nz]);
                    placed.add(nKey);
                }
            }
        }
    }

    // ACTUALIZADO: Sistema de actualización de chunks funcional
    updateChunks(playerX, playerZ) {
        // Actualizar sistema de colisiones
        if (this.collisionManager) {
            this.collisionManager.updatePlayerPosition(playerX, playerZ);
        }
        
        // Calcular velocidad del jugador
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        
        if (deltaTime > 0 && this.lastPlayerPos.x !== null) {
            this.playerVelocity.x = (playerX - this.lastPlayerPos.x) / deltaTime;
            this.playerVelocity.z = (playerZ - this.lastPlayerPos.z) / deltaTime;
        }
        
        this.lastPlayerPos.x = playerX;
        this.lastPlayerPos.z = playerZ;
        this.lastUpdateTime = currentTime;
        
        const playerChunkX = Math.floor(playerX / this.chunkSize);
        const playerChunkZ = Math.floor(playerZ / this.chunkSize);
        
        // Cargar chunks necesarios
        for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
            for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                
                if (!this.chunks.has(key)) {
                    // Usar ChunkLoader si está disponible
                    if (this.chunkLoader) {
                        this.chunkLoader.queueChunk(chunkX, chunkZ, playerX, playerZ, 
                            (chunk) => this.onChunkGenerated(chunk));
                    }
                }
            }
        }
        
        // Descargar chunks lejanos
        const unloadDistance = this.renderDistance + 2;
        const toRemove = [];
        
        for (const [key, chunk] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            const dx = cx - playerChunkX;
            const dz = cz - playerChunkZ;
            
            if (Math.abs(dx) > unloadDistance || Math.abs(dz) > unloadDistance) {
                toRemove.push(key);
            }
        }
        
        // Remover chunks lejanos
        for (const key of toRemove) {
            const chunk = this.chunks.get(key);
            if (chunk && chunk.mesh) {
                window.game.scene.remove(chunk.mesh);
                // Limpiar geometrías y materiales
                chunk.mesh.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            }
            this.chunks.delete(key);
        }
        
        // Actualizar contador de bloques
        this.updateBlockCount();
        
        return this.chunks.size;
    }
    
    // Callback cuando un chunk es generado
    onChunkGenerated(chunk) {
        const key = `${chunk.x},${chunk.z}`;
        
        // Agregar a la escena
        if (chunk.mesh) {
            window.game.scene.add(chunk.mesh);
        }
        
        // Guardar en el mapa
        this.chunks.set(key, chunk);
        
        // Actualizar contador
        this.updateBlockCount();
    }
    
    // Update block count
    updateBlockCount() {
        if (!window.game) return;
        
        window.game.blockCount = 0;
        this.chunks.forEach(c => {
            if (c && c.data && c.data.blockCount) {
                window.game.blockCount += c.data.blockCount;
            }
        });
    }

    // Update render distance
    setRenderDistance(newDistance) {
        this.renderDistance = Math.max(1, Math.min(10, newDistance));
        
        // Force chunk update
        if (window.game && window.game.player) {
            this.updateChunks(window.game.player.position.x, window.game.player.position.z);
        }
    }

    getBlock(x, y, z) {
        // NUEVO: Usar CollisionChunkManager para física
        if (this.collisionManager) {
            return this.collisionManager.getBlock(x, y, z);
        }
        
        // Fallback al sistema original
        const chunkKey = this.getChunkKey(x, z);
        const chunk = this.chunks.get(chunkKey);
        
        if (chunk && chunk.data) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            
            return chunk.data.getBlock(Math.floor(localX), Math.floor(y), Math.floor(localZ));
        }
        
        return 0;
    }

    setBlock(x, y, z, type) {
        const chunkKey = this.getChunkKey(x, z);
        const chunk = this.chunks.get(chunkKey);
        
        if (chunk && chunk.data) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            
            const changed = chunk.data.setBlock(Math.floor(localX), Math.floor(y), Math.floor(localZ), type);
            
            if (changed) {
                // Record change in persistence system
                if (this.blockPersistence) {
                    this.blockPersistence.recordBlockChange(
                        Math.floor(x), 
                        Math.floor(y), 
                        Math.floor(z), 
                        type, 
                        this.chunkSize
                    );
                }
                
                chunk.isDirty = true;
                
                // Reconstruir mesh
                this.buildChunkMesh(chunk);
                
                // Update adjacent chunks if necessary
                if (localX === 0 || localX === this.chunkSize - 1 || 
                    localZ === 0 || localZ === this.chunkSize - 1) {
                    this.updateAdjacentChunks(x, z);
                }
            }
        }
    }

    updateAdjacentChunks(x, z) {
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        
        directions.forEach(([dx, dz]) => {
            const adjacentKey = this.getChunkKey(x + dx * this.chunkSize, z + dz * this.chunkSize);
            const adjacentChunk = this.chunks.get(adjacentKey);
            
            if (adjacentChunk && !adjacentChunk.isDirty) {
                adjacentChunk.isDirty = true;
                this.buildChunkMesh(adjacentChunk);
            }
        });
    }

    // Get biome at position for HUD
    getBiomeAt(x, y, z) {
        return this.biomeProvider.getBiome3D(x, y, z);
    }
    
    // Construir mesh del chunk
    buildChunkMesh(chunk) {
        // Remover mesh anterior
        if (chunk.mesh) {
            window.game.scene.remove(chunk.mesh);
            chunk.mesh.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        
        // Crear nuevo mesh usando ChunkLoader
        if (this.chunkLoader) {
            this.chunkLoader.buildMeshOptimized(chunk);
            if (chunk.mesh) {
                window.game.scene.add(chunk.mesh);
            }
        }
        
        chunk.isDirty = false;
    }
}

// Chunk debug logging class
class ChunkDebugLogger {
    constructor() {
        this.isLogging = false;
        this.logs = [];
        this.startTime = 0;
        this.maxLogs = 10000;
    }
    
    startLogging() {
        this.isLogging = true;
        this.logs = [];
        this.startTime = performance.now();
        this.log('=== CHUNK DEBUG LOGGING STARTED ===');
    }
    
    stopLogging() {
        this.log('=== CHUNK DEBUG LOGGING STOPPED ===');
        this.log(`Total logging time: ${(performance.now() - this.startTime).toFixed(2)}ms`);
        this.isLogging = false;
        return this.exportLogs();
    }
    
    log(message, data = null) {
        if (!this.isLogging || this.logs.length >= this.maxLogs) return;
        
        const timestamp = (performance.now() - this.startTime).toFixed(2);
        const entry = {
            timestamp,
            message,
            data: data ? JSON.stringify(data) : null
        };
        
        this.logs.push(entry);
    }
    
    logChunkGeneration(x, z, phase, data = null) {
        this.log(`Chunk[${x},${z}] Generation ${phase}`, data);
    }
    
    logMeshBuilding(x, z, phase, data = null) {
        this.log(`Chunk[${x},${z}] Mesh Building ${phase}`, data);
    }
    
    logChunkUpdate(phase, data = null) {
        this.log(`Chunk Update ${phase}`, data);
    }
    
    exportLogs() {
        const logText = this.logs.map(entry => {
            let line = `[${entry.timestamp}ms] ${entry.message}`;
            if (entry.data) {
                line += `\n  Data: ${entry.data}`;
            }
            return line;
        }).join('\n');
        
        return logText;
    }
}